import { NextRequest, NextResponse } from 'next/server'
import { fetchOpenTickets } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { MAX_JIRA_TICKETS_PER_FETCH } from '@/lib/security-limits'
import { safeErrorResponse } from '@/lib/errors'

export async function GET(req: NextRequest) {
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  try {
    const raw = req.nextUrl.searchParams.get('projectKeys') ?? req.nextUrl.searchParams.get('projectKey') ?? 'DOC'
    const projectKeys = raw.split(',').map(k => k.trim()).filter(Boolean)
    const issueTypesRaw = req.nextUrl.searchParams.get('issueTypes') ?? ''
    const issueTypes = issueTypesRaw.split(',').map(type => type.trim()).filter(Boolean)
    const tickets = await fetchOpenTickets(creds, projectKeys, issueTypes, MAX_JIRA_TICKETS_PER_FETCH)
    return NextResponse.json({ tickets })
  } catch (err) {
    return NextResponse.json(safeErrorResponse(err, 'Could not fetch Jira tickets. Please check your connection in Settings.'), { status: 500 })
  }
}
