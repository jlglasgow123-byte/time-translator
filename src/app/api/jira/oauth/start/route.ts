import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = randomBytes(16).toString('hex')

  // Store state in DB so we can verify it on callback
  await supabase.from('jira_oauth_state').upsert({ user_id: user.id, state, created_at: new Date().toISOString() })

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
