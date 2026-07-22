import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('jira_worklogs')
    .select('id, worklog_id, jira_key, jira_summary, event_title, event_date, start_time, duration_seconds, logged_at')
    .eq('user_id', user.id)
    .order('logged_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json(safeErrorResponse(error, 'Could not load your history. Please try again.'), { status: 500 })
  return NextResponse.json({ worklogs: data ?? [] })
}
