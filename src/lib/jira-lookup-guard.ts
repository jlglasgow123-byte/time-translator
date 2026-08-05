import { NextResponse } from 'next/server'
import { checkRateLimitSafe } from '@/lib/rate-limit'
import { captureAppError } from '@/lib/observability'
import { JIRA_LOOKUPS_PER_MINUTE_PER_USER } from '@/lib/security-limits'

interface GuardOptions {
  userId: string
  /** Distinguishes the two typeahead endpoints in the rate-limit key and in logs. */
  scope: 'search' | 'projects'
  requestId?: string
  route: string
}

/**
 * Shared rate-limit gate for the keystroke-driven Jira typeahead endpoints.
 * Returns a response to send back, or null to continue.
 *
 * The two endpoints are budgeted separately (`jira-lookup:<scope>:<user>`), so
 * heavy issue searching cannot exhaust the allowance for the project picker —
 * they are unrelated actions and a 429 in one caused by the other reads as a bug.
 */
export async function guardJiraLookup({ userId, scope, requestId, route }: GuardOptions): Promise<NextResponse | null> {
  const outcome = await checkRateLimitSafe(
    `jira-lookup:${scope}:${userId}`,
    JIRA_LOOKUPS_PER_MINUTE_PER_USER,
    60,
  )

  if (outcome.status === 'limited') {
    return NextResponse.json(
      { error: 'Too many searches. Please wait a moment and try again.' },
      { status: 429 },
    )
  }

  // Fail closed (Project_Model.md §6, 2026-08-05). Also log it — an unreachable
  // limiter previously produced a bare 500 that never reached app_system_events,
  // so an outage was invisible.
  if (outcome.status === 'unavailable') {
    captureAppError(outcome.error, {
      eventType: 'rate_limit_unavailable',
      userId,
      requestId,
      route,
      action: 'check_rate_limit',
      status: 'failed',
      errorCode: 'rate_limit_unavailable',
      details: { scope },
    })
    return NextResponse.json(
      { error: 'Search is temporarily unavailable. Please try again shortly.' },
      { status: 503 },
    )
  }

  return null
}
