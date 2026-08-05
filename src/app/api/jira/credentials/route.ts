import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { captureAppError } from '@/lib/observability'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('jira_credentials')
    .select('email, access_token')
    .eq('user_id', user.id)
    .single()

  // PGRST116 = no row, which is the normal "not connected yet" case. Anything else is
  // a real read failure that would otherwise render as a spurious "not connected" and
  // send a connected user back through the OAuth flow.
  if (error && (error as { code?: string }).code !== 'PGRST116') {
    captureAppError(error, {
      eventType: 'jira_credentials_read_failed',
      userId: user.id,
      route: '/api/jira/credentials',
      action: 'read_jira_credentials',
      status: 'failed',
      errorCode: 'jira_credentials_read_failed',
      details: { dbCode: (error as { code?: string }).code },
    })
  }

  if (!data) {
    return NextResponse.json({ connected: false, email: null })
  }

  return NextResponse.json({
    connected: Boolean(data.access_token),
    email: data.email ?? null,
  })
}
