import { NextRequest, NextResponse } from 'next/server'
import { searchProjects } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, requestIdFromHeaders } from '@/lib/observability'
import { guardJiraLookup } from '@/lib/jira-lookup-guard'
import { MAX_JIRA_PROJECT_QUERY_LENGTH } from '@/lib/security-limits'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  // Keystroke-driven, so cap it — every call hits the user's own Jira.
  const limited = await guardJiraLookup({
    userId: creds.userId,
    scope: 'projects',
    requestId,
    route: '/api/jira/projects',
  })
  if (limited) return limited

  // Truncate rather than reject: Jira's project search is a substring match and
  // is useless past a few dozen characters, so a longer query is a stuck client
  // rather than a real search. No reason to forward megabytes to Atlassian.
  const q = req.nextUrl.searchParams.get('q')?.trim().slice(0, MAX_JIRA_PROJECT_QUERY_LENGTH) || undefined

  try {
    const projects = await searchProjects(creds, q)
    return NextResponse.json({ projects })
  } catch (err) {
    captureAppError(err, {
      eventType: 'jira_projects_fetch_failed',
      requestId,
      route: '/api/jira/projects',
      action: 'search_jira_projects',
      status: 'failed',
      errorCode: 'jira_projects_fetch_failed',
      details: { filtered: Boolean(q) },
    })
    return NextResponse.json(safeErrorResponse(err, 'Could not load your Jira projects. Please try again.'), { status: 500 })
  }
}
