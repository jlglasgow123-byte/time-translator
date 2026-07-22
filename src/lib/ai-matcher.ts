import Anthropic from '@anthropic-ai/sdk'
import type { CalendarEvent, JiraTicket, CatchAllMapping, LearnedMapping, MatchSource, WorkEntry, Confidence, WorkEntryProcessingResult } from '@/types'
import { formatTime, formatDuration } from './timezone'
import { captureAppEvent, captureAppError } from './observability'

const JIRA_KEY_RE = /\b([A-Z]{2,6}-\d+)\b/i

const MODEL = 'claude-haiku-4-5-20251001'

interface AiMatch {
  uid: string
  jiraKey: string
  confidence: Confidence
  reason: string
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

export async function matchEvents(
  events: CalendarEvent[],
  tickets: JiraTicket[],
  catchAllMappings: CatchAllMapping[],
  defaultProjectKey: string,
  learnedMappings: LearnedMapping[] = []
): Promise<WorkEntryProcessingResult> {
  const nonSkipped = events.filter(e => !e.autoSkipped)
  const { matched: deterministicMatches, unmatched } = deterministic(nonSkipped, tickets, catchAllMappings, learnedMappings, defaultProjectKey)

  const ticketMap = new Map(tickets.map(t => [t.key, t]))
  const aiMatches = new Map<string, AiMatch>()
  let aiUnavailable = false
  let aiUnavailableReason: 'credits_exhausted' | 'auth_failed' | undefined

  if (unmatched.length > 0 && tickets.length > 0) {
    const client = new Anthropic()

    const BATCH = 50
    const batches: CalendarEvent[][] = []
    for (let i = 0; i < unmatched.length; i += BATCH) batches.push(unmatched.slice(i, i + BATCH))
    const totalBatches = batches.length

    const batchResults = await Promise.all(
      batches.map(async (batch, batchIdx) => {
        const batchIndex = batchIdx + 1
        const prompt = buildPrompt(batch, tickets, defaultProjectKey, learnedMappings)

        let message: Awaited<ReturnType<typeof client.messages.create>>
        try {
          message = await client.messages.create({
            model: MODEL,
            max_tokens: 8192,
            system: 'You are a time-logging assistant. Match calendar events to Jira tickets. Respond only with valid JSON — no explanation, no markdown code fences.',
            messages: [{ role: 'user', content: prompt }],
          })
        } catch (apiError) {
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

        const stopReason = message.stop_reason
        const raw = message.content[0]?.type === 'text' ? message.content[0].text : ''
        const parsed = parseAiResponse(raw)

        if (stopReason === 'max_tokens') {
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

    for (const matches of batchResults) {
      for (const m of matches) aiMatches.set(m.uid, m)
    }
  } else if (unmatched.length > 0) {
    const details = {
      unmatchedCount: unmatched.length,
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
        jiraKey = `${defaultProjectKey}-?`
        confidence = 'LOW'
        reason = 'No match found'
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

  return { workEntries, jiraMatchesByWorkEntryId, aiUnavailable, aiUnavailableReason }
}

function buildPrompt(events: CalendarEvent[], tickets: JiraTicket[], defaultProjectKey: string, learnedMappings: LearnedMapping[]): string {
  // Only include tickets from projects referenced in this batch — keeps prompt small
  const batchProjectKeys = new Set<string>([defaultProjectKey])
  const KEY_RE = /\b([A-Z]{2,6})-\d+\b/gi
  for (const ev of events) {
    for (const m of ev.title.matchAll(KEY_RE)) batchProjectKeys.add(m[1].toUpperCase())
  }
  const relevantTickets = tickets.filter(t => batchProjectKeys.has(t.key.split('-')[0]))
  const ticketList = relevantTickets.map(t => ({ key: t.key, summary: t.summary }))
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

  return `Match each calendar event to the most relevant open Jira ticket.

Default project key: ${defaultProjectKey}
Open tickets:
${JSON.stringify(ticketList, null, 2)}
${learnedSection}
Calendar events to match:
${JSON.stringify(eventList, null, 2)}

Rules:
- If you are confident the event relates to a specific ticket, return that key with HIGH confidence.
- If the event relates to general project work but no specific ticket is clear, return the most relevant ticket with MEDIUM confidence.
- If you cannot make a reasonable match, pick the closest ticket and return LOW confidence.
- Only use keys from the provided ticket list. Do not invent keys.

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
