import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { captureAppError, captureAppEvent } from '@/lib/observability'
import { safeErrorResponse } from '@/lib/errors'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Reporting success on a failed delete would tell the user their Jira tokens were
  // removed when they are still stored — a privacy claim we must not make falsely.
  const { error } = await supabase.from('jira_credentials').delete().eq('user_id', user.id)

  if (error) {
    captureAppError(error, {
      eventType: 'jira_disconnect_failed',
      userId: user.id,
      route: '/api/jira/oauth/disconnect',
      action: 'jira_disconnect',
      status: 'failed',
      errorCode: 'jira_disconnect_failed',
      details: { dbCode: (error as { code?: string }).code },
    })
    return NextResponse.json(
      safeErrorResponse(error, 'Could not disconnect Jira. Please try again, or contact support if it keeps happening.'),
      { status: 500 }
    )
  }

  captureAppEvent('Jira disconnected', 'info', {
    eventType: 'jira_disconnected',
    userId: user.id,
    route: '/api/jira/oauth/disconnect',
    action: 'jira_disconnect',
    status: 'success',
  })

  return NextResponse.json({ ok: true })
}
