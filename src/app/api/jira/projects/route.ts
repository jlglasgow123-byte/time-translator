import { NextRequest, NextResponse } from 'next/server'
import { searchProjects } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'
import { captureAppError, requestIdFromHeaders } from '@/lib/observability'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { JIRA_LOOKUPS_PER_MINUTE_PER_USER } from '@/lib/security-limits'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  // Keystroke-driven, so cap it — every call hits the user's own Jira.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const limit = await checkRateLimit(`jira-lookup:${user.id}`, JIRA_LOOKUPS_PER_MINUTE_PER_USER, 60)
    if (!limit.allowed) {
      return NextResponse.json({ error: 'Too many searches. Please wait a moment and try again.' }, { status: 429 })
    }
  }

  const q = req.nextUrl.searchParams.get('q')?.trim() || undefined

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
