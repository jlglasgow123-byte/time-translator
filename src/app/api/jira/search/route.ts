import { NextRequest, NextResponse } from 'next/server'
import { searchIssues } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { safeErrorResponse } from '@/lib/errors'

export async function GET(req: NextRequest) {
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const q = req.nextUrl.searchParams.get('q') ?? ''
  const project = req.nextUrl.searchParams.get('project') ?? undefined
  if (q.length < 2) return NextResponse.json({ results: [] })

  try {
    const results = await searchIssues(creds, q, project)
    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json(safeErrorResponse(err, 'Could not search Jira tickets right now. Please try again.'), { status: 500 })
  }
}
