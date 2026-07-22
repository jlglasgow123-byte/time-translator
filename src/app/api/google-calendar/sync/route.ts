import { NextRequest, NextResponse } from 'next/server'
import { fetchOpenTickets, fetchIssue } from '@/lib/jira-client'
import { matchEvents } from '@/lib/ai-matcher'
import { fetchGoogleCalendarEvents, getGoogleCalendarCreds } from '@/lib/google-calendar-client'
import { JIRA_CONNECTION_REQUIRED_MESSAGE, getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { createClient } from '@/lib/supabase/server'
import { consumeAiUsage, refundAiUsage } from '@/lib/supabase/usage'
import { completeImportRun, failImportRun, startImportRun } from '@/lib/supabase/import-runs'
import { backfillLearnedMappings } from '@/lib/supabase/learned-mappings'
import { safeErrorResponse } from '@/lib/errors'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'
import { getUserEntitlement } from '@/lib/billing/entitlements'
import {
  AI_CALLS_PER_MINUTE_PER_USER,
  MAX_EVENTS_PER_IMPORT,
  MAX_JIRA_TICKETS_PER_FETCH,
} from '@/lib/security-limits'
import type { CatchAllMapping, JiraTicket, SkipRule } from '@/types'

const KEY_PREFIX_RE = /\b([A-Z]{2,6})-\d+\b/gi
const SPECIFIC_KEY_RE = /\b([A-Z]{2,6}-\d+)\b/i

// Same shape/flow as /api/process, but pulls events from Google Calendar instead
// of an uploaded .ics file. Reuses the identical matching pipeline so results are
// indistinguishable in quality from .ics-sourced imports.
export async function POST(req: NextRequest) {
  const t0 = Date.now()
  let tPrev = t0
  const stageDurations: {
    authMs?: number
    credsMs?: number
    fetchCalendarEventsMs?: number
    entitlementMs?: number
    fetchJiraTicketsMs?: number
    matchEventsMs?: number
  } = {}
  const lap = (label: string, stageKey?: keyof typeof stageDurations) => {
    const now = Date.now()
    const stageMs = now - tPrev
    console.log(`[google-calendar/sync] ${label}: +${now - t0}ms (${stageMs}ms)`)
    if (stageKey) stageDurations[stageKey] = stageMs
    tPrev = now
  }

  const requestId = requestIdFromHeaders(req.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  lap('auth', 'authMs')

  let importRunId: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    const startDate: string = body.startDate ?? ''
    const endDate: string = body.endDate ?? ''
    const timezone: string = body.timezone || 'Australia/Sydney'
    const catchAllMappings: CatchAllMapping[] = Array.isArray(body.catchAllMappings) ? body.catchAllMappings : []
    const skipRules: SkipRule[] = Array.isArray(body.skipRules) && body.skipRules.length ? body.skipRules : DEFAULT_SKIP_RULES
    const excludeWeekends = Boolean(body.excludeWeekends)
    const defaultProjectKey: string = body.defaultProjectKey || 'DOC'
    const includedIssueTypes: string[] = Array.isArray(body.includedIssueTypes) && body.includedIssueTypes.length
      ? body.includedIssueTypes
      : [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES]

    if (!startDate || !endDate) return NextResponse.json({ error: 'Date range required' }, { status: 400 })

    const diffDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
    if (diffDays > 90) {
      return NextResponse.json({ error: 'Date range cannot exceed 90 days' }, { status: 400 })
    }

    const credsResult = await getGoogleCalendarCreds(supabase, user.id)
    if (!credsResult.ok) {
      if (credsResult.reason === 'not_connected') {
        return NextResponse.json({ error: 'Connect Google Calendar in Settings before syncing.' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Your Google Calendar connection has expired. Please reconnect in Settings.' }, { status: 401 })
    }

    const jiraCreds = await getJiraCreds()
    if (isCredsError(jiraCreds)) {
      const response = credsErrorResponse(jiraCreds)
      if (response.status === 400) return NextResponse.json({ error: JIRA_CONNECTION_REQUIRED_MESSAGE }, { status: 400 })
      return response
    }
    lap('creds', 'credsMs')

    captureAppEvent('Google Calendar sync started', 'info', {
      eventType: 'gcal_sync_started',
      userId: user.id,
      requestId,
      route: '/api/google-calendar/sync',
      action: 'gcal_sync',
      status: 'started',
      details: { startDate, endDate, timezone },
    })

    const events = await fetchGoogleCalendarEvents({
      accessToken: credsResult.accessToken,
      startDate,
      endDate,
      timezone,
      skipRules,
      excludeWeekends,
    })
    lap(`fetchGoogleCalendarEvents (${events.length} events)`, 'fetchCalendarEventsMs')

    if (!events.length) return NextResponse.json({ error: 'No events found in the selected date range.' }, { status: 400 })
    if (events.length > MAX_EVENTS_PER_IMPORT) {
      return NextResponse.json({ error: `Too many calendar events. Sync up to ${MAX_EVENTS_PER_IMPORT} events at a time.` }, { status: 413 })
    }

    // GCal mode users have no linked_calendars row — the connected Google account
    // IS their one calendar (mutual exclusivity enforces the Pro one-calendar limit).
    // The google_calendar_credentials check above is the only gate needed.
    const calendarEntitlement = await getUserEntitlement(supabase, user.id)
    lap('entitlement', 'entitlementMs')

    try {
      importRunId = await startImportRun(supabase, {
        userId: user.id,
        startDate,
        endDate,
        timezone,
        calendarName: 'Google Calendar',
        fileSizeBytes: 0,
      })
    } catch (error) {
      captureAppError(error, {
        eventType: 'import_run_start_failed',
        userId: user.id,
        requestId,
        route: '/api/google-calendar/sync',
        action: 'start_import_run',
        status: 'failed',
        errorCode: 'import_run_start_failed',
      })
    }

    const learnedMappings = await backfillLearnedMappings(supabase, user.id, [])

    const creds = jiraCreds as import('@/lib/jira-client').JiraCredentials

    const projectKeys = new Set<string>([defaultProjectKey])
    for (const ev of events) {
      for (const m of ev.title.matchAll(KEY_PREFIX_RE)) projectKeys.add(m[1].toUpperCase())
    }

    const ticketResult = await fetchOpenTickets(creds, Array.from(projectKeys), includedIssueTypes, MAX_JIRA_TICKETS_PER_FETCH)
    const entitlement = calendarEntitlement
    lap('fetchOpenTickets', 'fetchJiraTicketsMs')

    const jiraTickets: JiraTicket[] = ticketResult.tickets
    const ticketsTruncated = ticketResult.truncated
    const ticketMap = new Map(jiraTickets.map(t => [t.key, t]))

    const missingKeys = new Set<string>()
    for (const ev of events) {
      const m = ev.title.match(SPECIFIC_KEY_RE)
      if (m) {
        const jiraKey = m[1].toUpperCase()
        if (!ticketMap.has(jiraKey)) missingKeys.add(jiraKey)
      }
    }
    if (missingKeys.size > 0) {
      const lookups = await Promise.allSettled(Array.from(missingKeys).map(key => fetchIssue(creds, key)))
      for (const result of lookups) {
        if (result.status === 'fulfilled' && result.value?.key) {
          jiraTickets.push({ key: result.value.key, summary: result.value.summary ?? '', status: '' })
        }
      }
    }

    const period = new Date().toISOString().slice(0, 7)
    const tier = entitlement.tier
    const limit = entitlement.monthlyAiLimit
    const eventsToMatch = events.filter(e => !e.autoSkipped).length

    if (!entitlement.canUseAi && eventsToMatch > 0) {
      return NextResponse.json({ error: entitlement.reason ?? 'Your plan does not currently allow AI matching.' }, { status: 402 })
    }

    const minuteLimit = await checkRateLimit(`ai:${user.id}`, AI_CALLS_PER_MINUTE_PER_USER, 60, eventsToMatch)
    if (!minuteLimit.allowed) {
      return NextResponse.json(
        { error: `AI rate limit reached. Try again in about ${Math.ceil((minuteLimit.resetAt - Date.now()) / 1000)} seconds.` },
        { status: 429 }
      )
    }

    const usageResult = await consumeAiUsage(user.id, period, eventsToMatch, limit)
    if (!usageResult.allowed) {
      return NextResponse.json(
        { error: `AI match limit reached. ${usageResult.remaining} of ${limit} matches remaining this month on your ${tier.replaceAll('_', ' ')} plan.` },
        { status: 429 }
      )
    }

    let workEntries
    let jiraMatchesByWorkEntryId
    let aiUnavailable = false
    let aiUnavailableReason
    try {
      const result = await matchEvents(events, jiraTickets, catchAllMappings, defaultProjectKey, learnedMappings)
      workEntries = result.workEntries
      jiraMatchesByWorkEntryId = result.jiraMatchesByWorkEntryId
      aiUnavailable = result.aiUnavailable ?? false
      aiUnavailableReason = result.aiUnavailableReason
      lap(`matchEvents (${eventsToMatch} events, ${jiraTickets.length} tickets)`, 'matchEventsMs')
    } catch (error) {
      await refundAiUsage(user.id, period, eventsToMatch)
      if (importRunId) {
        try {
          await failImportRun(supabase, { importRunId, userId: user.id, error, errorCode: 'match_failed' })
        } catch { /* non-fatal */ }
      }
      captureAppError(error, {
        eventType: 'match_failed',
        userId: user.id,
        requestId,
        importId: importRunId ?? undefined,
        route: '/api/google-calendar/sync',
        action: 'match_events',
        status: 'failed',
        errorCode: 'match_failed',
      })
      throw error
    }

    if (importRunId) {
      completeImportRun(supabase, { importRunId, userId: user.id, events, jiraMatchesByWorkEntryId, durationMs: Date.now() - t0, stageDurations })
        .catch(traceError => {
          captureAppError(traceError, {
            eventType: 'import_run_complete_failed',
            userId: user.id,
            requestId,
            importId: importRunId ?? undefined,
            route: '/api/google-calendar/sync',
            action: 'complete_import_run',
            status: 'failed',
            errorCode: 'import_run_complete_failed',
          })
        })
    }

    captureAppEvent('Google Calendar sync processed successfully', 'info', {
      eventType: 'gcal_sync_succeeded',
      userId: user.id,
      requestId,
      importId: importRunId ?? undefined,
      route: '/api/google-calendar/sync',
      action: 'gcal_sync',
      status: 'success',
      details: { eventCount: events.length, eventsToMatch, ticketCount: jiraTickets.length, ticketsTruncated },
    })

    lap('TOTAL (about to respond)')
    return NextResponse.json({
      workEntries,
      jiraMatchesByWorkEntryId,
      mode: 'jira',
      calendarName: 'Google Calendar',
      ticketsTruncated,
      aiUnavailable,
      aiUnavailableReason,
    })
  } catch (err) {
    console.error('[/api/google-calendar/sync] unhandled error:', err)
    if (importRunId) {
      try {
        await failImportRun(supabase, { importRunId, userId: user.id, error: err })
      } catch { /* non-fatal */ }
    }
    captureAppError(err, {
      eventType: 'gcal_sync_failed',
      userId: user.id,
      requestId,
      importId: importRunId ?? undefined,
      route: '/api/google-calendar/sync',
      action: 'gcal_sync',
      status: 'failed',
      errorCode: 'gcal_sync_failed',
    })
    return NextResponse.json(safeErrorResponse(err, 'Google Calendar sync failed due to a server error. If this keeps happening, contact support.'), { status: 500 })
  }
}
