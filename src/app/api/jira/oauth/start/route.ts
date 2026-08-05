import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'
import { captureAppError } from '@/lib/observability'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = randomBytes(16).toString('hex')

  // Store state in DB so we can verify it on callback. If this write fails silently the
  // callback's state check can never match, so the user is bounced to Atlassian, grants
  // consent, and is returned with `invalid_state` every time — an unconnectable loop
  // whose real cause is here, not there. Fail fast instead of starting a doomed flow.
  const { error } = await supabase
    .from('jira_oauth_state')
    .upsert({ user_id: user.id, state, created_at: new Date().toISOString() })

  if (error) {
    captureAppError(error, {
      eventType: 'jira_oauth_state_write_failed',
      userId: user.id,
      route: '/api/jira/oauth/start',
      action: 'jira_oauth_start',
      status: 'failed',
      errorCode: 'jira_oauth_state_write_failed',
      details: { dbCode: (error as { code?: string }).code },
    })
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=state_write_failed`)
  }

  const params = new URLSearchParams({
    audience: 'api.atlassian.com',
    client_id: process.env.ATLASSIAN_CLIENT_ID!,
    scope: 'read:jira-work write:jira-work read:jira-user read:me offline_access',
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/jira/oauth/callback`,
    state,
    response_type: 'code',
    prompt: 'consent',
  })

  return NextResponse.redirect(`https://auth.atlassian.com/authorize?${params}`)
}
