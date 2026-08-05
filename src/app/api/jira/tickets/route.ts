import { NextRequest, NextResponse } from 'next/server'
import { fetchOpenTickets } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { MAX_JIRA_TICKETS_PER_FETCH } from '@/lib/security-limits'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, requestIdFromHeaders } from '@/lib/observability'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const raw = req.nextUrl.searchParams.get('projectKeys') ?? req.nextUrl.searchParams.get('projectKey') ?? ''
  try {
    const projectKeys = raw.split(',').map(k => k.trim()).filter(Boolean)
    const issueTypesRaw = req.nextUrl.searchParams.get('issueTypes') ?? ''
    const issueTypes = issueTypesRaw.split(',').map(type => type.trim()).filter(Boolean)
    const tickets = await fetchOpenTickets(creds, projectKeys, issueTypes, MAX_JIRA_TICKETS_PER_FETCH)
    return NextResponse.json({ tickets })
  } catch (err) {
    captureAppError(err, {
      eventType: 'jira_tickets_fetch_failed',
      requestId,
      route: '/api/jira/tickets',
      action: 'fetch_jira_tickets',
      status: 'failed',
      errorCode: 'jira_tickets_fetch_failed',
      // Only well-formed keys are recorded — `raw` is an unvalidated query param and
      // should not be written verbatim into an event row.
      details: {
        projectKeys: raw
          .split(',')
          .map(k => k.trim())
          .filter(k => /^[A-Z][A-Z0-9_]{0,49}$/.test(k))
          .join(','),
        keyCount: raw.split(',').filter(Boolean).length,
      },
    })
    return NextResponse.json(safeErrorResponse(err, 'Could not fetch Jira tickets. Please check your connection in Settings.'), { status: 500 })
  }
}
