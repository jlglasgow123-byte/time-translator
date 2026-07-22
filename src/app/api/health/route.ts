import { NextRequest, NextResponse } from 'next/server'
import { checkJiraConnection } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import { createClient } from '@/lib/supabase/server'
import { captureAppEvent, requestIdFromHeaders } from '@/lib/observability'

export async function GET(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const jiraResult: { ok: boolean; email?: string; error?: string } = { ok: false }

  try {
    const { email } = await checkJiraConnection(creds)
    jiraResult.ok = true
    jiraResult.email = email
  } catch (err) {
    jiraResult.error = err instanceof Error ? err.message : 'Jira check failed'
  }

  captureAppEvent('Jira connection tested', jiraResult.ok ? 'info' : 'warning', {
    eventType: jiraResult.ok ? 'jira_connection_tested' : 'jira_connection_test_failed',
    userId: user?.id,
    requestId,
    route: '/api/health',
    action: 'jira_connection_tested',
    status: jiraResult.ok ? 'success' : 'failed',
    errorCode: jiraResult.ok ? undefined : 'jira_connection_test_failed',
    details: jiraResult.ok ? {} : { reason: jiraResult.error },
  })

  const statusCode = jiraResult.ok ? 200 : 500
  return NextResponse.json({ jira: jiraResult }, { status: statusCode })
}
