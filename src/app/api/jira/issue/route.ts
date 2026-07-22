import { NextRequest, NextResponse } from 'next/server'
import { fetchIssue } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'

export async function GET(req: NextRequest) {
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const key = req.nextUrl.searchParams.get('key') ?? ''
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 })
  try {
    const issue = await fetchIssue(creds, key)
    if (!issue) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(issue)
  } catch (err) {
    return NextResponse.json(safeErrorResponse(err, 'Could not fetch that Jira issue. Please try again.'), { status: 500 })
  }
}
