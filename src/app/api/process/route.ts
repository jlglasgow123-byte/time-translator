import { NextRequest, NextResponse } from 'next/server'
import { parseIcs, getCalendarName } from '@/lib/ics-parser'
import { fetchOpenTickets, fetchIssue } from '@/lib/jira-client'
import { matchEvents } from '@/lib/ai-matcher'
import { JIRA_CONNECTION_REQUIRED_MESSAGE, getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { createClient } from '@/lib/supabase/server'
import { consumeAiUsage, refundAiUsage } from '@/lib/supabase/usage'
import { completeImportRun, failImportRun, startImportRun } from '@/lib/supabase/import-runs'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'
import { checkRateLimit } from '@/lib/rate-limit'
import { backfillLearnedMappings } from '@/lib/supabase/learned-mappings'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'
import { getUserEntitlement } from '@/lib/billing/entitlements'
import {
  AI_CALLS_PER_MINUTE_PER_USER,
  MAX_EVENTS_PER_IMPORT,
  MAX_ICS_FILE_BYTES,
  MAX_JIRA_TICKETS_PER_FETCH,
  formatBytes,
} from '@/lib/security-limits'
import type { CatchAllMapping, ImportMode, JiraMatchesByWorkEntryId, LearnedMapping, SkipRule, JiraTicket, AiUnavailableReason } from '@/types'

const KEY_PREFIX_RE = /\b([A-Z]{2,6})-\d+\b/gi
const SPECIFIC_KEY_RE = /\b([A-Z]{2,6}-\d+)\b/gi

export async function POST(req: NextRequest) {
  const t0 = Date.now()
  const lap = (label: string) => console.log(`[process] ${label}: +${Date.now() - t0}ms`)

  const requestId = requestIdFromHeaders(req.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  lap('auth')

  // Mutually exclusive: if Google Calendar is connected, ICS upload is disabled.
  // The UI hides the upload control in GCal mode, but this is the authoritative check.
  const { data: gcalCreds } = await supabase
    .from('google_calendar_credentials')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (gcalCreds) {
    return NextResponse.json(
      { error: "You're set up with Google Calendar sync. Disconnect it in Settings to upload .ics files instead." },
      { status: 409 }
    )
  }

  let importRunId: string | null = null

  try {
    const formData = await req.formData()
    const mode = ((formData.get('mode') as string) ?? 'jira') as ImportMode

    const file = formData.get('file') as File | null
    const startDate = (formData.get('startDate') as string) ?? ''
    const endDate = (formData.get('endDate') as string) ?? ''
    const timezone = (formData.get('timezone') as string) || 'Australia/Sydney'
    const catchAllRaw = (formData.get('catchAllMappings') as string) ?? '[]'
    const learnedRaw = (formData.get('learnedMappings') as string) ?? '[]'
    const skipRulesRaw = (formData.get('skipRules') as string) ?? ''
    const excludeWeekends = formData.get('excludeWeekends') === 'true'
    const defaultProjectKey = (formData.get('defaultProjectKey') as string) ?? 'DOC'
    const includedIssueTypesRaw = (formData.get('includedIssueTypes') as string) ?? '[]'

    // Jira credentials are only needed for the jira workflow — fetch once and reuse below
    let jiraCreds: Awaited<ReturnType<typeof getJiraCreds>> | null = null
    if (mode === 'jira') {
      jiraCreds = await getJiraCreds()
      if (isCredsError(jiraCreds)) {
        const response = credsErrorResponse(jiraCreds)
        if (response.status === 400) {
          return NextResponse.json({ error: JIRA_CONNECTION_REQUIRED_MESSAGE }, { status: 400 })
        }
        return response
      }
    }
    lap('jira creds')

    captureAppEvent('Import started', 'info', {
      eventType: 'import_started',
      userId: user.id,
      requestId,
      route: '/api/process',
      action: 'import_process',
      status: 'started',
      details: { startDate, endDate, timezone, defaultProjectKey, excludeWeekends, fileSize: file?.size ?? 0 },
    })

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Date range required' }, { status: 400 })
    if (file.size > MAX_ICS_FILE_BYTES) {
      return NextResponse.json(
        { error: `ICS file is too large. Maximum size is ${formatBytes(MAX_ICS_FILE_BYTES)}.` },
        { status: 413 }
      )
    }

    const buffer = await file.arrayBuffer()
    const icsText = Buffer.from(buffer).toString('utf-8')
    const fileCalName = getCalendarName(icsText)
    const calendarName = fileCalName ?? ''

    // Fetch linked calendars + entitlement in parallel — both needed for calendar validation
    const [{ data: linkedCalendars }, calendarEntitlement] = await Promise.all([
      supabase.from('linked_calendars').select('calendar_name').eq('user_id', user.id),
      getUserEntitlement(supabase, user.id),
    ])
    lap('linkedCalendars + entitlement')

    if (calendarEntitlement.tier !== 'free_trial') {
      if (!linkedCalendars || linkedCalendars.length === 0) {
        return NextResponse.json(
          { error: 'No calendar linked. Go to Settings to link your calendar before importing.' },
          { status: 400 }
        )
      }

      if (fileCalName) {
        const match = linkedCalendars.some(c =>
          fileCalName.toLowerCase().includes(c.calendar_name.toLowerCase()) ||
          c.calendar_name.toLowerCase().includes(fileCalName.toLowerCase())
        )
        if (!match) {
          const linkedNames = linkedCalendars.map(c => c.calendar_name).join(', ')
          const isPro = calendarEntitlement.tier === 'paid_single_user'
          return NextResponse.json(
            {
              error: isPro
                ? `Your calendar is set to "${linkedNames}" but this import is for "${fileCalName}". To import from multiple calendars, upgrade to Max Power.`
                : `This import is for "${fileCalName}" which is not in your linked calendars (${linkedNames}).`,
            },
            { status: 400 }
          )
        }
      }
    }

    try {
      importRunId = await startImportRun(supabase, {
        userId: user.id,
        startDate,
        endDate,
        timezone,
        calendarName,
        fileSizeBytes: file.size,
      })
    } catch (error) {
      captureAppError(error, {
        eventType: 'import_run_start_failed',
        userId: user.id,
        requestId,
        route: '/api/process',
        action: 'start_import_run',
        status: 'failed',
        errorCode: 'import_run_start_failed',
      })
    }

    let catchAllMappings: CatchAllMapping[] = []
    try { catchAllMappings = JSON.parse(catchAllRaw) } catch { /* use empty */ }
    let clientLearnedMappings: LearnedMapping[] = []
    try { clientLearnedMappings = JSON.parse(learnedRaw) } catch { /* use empty */ }
    // Server-side learned mappings are the source of truth. Any mappings still only
    // in localStorage (pre-migration browsers) are backfilled in on first contact.
    const learnedMappings = await backfillLearnedMappings(supabase, user.id, clientLearnedMappings)
    lap('learnedMappings')
    let skipRules: SkipRule[] = DEFAULT_SKIP_RULES
    try { if (skipRulesRaw) skipRules = JSON.parse(skipRulesRaw) } catch { /* use defaults */ }
    let includedIssueTypes: string[] = [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES]
    try {
      const parsed = JSON.parse(includedIssueTypesRaw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        includedIssueTypes = parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      }
    } catch {
      // use defaults
    }

    const events = parseIcs({ icsText, calendarName, startDate, endDate, timezone, catchAllMappings, skipRules, excludeWeekends })
    if (!events.length) return NextResponse.json({ error: 'No events found in the selected date range.' }, { status: 400 })
    if (events.length > MAX_EVENTS_PER_IMPORT) {
      return NextResponse.json(
        { error: `Too many calendar events. Import up to ${MAX_EVENTS_PER_IMPORT} events at a time.` },
        { status: 413 }
      )
    }

    let workEntries
    let jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId

    if (mode === 'csv') {
      // CSV-only: apply deterministic rules only (no Jira tickets → no AI), no usage consumption
      const result = await matchEvents(events, [], catchAllMappings, defaultProjectKey, learnedMappings)
      workEntries = result.workEntries
      jiraMatchesByWorkEntryId = {}

      if (importRunId) {
        try {
          await completeImportRun(supabase, { importRunId, userId: user.id, events, jiraMatchesByWorkEntryId: {}, durationMs: Date.now() - t0 })
        } catch { /* non-fatal */ }
      }

      captureAppEvent('CSV import processed successfully', 'info', {
        eventType: 'import_succeeded',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/process',
        action: 'import_process',
        status: 'success',
        details: { eventCount: events.length, mode: 'csv' },
      })

      return NextResponse.json({ workEntries, jiraMatchesByWorkEntryId, mode: 'csv', calendarName })
    }

    // --- Jira path ---

    // Creds already fetched and validated above — no second DB round-trip needed
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const creds = jiraCreds! as import('@/lib/jira-client').JiraCredentials

    // Collect all project key prefixes from event titles
    const projectKeys = new Set<string>([defaultProjectKey])
    for (const ev of events) {
      for (const m of ev.title.matchAll(KEY_PREFIX_RE)) projectKeys.add(m[1].toUpperCase())
    }

    // Entitlement already fetched above — reuse it; just fetch tickets here
    const ticketResult = await fetchOpenTickets(creds, Array.from(projectKeys), includedIssueTypes, MAX_JIRA_TICKETS_PER_FETCH)
    const entitlement = calendarEntitlement
    lap('fetchOpenTickets')

    const jiraTickets: JiraTicket[] = ticketResult.tickets
    const ticketsTruncated = ticketResult.truncated
    const ticketMap = new Map(jiraTickets.map(t => [t.key, t]))

    // Look up any specific keys from event titles that weren't in the bulk fetch
    const missingKeys = new Set<string>()
    for (const ev of events) {
      for (const m of ev.title.matchAll(SPECIFIC_KEY_RE)) {
        const jiraKey = m[1].toUpperCase()
        if (!ticketMap.has(jiraKey)) missingKeys.add(jiraKey)
      }
    }
    if (missingKeys.size > 0) {
      const lookups = await Promise.allSettled(
        Array.from(missingKeys).map(key => fetchIssue(creds, key))
      )
      for (const result of lookups) {
        if (result.status === 'fulfilled' && result.value?.key) {
          jiraTickets.push({ key: result.value.key, summary: result.value.summary ?? '', status: '' })
        }
      }
      lap(`missing key lookups (${missingKeys.size})`)
    }

    const period = new Date().toISOString().slice(0, 7)
    const tier = entitlement.tier
    const limit = entitlement.monthlyAiLimit
    const eventsToMatch = events.filter(e => !e.autoSkipped).length

    if (!entitlement.canUseAi && eventsToMatch > 0) {
      captureAppEvent('AI entitlement blocked', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/process',
        action: 'ai_entitlement',
        status: 'blocked',
        errorCode: 'ai_entitlement_blocked',
        details: { tier, entitlementStatus: entitlement.status, reason: entitlement.reason },
      })
      return NextResponse.json(
        { error: entitlement.reason ?? 'Your plan does not currently allow AI matching.' },
        { status: 402 }
      )
    }

    const minuteLimit = await checkRateLimit(`ai:${user.id}`, AI_CALLS_PER_MINUTE_PER_USER, 60, eventsToMatch)

    if (!minuteLimit.allowed) {
      captureAppEvent('AI per-minute rate limit hit', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/process',
        action: 'ai_rate_limit',
        status: 'limited',
        errorCode: 'ai_per_minute_limit_hit',
        details: { eventsToMatch, limit: AI_CALLS_PER_MINUTE_PER_USER },
      })
      return NextResponse.json(
        { error: `AI rate limit reached. Try again in about ${Math.ceil((minuteLimit.resetAt - Date.now()) / 1000)} seconds.` },
        { status: 429 }
      )
    }

    const usageResult = await consumeAiUsage(user.id, period, eventsToMatch, limit)
    lap('consumeAiUsage')
    if (!usageResult.allowed) {
      captureAppEvent('AI monthly usage limit hit', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/process',
        action: 'ai_usage_limit',
        status: 'limited',
        errorCode: 'ai_monthly_limit_hit',
        details: { eventsToMatch, monthlyLimit: limit, remaining: usageResult.remaining, tier, entitlementStatus: entitlement.status },
      })
      return NextResponse.json(
        { error: `AI match limit reached. ${usageResult.remaining} of ${limit} matches remaining this month on your ${tier.replaceAll('_', ' ')} plan.` },
        { status: 429 }
      )
    }

    let aiUnavailable = false
    let aiUnavailableReason: AiUnavailableReason | undefined
    try {
      const result = await matchEvents(events, jiraTickets, catchAllMappings, defaultProjectKey, learnedMappings)
      workEntries = result.workEntries
      jiraMatchesByWorkEntryId = result.jiraMatchesByWorkEntryId
      aiUnavailable = result.aiUnavailable ?? false
      aiUnavailableReason = result.aiUnavailableReason
      lap(`matchEvents (${eventsToMatch} events, ${jiraTickets.length} tickets)`)
    } catch (error) {
      await refundAiUsage(user.id, period, eventsToMatch)
      if (importRunId) {
        try {
          await failImportRun(supabase, { importRunId, userId: user.id, error, errorCode: 'match_failed' })
        } catch (traceError) {
          captureAppError(traceError, {
            eventType: 'import_run_fail_record_failed',
            userId: user.id,
            requestId,
            importId: importRunId,
            route: '/api/process',
            action: 'fail_import_run',
            status: 'failed',
            errorCode: 'import_run_fail_record_failed',
            details: { importRunId },
          })
        }
      }
      captureAppError(error, {
        eventType: 'match_failed',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/process',
        action: 'match_events',
        status: 'failed',
        errorCode: 'match_failed',
        details: { eventsToMatch, ticketCount: jiraTickets.length },
      })
      throw error
    }

    // Fire analytics write after responding — never block the user on this
    if (importRunId) {
      completeImportRun(supabase, {
        importRunId,
        userId: user.id,
        events,
        jiraMatchesByWorkEntryId,
        durationMs: Date.now() - t0,
      }).catch(traceError => {
        captureAppError(traceError, {
          eventType: 'import_run_complete_failed',
          userId: user.id,
          requestId,
          importId: importRunId ?? undefined,
          route: '/api/process',
          action: 'complete_import_run',
          status: 'failed',
          errorCode: 'import_run_complete_failed',
          details: { importRunId, eventCount: events.length },
        })
      })
    }

    captureAppEvent('Import processed successfully', 'info', {
      eventType: 'import_succeeded',
      userId: user.id,
      requestId,
      importId: importRunId ?? undefined,
      route: '/api/process',
      action: 'import_process',
      status: 'success',
      details: {
        eventCount: events.length,
        eventsToMatch,
        skippedCount: events.filter(event => event.autoSkipped).length,
        ticketCount: jiraTickets.length,
        ticketsTruncated,
      },
    })

    lap('TOTAL (about to respond)')
    return NextResponse.json({ workEntries, jiraMatchesByWorkEntryId, mode: 'jira', calendarName, ticketsTruncated, aiUnavailable, aiUnavailableReason })
  } catch (err) {
    console.error('[/api/process] unhandled error:', err)
    if (importRunId) {
      try {
        await failImportRun(supabase, { importRunId, userId: user.id, error: err })
      } catch (traceError) {
        captureAppError(traceError, {
          eventType: 'import_run_fail_record_failed',
          userId: user.id,
          requestId,
          importId: importRunId,
          route: '/api/process',
          action: 'fail_import_run',
          status: 'failed',
          errorCode: 'import_run_fail_record_failed',
          details: { importRunId },
        })
      }
    }
    captureAppError(err, {
      eventType: 'import_failed',
      userId: user.id,
      requestId,
      importId: importRunId ?? undefined,
      route: '/api/process',
      action: 'import_process',
      status: 'failed',
      errorCode: 'import_failed',
    })
    return NextResponse.json(safeErrorResponse(err, 'Import failed due to a server error. If this keeps happening, contact support.'), { status: 500 })
  }
}
