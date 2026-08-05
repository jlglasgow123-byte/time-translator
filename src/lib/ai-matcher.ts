import Anthropic from '@anthropic-ai/sdk'
import type { CalendarEvent, JiraTicket, CatchAllMapping, LearnedMapping, MatchSource, WorkEntry, Confidence, WorkEntryProcessingResult } from '@/types'
import { formatTime, formatDuration } from './timezone'
import { captureAppEvent, captureAppError } from './observability'

const JIRA_KEY_RE = /\b([A-Z]{2,6}-\d+)\b/i

const MODEL = 'claude-haiku-4-5-20251001'

// Module-scope so a single client (and its underlying HTTPS agent) is reused across
// invocations on a warm instance, letting keep-alive avoid a fresh TLS handshake per
// import. Safe to construct at import time: the SDK constructor resolves ANTHROPIC_API_KEY
// via readEnv(), which returns undefined rather than throwing when the var is missing, and
// only fails at request time if auth cannot be resolved. It holds no per-request or
// per-user state — this call site passes no options.
const anthropic = new Anthropic()

// Counts AI-using matchEvents invocations served by this module instance. 1 means this
// invocation was the first on a cold instance and still pays the TLS handshake inside
// apiCallMs; >1 means the client (and any keep-alive connection) was reused. This is what
// makes connection reuse measurable — compare apiCallMaxMs at clientUseCount 1 vs >1.
let clientUseCount = 0

interface AiMatch {
  uid: string
  jiraKey: string
  confidence: Confidence
  reason: string
}

// --- Per-phase timing instrumentation (see Project_Model.md Section 9, import latency) ---
// Added to find out what actually consumes matchEvents' time. Records unconditionally
// (server-side, every import) so we get data across real usage. Purely Date.now() calls —
// no serialisation in hot paths. If this is ever removed, delete this block, the
// `phaseTimings` locals in matchEvents, and `reportPhaseTimings`.
interface BatchPhaseTiming {
  batchIndex: number
  batchSize: number
  promptChars: number
  promptBuildMs: number
  apiCallMs: number
  parseMs: number
  batchTotalMs: number
  // Token usage from message.usage. null (not 0) when the field is absent or malformed —
  // a zero would be indistinguishable from a real measurement of an empty response.
  inputTokens: number | null
  outputTokens: number | null
}

function reportPhaseTimings(summary: {
  totalMs: number
  deterministicMs: number
  clientUseCount: number
  aiWallClockMs: number
  eventCount: number
  nonSkippedCount: number
  unmatchedCount: number
  ticketCount: number
  batchCount: number
  batches: BatchPhaseTiming[]
}) {
  try {
    const { batches } = summary
    const nums = (pick: (b: BatchPhaseTiming) => number) => batches.map(pick)
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)
    const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0)

    const apiCallMsList = nums(b => b.apiCallMs)
    const promptBuildMsList = nums(b => b.promptBuildMs)
    const parseMsList = nums(b => b.parseMs)

    // Token counts: drop nulls so a missing reading never silently reads as 0. If every
    // batch is missing usage, the sums/maxes below are reported as null, not 0.
    const known = (pick: (b: BatchPhaseTiming) => number | null) =>
      batches.map(pick).filter((n): n is number => n !== null)
    const inputTokensList = known(b => b.inputTokens)
    const outputTokensList = known(b => b.outputTokens)
    const orNull = (xs: number[], f: (xs: number[]) => number) => (xs.length ? f(xs) : null)
    const usageMissingBatches = batches.filter(b => b.inputTokens === null || b.outputTokens === null).length

    // ms per output token across the whole AI phase — the number that tells us whether
    // generation time explains the latency floor. Uses the slowest batch's wall clock
    // against that same batch's output tokens would be ideal, but batches overlap, so
    // this uses the max/max pair as the closest single-batch approximation.
    const outputTokensMax = orNull(outputTokensList, max)
    const apiCallMaxMs = max(apiCallMsList)
    const msPerOutputTokenMax =
      outputTokensMax && outputTokensMax > 0
        ? Math.round((apiCallMaxMs / outputTokensMax) * 100) / 100
        : null

    const details = {
      // Wall-clock: these are real elapsed time within matchEvents and are additive.
      totalMs: summary.totalMs,
      deterministicMs: summary.deterministicMs,
      aiWallClockMs: summary.aiWallClockMs,
      // 1 = first AI call on this instance (pays TLS handshake); >1 = client reused.
      clientUseCount: summary.clientUseCount,
      // Aggregate: batches run concurrently via Promise.all, so per-batch durations
      // OVERLAP in wall-clock time. `*MaxMs` approximates the wall-clock contribution
      // of the slowest batch; `*SumMs` is total work across batches and will exceed
      // aiWallClockMs whenever batchCount > 1. Do not add Sum values to totalMs.
      apiCallMaxMs,
      apiCallSumMs: sum(apiCallMsList),
      promptBuildMaxMs: max(promptBuildMsList),
      promptBuildSumMs: sum(promptBuildMsList),
      parseMaxMs: max(parseMsList),
      parseSumMs: sum(parseMsList),
      // Context
      eventCount: summary.eventCount,
      nonSkippedCount: summary.nonSkippedCount,
      unmatchedCount: summary.unmatchedCount,
      ticketCount: summary.ticketCount,
      batchCount: summary.batchCount,
      promptCharsMax: max(nums(b => b.promptChars)),
      promptCharsSum: sum(nums(b => b.promptChars)),
      // Token usage. Same max/sum distinction as the timings: Sum is total work across
      // all batches; Max is the slowest/largest single batch, which is the one that maps
      // onto apiCallMaxMs. null means no batch reported usage — never silently 0.
      //
      // NAMING IS LOAD-BEARING: sanitizeDetails() in observability.ts DELETES any key
      // matching /token|secret|password|cookie|authorization|api[_-]?key/i as a
      // credential-redaction measure. Fields named *Tokens*/*Token* were silently
      // dropped — which is why the first version of this instrumentation reported every
      // token field as NULL while usageMissingBatches read 0 (that key survived, the
      // token keys did not). Use "Toks"/"Tok", which do not match the filter. Do not
      // rename these back to *Token*, and do not weaken the redaction filter.
      inputToksMax: orNull(inputTokensList, max),
      inputToksSum: orNull(inputTokensList, sum),
      outputToksMax: outputTokensMax,
      outputToksSum: orNull(outputTokensList, sum),
      msPerOutputTokMax: msPerOutputTokenMax,
      usageMissingBatches,
      // Per-batch detail. Stringified because sanitizeDetails() in observability.ts
      // collapses nested objects/arrays to '[object]' and truncates strings at 500 chars.
      // Keys are abbreviated so all batches fit inside that 500-char budget: adding the
      // token fields to the verbose form pushed the 4-batch (146-event) case past it and
      // silently lost the last batch. i=batchIndex, n=batchSize, pc=promptChars,
      // pb=promptBuildMs, api=apiCallMs, p=parseMs, t=batchTotalMs, it/ot=input/output tokens.
      perBatch: JSON.stringify(
        batches.map(b => ({
          i: b.batchIndex, n: b.batchSize, pc: b.promptChars, pb: b.promptBuildMs,
          api: b.apiCallMs, p: b.parseMs, t: b.batchTotalMs, it: b.inputTokens, ot: b.outputTokens,
        }))
      ).slice(0, 500),
    }

    console.log('[ai-matcher] phase timings', details)
    captureAppEvent('matchEvents phase timings', 'info', {
      eventType: 'match_events_phase_timings',
      action: 'match_events_timing',
      status: 'success',
      details,
    })
  } catch {
    // Instrumentation must never affect matching.
  }
}

// Returns the best jiraKey from a learned mapping (most frequent), or null if none.
// Also returns whether there was a conflict (same title mapped to multiple keys).
function resolveLearned(learned: LearnedMapping): { jiraKey: string; conflicted: boolean } | null {
  const entries = Object.entries(learned.counts)
  if (entries.length === 0) return null
  entries.sort((a, b) => b[1] - a[1])
  const best = entries[0]
  const conflicted = entries.length > 1 && entries[1][1] > 0
  return { jiraKey: best[0], conflicted }
}

function deterministic(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  learnedMappings: LearnedMapping[],
  defaultProjectKey: string
): { matched: Map<string, { jiraKey: string; confidence: Confidence; reason: string; matchSource: MatchSource }>; unmatched: CalendarEvent[] } {
  const matched = new Map<string, { jiraKey: string; confidence: Confidence; reason: string; matchSource: MatchSource }>()
  const unmatched: CalendarEvent[] = []

  // Index learned mappings by normalised title for fast lookup
  const learnedByTitle = new Map(learnedMappings.map(m => [m.eventTitle.trim().toLowerCase(), m]))

  for (const ev of events) {
    // Priority 1: Jira key in title
    const keyMatch = ev.title.match(JIRA_KEY_RE)
    if (keyMatch) {
      matched.set(ev.uid, { jiraKey: keyMatch[1].toUpperCase(), confidence: 'HIGH', reason: 'Jira key found in event title', matchSource: 'rule' })
      continue
    }

    // Priority 2: explicit catch-all mapping rule
    const titleLower = ev.title.trim().toLowerCase()
    const catchAll = catchAllMappings.find(m => {
      const pattern = m.eventTitle.trim().toLowerCase()
      const type = m.matchType ?? 'equals'
      if (type === 'equals') return titleLower === pattern
      if (type === 'contains') return titleLower.includes(pattern)
      if (type === 'not_contains') return !titleLower.includes(pattern)
      return false
    })
    if (catchAll) {
      matched.set(ev.uid, { jiraKey: catchAll.jiraKey, confidence: 'HIGH', reason: 'You mapped this calendar event to this Jira task using a rule', matchSource: 'rule' })
      continue
    }

    // Priority 3: learned from past approvals
    const learned = learnedByTitle.get(titleLower)
    if (learned) {
      const resolved = resolveLearned(learned)
      if (resolved) {
        const reason = resolved.conflicted
          ? `Previously logged to multiple tickets — using most frequent (${resolved.jiraKey})`
          : `Previously logged to ${resolved.jiraKey}`
        matched.set(ev.uid, { jiraKey: resolved.jiraKey, confidence: resolved.conflicted ? 'MEDIUM' : 'HIGH', reason, matchSource: 'ai' })
        continue
      }
    }

    unmatched.push(ev)
  }

  return { matched, unmatched }
}

// THE SINGLE DECISION POINT for "which events go to the AI".
//
// Both the billing count (countEventsRequiringAi) and the actual AI call path
// (matchEvents) derive their event set from this one function, so the two can no
// longer drift apart. Any new gate on what reaches the model — a minimum duration,
// an event-type filter, anything — goes HERE and is automatically reflected in what
// the user is charged. Do not add such a gate inside matchEvents.
//
// Returns both halves of the deterministic pass because matchEvents needs the
// `matched` map too, and must not run deterministic() twice.
//
// Gates applied, in order:
//  1. `tickets.length === 0` — with no tickets matchEvents skips the AI entirely,
//     so nothing is selected and no usage is charged.
//  2. `autoSkipped` events are excluded.
//  3. Events resolved by deterministic() (Jira key in title, catch-all mapping rule,
//     or learned history) never reach Anthropic.
//
// Order is load-bearing: matchEvents batches `selected` in slices of BATCH, so the
// array order determines batch composition. It is the order of `events` as given,
// which deterministic() preserves.
function selectForAi(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  learnedMappings: LearnedMapping[],
  defaultProjectKey: string
): {
  nonSkipped: CalendarEvent[]
  deterministicMatches: Map<string, { jiraKey: string; confidence: Confidence; reason: string; matchSource: MatchSource }>
  selected: CalendarEvent[]
} {
  const nonSkipped = events.filter(e => !e.autoSkipped)
  const { matched, unmatched } = deterministic(nonSkipped, tickets, catchAllMappings, learnedMappings, defaultProjectKey)
  return {
    nonSkipped,
    deterministicMatches: matched,
    // Gate 1. Kept here rather than as an early return so `deterministicMatches` is
    // still populated when there are no tickets — matchEvents relies on it to build
    // its result rows either way.
    selected: tickets.length === 0 ? [] : unmatched,
  }
}

// The events that will actually be sent to the model. Thin wrapper over selectForAi.
export function selectEventsForAi(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  learnedMappings: LearnedMapping[],
  defaultProjectKey: string
): CalendarEvent[] {
  return selectForAi(events, tickets, catchAllMappings, learnedMappings, defaultProjectKey).selected
}

// How many of these events will actually be sent to the model.
//
// Callers must charge AI usage for THIS number, not for every non-skipped event.
// Events resolved deterministically never reach Anthropic, so charging for them
// overcharged users roughly 10x against their monthly cap.
//
// The usage cap has to be enforced BEFORE the API call, but the true count is only
// known after deterministic matching. Rather than charge-then-refund (which would
// leave a window where the user is over-charged, and could strand the overcharge if
// the process died in between), the route calls this first and matchEvents repeats
// the same selection internally.
//
// The duplicated work is pure in-memory string matching over at most
// MAX_EVENTS_PER_IMPORT events. Benchmarked at ~0.2ms for a worst-case 146-event
// import with 20 mapping rules and 200 learned mappings, against a ~5-12s total
// import — i.e. under 0.01% of the wait. Correct billing is worth that.
export function countEventsRequiringAi(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  defaultProjectKey: string,
  learnedMappings: LearnedMapping[] = []
): number {
  return selectEventsForAi(events, tickets, catchAllMappings, learnedMappings, defaultProjectKey).length
}

export async function matchEvents(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  defaultProjectKey: string,
  learnedMappings: LearnedMapping[] = []
): Promise<WorkEntryProcessingResult> {
  const tStart = Date.now()
  const batchTimings: BatchPhaseTiming[] = []
  let aiWallClockMs = 0

  let clientUseSeq = 0
  // Single decision point — see selectForAi. matchEvents must NOT re-apply its own
  // gates on top of `unmatched`, or billing (which counts the same selection) diverges.
  const { nonSkipped, deterministicMatches, selected: unmatched } =
    selectForAi(events, tickets, catchAllMappings, learnedMappings, defaultProjectKey)
  const deterministicMs = Date.now() - tStart

  const ticketMap = new Map(tickets.map(t => [t.key, t]))
  const aiMatches = new Map<string, AiMatch>()
  let aiUnavailable = false
  let aiUnavailableReason: 'credits_exhausted' | 'auth_failed' | undefined
  // Number of selected (i.e. charged) events that reached the model but came back with
  // nothing because of an Anthropic-side failure. The caller refunds exactly this many.
  let unbilledEventCount = 0

  if (unmatched.length > 0) {
    const client = anthropic
    clientUseSeq = ++clientUseCount

    const BATCH = 50
    const batches: CalendarEvent[][] = []
    for (let i = 0; i < unmatched.length; i += BATCH) batches.push(unmatched.slice(i, i + BATCH))
    const totalBatches = batches.length

    const tAiStart = Date.now()
    const batchResults = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const batchIndex = batchIdx + 1
        const tBatchStart = Date.now()
        const prompt = buildPrompt(batch, tickets, defaultProjectKey, learnedMappings)
        const promptBuildMs = Date.now() - tBatchStart
        const promptChars = prompt.length
        let apiCallMs = 0
        let parseMs = 0
        let inputTokens: number | null = null
        let outputTokens: number | null = null
        const recordBatchTiming = () => {
          batchTimings.push({
            batchIndex,
            batchSize: batch.length,
            promptChars,
            promptBuildMs,
            apiCallMs,
            parseMs,
            batchTotalMs: Date.now() - tBatchStart,
            inputTokens,
            outputTokens,
          })
        }

        let message: Awaited<ReturnType<typeof client.messages.create>>
        const tApiCall = Date.now()
        try {
          message = await client.messages.create({
            model: MODEL,
            max_tokens: 8192,
            system: 'You are a time-logging assistant. Match calendar events to Jira tickets. Respond only with valid JSON — no explanation, no markdown code fences.',
            messages: [{ role: 'user', content: prompt }],
          })
        } catch (apiError) {
          apiCallMs = Date.now() - tApiCall
          recordBatchTiming()
          const status = apiError instanceof Anthropic.APIError ? apiError.status : undefined
          const creditsExhausted = status === 402
          const authFailed = status === 401
          const details = {
            batchIndex,
            totalBatches,
            batchSize: batch.length,
            ticketCount: tickets.length,
            error: apiError instanceof Error ? apiError.message : String(apiError),
          }
          if (creditsExhausted || authFailed) {
            aiUnavailable = true
            aiUnavailableReason = creditsExhausted ? 'credits_exhausted' : 'auth_failed'
          }
          // The whole batch produced nothing and the cause is on the Anthropic side
          // (auth, credits, rate limit, 5xx, network timeout — all land here). The user
          // was charged for these events up front, so mark them all for refund. Cause
          // is deliberately not discriminated: the user got nothing either way.
          unbilledEventCount += batch.length
          console.error('[ai-matcher] Anthropic API call failed', details)
          captureAppError(apiError, {
            eventType: creditsExhausted ? 'ai_credits_exhausted' : authFailed ? 'ai_key_invalid' : 'ai_api_error',
            action: 'ai_match_api_call',
            status: 'failed',
            errorCode: creditsExhausted ? 'ai_credits_exhausted' : authFailed ? 'ai_key_invalid' : 'ai_api_call_failed',
            details,
          })
          return []
        }

        apiCallMs = Date.now() - tApiCall

        // Instrumentation only — must never throw into matching. Anything that isn't a
        // finite number stays null so "missing" is distinguishable from a real zero.
        try {
          const usage = message.usage
          const asCount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
          inputTokens = asCount(usage?.input_tokens)
          outputTokens = asCount(usage?.output_tokens)
        } catch {
          inputTokens = null
          outputTokens = null
        }

        const stopReason = message.stop_reason
        const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
        const tParse = Date.now()
        const parsed = parseAiResponse(raw)
        parseMs = Date.now() - tParse
        recordBatchTiming()

        if (stopReason === 'max_tokens') {
          // Truncation still returns real matches for the events the model got through
          // before the cap, so this is NOT refunded proportionally — the user did get
          // value for the events that came back, and the unmatched remainder falls
          // through to "needs review" rather than being lost. The one exception is a
          // truncation so early that nothing parsed at all, which is indistinguishable
          // from a failed call from the user's side and so is refunded in full.
          if (parsed.length === 0) unbilledEventCount += batch.length
          const details = {
            batchIndex,
            totalBatches,
            batchSize: batch.length,
            ticketCount: tickets.length,
            parsedCount: parsed.length,
            rawLength: raw.length,
            rawPreview: raw.slice(0, 500),
          }
          console.error('[ai-matcher] AI response truncated — hit max_tokens', details)
          captureAppEvent('AI response truncated — hit max_tokens limit', 'error', {
            eventType: 'ai_response_truncated',
            action: 'ai_match_parse',
            status: 'failed',
            errorCode: 'ai_max_tokens_exceeded',
            details,
          })
        } else if (parsed.length === 0) {
          // The call succeeded but nothing usable came back (unparseable or empty
          // response). Same user-visible outcome as an API failure — no matches for a
          // charge — so refund the batch. Note the max_tokens branch above deliberately
          // does NOT refund: truncation still yields partial real matches.
          unbilledEventCount += batch.length
          const details = {
            batchIndex,
            totalBatches,
            batchSize: batch.length,
            ticketCount: tickets.length,
            stopReason,
            rawLength: raw.length,
            rawPreview: raw.slice(0, 500),
          }
          console.warn('[ai-matcher] AI returned no parseable matches', details)
          captureAppEvent('AI returned no parseable matches', 'warning', {
            eventType: 'ai_parse_failed',
            action: 'ai_match_parse',
            status: 'failed',
            errorCode: 'ai_no_parseable_matches',
            details,
          })
        } else {
          const droppedCount = batch.length - parsed.length
          const details = {
            batchIndex,
            totalBatches,
            batchSize: batch.length,
            parsedCount: parsed.length,
            droppedCount,
            stopReason,
          }
          if (droppedCount > 0) {
            console.warn('[ai-matcher] AI matched some but not all events in batch', details)
            captureAppEvent('AI matched some but not all events in batch', 'warning', {
              eventType: 'ai_partial_match',
              action: 'ai_match_parse',
              status: 'partial',
              errorCode: 'ai_partial_parse',
              details,
            })
          } else {
            console.log('[ai-matcher] AI batch matched successfully', details)
            captureAppEvent('AI batch matched successfully', 'info', {
              eventType: 'ai_match_succeeded',
              action: 'ai_match_parse',
              status: 'success',
              details,
            })
          }
        }

        return parsed
      })
    )

    aiWallClockMs = Date.now() - tAiStart

    for (const matches of batchResults) {
      for (const m of matches) aiMatches.set(m.uid, m)
    }
  } else if (tickets.length === 0 && nonSkipped.length > 0) {
    // selectForAi zeroes the selection when there are no tickets, so `unmatched` is
    // empty here by construction — report the pre-gate count for diagnostics.
    const details = {
      unmatchedCount: nonSkipped.length - deterministicMatches.size,
      ticketCount: tickets.length,
    }
    console.warn('[ai-matcher] skipping AI matching because no Jira tickets were available', details)
    captureAppEvent('AI matching skipped because no Jira tickets were available', 'warning', {
      eventType: 'ai_match_skipped',
      action: 'ai_match',
      status: 'skipped_no_tickets',
      errorCode: 'ai_match_no_jira_tickets',
      details,
    })
  }

  const workEntries: WorkEntry[] = []
  const jiraMatchesByWorkEntryId: WorkEntryProcessingResult['jiraMatchesByWorkEntryId'] = {}

  for (const ev of events) {
    const isSkipped = ev.autoSkipped

    let jiraKey = ''
    let confidence: Confidence = 'LOW'
    let reason = ''
    let jiraDescription = ''
    let matchSource: MatchSource = 'none'

    if (!isSkipped) {
      const det = deterministicMatches.get(ev.uid)
      const ai = aiMatches.get(ev.uid)

      if (det) {
        jiraKey = det.jiraKey
        confidence = det.confidence
        reason = det.reason
        matchSource = det.matchSource
      } else if (ai) {
        jiraKey = ai.jiraKey
        confidence = ai.confidence
        reason = ai.reason
        matchSource = 'ai'
      } else {
        // With no default project there is nothing to guess a key from — leave it
        // blank rather than inventing one, and say why.
        jiraKey = defaultProjectKey ? `${defaultProjectKey}-?` : ''
        confidence = 'LOW'
        reason = defaultProjectKey ? 'No match found' : 'No default Jira Project'
        matchSource = 'none'
      }

      const ticket = ticketMap.get(jiraKey)
      jiraDescription = ticket?.summary ?? ''
    }

    workEntries.push({
      id: ev.uid,
      date: ev.dateLabel,
      dayLabel: ev.dayLabel,
      startTime: formatTime(ev.startLocal),
      durationSeconds: ev.durationSeconds,
      durationDisplay: formatDuration(ev.durationSeconds),
      calendarEventTitle: ev.title,
      logToggle: isSkipped ? 'skip' : 'log',
      autoSkipped: isSkipped,
      autoSkipSource: ev.autoSkipSource,
      skipReason: ev.skipReason,
    })

    jiraMatchesByWorkEntryId[ev.uid] = {
      suggestedJiraKey: jiraKey,
      jiraTaskDescription: jiraDescription,
      confidence,
      matchReason: reason,
      matchSource,
    }
  }

  reportPhaseTimings({
    totalMs: Date.now() - tStart,
    deterministicMs,
    clientUseCount: clientUseSeq,
    aiWallClockMs,
    eventCount: events.length,
    nonSkippedCount: nonSkipped.length,
    unmatchedCount: unmatched.length,
    ticketCount: tickets.length,
    batchCount: batchTimings.length,
    batches: batchTimings,
  })

  return { workEntries, jiraMatchesByWorkEntryId, aiUnavailable, aiUnavailableReason, unbilledEventCount }
}

function buildPrompt(events: CalendarEvent[], tickets: JiraTicket[], defaultProjectKey: string, learnedMappings: LearnedMapping[]): string {
  // Only include tickets from projects referenced in this batch — keeps prompt small
  // Empty when no default project is set — an empty entry would match nothing anyway.
  const batchProjectKeys = new Set<string>(defaultProjectKey ? [defaultProjectKey] : [])
  const KEY_RE = /\b([A-Z]{2,6})-\d+\b/gi
  for (const ev of events) {
    for (const m of ev.title.matchAll(KEY_RE)) batchProjectKeys.add(m[1].toUpperCase())
  }
  const relevantTickets = tickets.filter(t => batchProjectKeys.has(t.key.split('-')[0]))
  // Status is included because the ticket list now contains recently-closed tickets
  // as well as open ones (see fetchOpenTickets). Without it the model cannot tell
  // them apart and has no basis for preferring an open ticket.
  // Deliberately the *category* ("To Do" / "In Progress" / "Done") rather than the
  // status name: names are workflow-specific ("Shipped", "Parked", "Won't Do") and
  // the model would be guessing which ones mean closed. The category is uniform.
  // Omit `status` entirely rather than falling back to the workflow-specific name:
  // the rules below tell the model the values are "To Do"/"In Progress"/"Done", so
  // emitting "Shipped" or "Parked" here would make the prompt misdescribe its own
  // input — worse than sending no status at all.
  const ticketList = relevantTickets.map(t => (
    t.statusCategory
      ? { key: t.key, summary: t.summary, status: t.statusCategory }
      : { key: t.key, summary: t.summary }
  ))
  const eventList = events.map(e => ({ uid: e.uid, title: e.title, durationSeconds: e.durationSeconds }))

  // Build a concise learned-history hint for events in this batch
  const eventTitlesInBatch = new Set(events.map(e => e.title.trim().toLowerCase()))
  const relevantLearned = learnedMappings.filter(m => eventTitlesInBatch.has(m.eventTitle.trim().toLowerCase()))
  const learnedSection = relevantLearned.length > 0
    ? `\nUser's past logging history (use as strong hints for confidence):\n${relevantLearned.map(m => {
        const sorted = Object.entries(m.counts).sort((a, b) => b[1] - a[1])
        return `  "${m.eventTitle}" → ${sorted.map(([k, n]) => `${k} (×${n})`).join(', ')}`
      }).join('\n')}\n`
    : ''

  return `Match each calendar event to the most relevant Jira ticket.

${defaultProjectKey ? `Default project key: ${defaultProjectKey}\n` : ''}Available tickets (mostly open; recently-closed ones are included because time is often logged after the work finished):
${JSON.stringify(ticketList, null, 2)}
${learnedSection}
Calendar events to match:
${JSON.stringify(eventList, null, 2)}

Rules:
- If you are confident the event relates to a specific ticket, return that key with HIGH confidence.
- If the event relates to general project work but no specific ticket is clear, return the most relevant ticket with MEDIUM confidence.
- If you cannot make a reasonable match, pick the closest ticket and return LOW confidence.
- Only use keys from the provided ticket list. Do not invent keys.
- Where a ticket has a "status" field it is the Jira status category: "To Do" or "In Progress" means open, "Done" means closed. If an open and a closed ticket fit an event equally well, prefer the open one. Only pick a "Done" ticket when it is clearly the better match. Tickets with no "status" field carry no open/closed signal — judge them on relevance alone.

Return a JSON array. Each item must have exactly these fields:
{
  "uid": "<event uid>",
  "jiraKey": "<PROJ-123>",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reason": "<one sentence>"
}`
}

function parseAiResponse(raw: string): AiMatch[] {
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim()
    const jsonLike = cleaned.includes('[') && cleaned.includes(']')
      ? cleaned.slice(cleaned.indexOf('['), cleaned.lastIndexOf(']') + 1)
      : cleaned
    const arr = JSON.parse(jsonLike)
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (m): m is AiMatch =>
        typeof m.uid === 'string' &&
        typeof m.jiraKey === 'string' &&
        (m.confidence === 'HIGH' || m.confidence === 'MEDIUM' || m.confidence === 'LOW') &&
        typeof m.reason === 'string'
    ).map(m => ({ ...m, jiraKey: m.jiraKey.toUpperCase() }))
  } catch {
    return []
  }
}
