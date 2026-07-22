import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptJiraToken } from '@/lib/crypto/jira-token'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=oauth_failed`)
  }

  // Verify state
  const { data: storedState } = await supabase
    .from('jira_oauth_state')
    .select('state')
    .eq('user_id', user.id)
    .single()

  if (!storedState || storedState.state !== state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=invalid_state`)
  }

  // Exchange code for tokens
  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/jira/oauth/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in } = tokens

  // Get the accessible Atlassian cloud resource (Jira instance)
  const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  })

  if (!resourcesRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=no_resources`)
  }

  const resources = await resourcesRes.json()
  if (!resources.length) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=no_jira_site`)
  }

  // Use first available cloud — single workspace assumption for now
  const cloud = resources[0]
  const cloudId = cloud.id
  const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`

  // Get account info
  const meRes = await fetch('https://api.atlassian.com/me', {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  })
  const meBody = await meRes.text()
  console.log('[jira-oauth-callback] /me status:', meRes.status, 'body:', meBody)
  const me = meRes.ok ? JSON.parse(meBody) : {}
  const accountId = me.account_id ?? ''
  const email = me.email ?? ''
  console.log('[jira-oauth-callback] accountId:', accountId, 'email:', email)

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  await supabase.from('jira_credentials').upsert({
    user_id: user.id,
    base_url: baseUrl,
    cloud_id: cloudId,
    email,
    atlassian_account_id: accountId,
    access_token: encryptJiraToken(access_token),
    refresh_token: encryptJiraToken(refresh_token),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // Clean up state
  await supabase.from('jira_oauth_state').delete().eq('user_id', user.id)

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_connected=1`)
}
