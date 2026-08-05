import { NextRequest, NextResponse } from 'next/server'
import { fetchIssue } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, requestIdFromHeaders } from '@/lib/observability'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  try {
    const issue = await fetchIssue(creds, key)
    if (!issue) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(issue)
  } catch (err) {
    captureAppError(err, {
      eventType: 'jira_issue_fetch_failed',
      requestId,
      route: '/api/jira/issue',
      action: 'fetch_jira_issue',
      status: 'failed',
      errorCode: 'jira_issue_fetch_failed',
      // `key` is an unvalidated query param — record it only if it looks like a Jira key.
      details: { jiraKey: /^[A-Z][A-Z0-9_]{0,49}-\d{1,10}$/.test(key) ? key : '(malformed)' },
    })
    return NextResponse.json(safeErrorResponse(err, 'Could not fetch that Jira issue. Please try again.'), { status: 500 })
  }
}
