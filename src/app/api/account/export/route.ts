import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const userId = user.id

  const [
    { data: profile },
    { data: worklogs },
    { data: calendars },
    { data: importRuns },
    { data: jiraCreds },
  ] = await Promise.all([
    service.from('profiles').select('tier, subscription_status, subscription_tier, trial_started_at, trial_ends_at, subscription_current_period_end').eq('user_id', userId).single(),
    service.from('jira_worklogs').select('worklog_id, jira_key, jira_summary, event_title, event_date, start_time, duration_seconds, logged_at').eq('user_id', userId).order('logged_at', { ascending: false }),
    service.from('linked_calendars').select('calendar_name, id, created_at').eq('user_id', userId),
    service.from('import_runs').select('id, status, event_count, matched_count, ai_matched_count, skipped_count, failed_count, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    service.from('jira_credentials').select('atlassian_account_id, email, base_url, updated_at').eq('user_id', userId).single(),
  ])

  const exportData = {
    exported_at: new Date().toISOString(),
    account: {
      email: user.email,
      account_id: user.id,
      created_at: user.created_at,
    },
    plan: profile ?? null,
    jira_connection: jiraCreds
      ? {
          atlassian_account_id: jiraCreds.atlassian_account_id,
          email: jiraCreds.email,
          base_url: jiraCreds.base_url,
          connected_at: jiraCreds.updated_at,
        }
      : null,
    linked_calendars: (calendars ?? []).map((c) => ({
      calendar_name: c.calendar_name,
      calendar_id: c.id,
      linked_at: c.created_at,
    })),
    worklog_history: worklogs ?? [],
    import_history: importRuns ?? [],
  }

  const json = JSON.stringify(exportData, null, 2)

  return new NextResponse(json, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="timetranslator-data-export.json"`,
    },
  })
}
