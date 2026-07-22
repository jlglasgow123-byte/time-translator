import { NextRequest, NextResponse } from 'next/server'
import { logWorklog, fetchIssue } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { createClient } from '@/lib/supabase/server'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'
import { recordLearnedCorrectionServer } from '@/lib/supabase/learned-mappings'

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  try {
    const body = await req.json()
    const { issueKey, startedAt, durationSeconds, comment, jiraSummary, startTime } = body

    if (!issueKey || !startedAt || !durationSeconds) {
      return NextResponse.json({ error: 'issueKey, startedAt, and durationSeconds are required' }, { status: 400 })
    }

    const result = await logWorklog(creds, { issueKey, startedAt, durationSeconds, comment })

    captureAppEvent('Jira worklog created', 'info', {
      eventType: 'jira_log_succeeded',
      userId: user?.id,
      requestId,
      route: '/api/jira/log',
      action: 'jira_log',
      status: 'success',
      details: { issueKey, durationSeconds },
    })

    // Persist to history — fire and forget, never block the response
    if (user?.id) {
      const eventDate = startedAt.slice(0, 10)
      // Use passed summary if available, otherwise fetch it
      const summary = jiraSummary || await fetchIssue(creds, issueKey).then(i => i?.summary ?? '').catch(() => '')
      supabase.from('jira_worklogs').insert({
        user_id: user.id,
        worklog_id: result.worklogId,
        jira_key: issueKey,
        jira_summary: summary,
        event_title: comment ?? '',
        event_date: eventDate,
        start_time: startTime ?? null,
        duration_seconds: durationSeconds,
      }).then(({ error }) => {
        if (error) console.error('[jira/log] failed to persist worklog history', error.message)
      })

      // Fire and forget — feeds the Priority 3 learned-mapping matcher on future imports
      recordLearnedCorrectionServer(supabase, user.id, comment ?? '', issueKey, eventDate).catch(err =>
        console.error('[jira/log] failed to record learned correction', err)
      )
    }

    return NextResponse.json({ worklogId: result.worklogId, issueKey })
  } catch (err) {
    captureAppError(err, {
      eventType: 'jira_log_failed',
      userId: user?.id,
      requestId,
      route: '/api/jira/log',
      action: 'jira_log',
      status: 'failed',
      errorCode: 'jira_log_failed',
    })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Log failed', issueKey: '' }, { status: 500 })
  }
}
