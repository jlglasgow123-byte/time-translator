import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './service'
import { captureAppError } from '@/lib/observability'
import type { CalendarEvent, JiraMatchesByWorkEntryId } from '@/types'

type ImportRunStatus = 'started' | 'success' | 'failed'
type MatchMethod = 'exact_key' | 'mapping_rule' | 'ai' | 'no_match' | 'skipped'

interface StartImportRunInput {
  userId: string
  startDate: string
  endDate: string
  timezone: string
  calendarName: string
  fileSizeBytes: number
}

interface StageDurationsMs {
  authMs?: number
  credsMs?: number
  fetchCalendarEventsMs?: number
  entitlementMs?: number
  fetchJiraTicketsMs?: number
  matchEventsMs?: number
}

interface CompleteImportRunInput {
  importRunId: string
  userId: string
  events: CalendarEvent[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
  durationMs?: number
  stageDurations?: StageDurationsMs
}

interface FailImportRunInput {
  importRunId: string
  userId: string
  error: unknown
  errorCode?: string
}

function nullableDate(value: string) {
  return value || null
}

function titleHash(title: string) {
  return createHash('sha256').update(title.trim().toLowerCase()).digest('hex')
}

function inferMatchMethod(event: CalendarEvent, matchReason?: string): MatchMethod {
  if (event.autoSkipped) return 'skipped'
  if (!matchReason || matchReason === 'No match found') return 'no_match'
  if (matchReason === 'Jira key found in event title') return 'exact_key'
  if (matchReason === 'You mapped this calendar event to this Jira task using a rule') return 'mapping_rule'
  return 'ai'
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown import error'
}

export async function startImportRun(supabase: SupabaseClient, input: StartImportRunInput) {
  const { data, error } = await supabase
    .from('import_runs')
    .insert({
      user_id: input.userId,
      start_date: nullableDate(input.startDate),
      end_date: nullableDate(input.endDate),
      timezone: input.timezone,
      calendar_name: input.calendarName || null,
      file_size_bytes: input.fileSizeBytes,
      status: 'started' satisfies ImportRunStatus,
    })
    .select('id')
    .single()

  if (error) throw error
  return data.id as string
}

interface ImportRunAnalyticsRow {
  import_run_id: string
  user_id: string
  duration_ms: number
  event_count: number
  rule_matched_count: number
  ai_high_confidence_count: number
  ai_medium_confidence_count: number
  ai_low_confidence_count: number
  unmatched_count: number
  auth_ms?: number
  creds_ms?: number
  fetch_calendar_events_ms?: number
  entitlement_ms?: number
  fetch_jira_tickets_ms?: number
  match_events_ms?: number
}

/**
 * Writes one analytics row per completed import.
 *
 * `import_run_analytics` deliberately has an INSERT policy of `with check (false)`
 * for authenticated clients — browsers must never write analytics rows — so this
 * write cannot use the caller's request-scoped user client and must use the
 * service-role client, which bypasses RLS. That is why the service client is
 * constructed here rather than passed in: it stays confined to this one insert.
 *
 * `user_id` is the server-resolved authenticated user id supplied by the API
 * route, never a caller-controlled value, so a user cannot forge rows for another
 * user despite RLS being bypassed.
 *
 * Analytics is non-fatal to the import: every failure (including a missing
 * service-role key, which makes createServiceClient throw) is captured and
 * swallowed so the user's import still succeeds.
 */
async function writeImportRunAnalytics(row: ImportRunAnalyticsRow) {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('import_run_analytics').insert(row)
    if (error) throw new Error(error.message)
  } catch (error) {
    captureAppError(error, {
      eventType: 'import_run_analytics_write_failed',
      userId: row.user_id,
      importId: row.import_run_id,
      action: 'write_import_run_analytics',
      status: 'failed',
      errorCode: 'import_run_analytics_write_failed',
    })
  }
}

export async function completeImportRun(supabase: SupabaseClient, input: CompleteImportRunInput) {
  const rows = input.events.map(event => {
    const match = input.jiraMatchesByWorkEntryId[event.uid]
    const method = inferMatchMethod(event, match?.matchReason)

    return {
      import_run_id: input.importRunId,
      user_id: input.userId,
      event_uid: event.uid,
      event_title_hash: titleHash(event.title),
      event_start: event.startUtc,
      event_end: event.endUtc,
      event_duration_seconds: event.durationSeconds,
      skipped: event.autoSkipped,
      skip_reason: event.skipReason ?? null,
      match_method: method,
      confidence: event.autoSkipped ? null : match?.confidence ?? null,
      selected_jira_key: method === 'no_match' || method === 'skipped' ? null : match?.suggestedJiraKey ?? null,
      match_reason: event.autoSkipped ? event.skipReason ?? null : match?.matchReason ?? null,
    }
  })

  if (rows.length > 0) {
    const { error: traceError } = await supabase.from('import_event_traces').insert(rows)
    if (traceError) throw traceError
  }

  const skippedCount = input.events.filter(event => event.autoSkipped).length
  const matchedEvents = input.events
    .filter(event => !event.autoSkipped)
    .map(event => input.jiraMatchesByWorkEntryId[event.uid])
  const matchedCount = matchedEvents.filter(match => match?.matchReason && match.matchReason !== 'No match found').length
  const aiMatchedCount = input.events.filter(event => {
    const match = input.jiraMatchesByWorkEntryId[event.uid]
    return inferMatchMethod(event, match?.matchReason) === 'ai'
  }).length
  const failedCount = input.events.length - skippedCount - matchedCount

  const { error: runError } = await supabase
    .from('import_runs')
    .update({
      event_count: input.events.length,
      skipped_count: skippedCount,
      matched_count: matchedCount,
      ai_matched_count: aiMatchedCount,
      failed_count: failedCount,
      status: 'success' satisfies ImportRunStatus,
      error_code: null,
      error_message: null,
    })
    .eq('id', input.importRunId)
    .eq('user_id', input.userId)

  if (runError) throw runError

  if (input.durationMs !== undefined) {
    let ruleMatched = 0
    let aiHigh = 0
    let aiMedium = 0
    let aiLow = 0
    let unmatched = 0

    for (const event of input.events) {
      if (event.autoSkipped) continue
      const match = input.jiraMatchesByWorkEntryId[event.uid]
      const method = inferMatchMethod(event, match?.matchReason)
      if (method === 'exact_key' || method === 'mapping_rule') ruleMatched++
      else if (method === 'no_match') unmatched++
      else if (method === 'ai') {
        if (match?.confidence === 'HIGH') aiHigh++
        else if (match?.confidence === 'MEDIUM') aiMedium++
        else aiLow++
      }
    }

    await writeImportRunAnalytics({
      import_run_id: input.importRunId,
      user_id: input.userId,
      duration_ms: input.durationMs,
      event_count: input.events.length,
      rule_matched_count: ruleMatched,
      ai_high_confidence_count: aiHigh,
      ai_medium_confidence_count: aiMedium,
      ai_low_confidence_count: aiLow,
      unmatched_count: unmatched,
      auth_ms: input.stageDurations?.authMs,
      creds_ms: input.stageDurations?.credsMs,
      fetch_calendar_events_ms: input.stageDurations?.fetchCalendarEventsMs,
      entitlement_ms: input.stageDurations?.entitlementMs,
      fetch_jira_tickets_ms: input.stageDurations?.fetchJiraTicketsMs,
      match_events_ms: input.stageDurations?.matchEventsMs,
    })
  }
}

export async function failImportRun(supabase: SupabaseClient, input: FailImportRunInput) {
  const { error } = await supabase
    .from('import_runs')
    .update({
      status: 'failed' satisfies ImportRunStatus,
      error_code: input.errorCode ?? 'import_failed',
      error_message: errorMessage(input.error).slice(0, 500),
    })
    .eq('id', input.importRunId)
    .eq('user_id', input.userId)

  if (error) throw error
}
