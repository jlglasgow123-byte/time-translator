import { NextRequest, NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, requestIdFromHeaders } from '@/lib/observability'
import { guardJiraLookup } from '@/lib/jira-lookup-guard'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  // Keystroke-driven, so cap it — every call hits the user's own Jira.
  const limited = await guardJiraLookup({
    userId: creds.userId,
    scope: 'search',
    requestId,
    route: '/api/jira/search',
  })
  if (limited) return limited

  const q = req.nextUrl.searchParams.get('q') ?? ''
  // Jira project keys are uppercase alphanumerics/underscore. Anything else is not a
  // key, so drop it rather than interpolating it into JQL.
  const projectParam = req.nextUrl.searchParams.get('project')
  const project = projectParam && /^[A-Z][A-Z0-9_]{0,49}$/.test(projectParam) ? projectParam : undefined
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const results = await searchIssues(creds, q, project)
    return NextResponse.json({ results })
  } catch (err) {
    // Note: the search term itself is deliberately not recorded — it is user content.
    captureAppError(err, {
      eventType: 'jira_search_failed',
      requestId,
      route: '/api/jira/search',
      action: 'search_jira_issues',
      status: 'failed',
      errorCode: 'jira_search_failed',
      details: { queryLength: q.length, project: project ?? null },
    })
    return NextResponse.json(safeErrorResponse(err, 'Could not search Jira tickets right now. Please try again.'), { status: 500 })
  }
}
