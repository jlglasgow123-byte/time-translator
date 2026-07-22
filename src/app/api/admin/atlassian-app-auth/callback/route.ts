import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { encryptJiraToken } from '@/lib/crypto/jira-token'
import { createHmac } from 'crypto'

function stateSecret() {
  const s = process.env.JIRA_TOKEN_ENCRYPTION_KEY
  if (!s) throw new Error('JIRA_TOKEN_ENCRYPTION_KEY not set')
  return s
}

function verifyState(state: string): boolean {
  const dot = state.lastIndexOf('.')
  if (dot === -1) return false
  const nonce = state.slice(0, dot)
  const sig = state.slice(dot + 1)
  const expected = createHmac('sha256', stateSecret()).update(nonce).digest('hex')
  return sig === expected
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL!

// No session check here — callback is hit without an app session cookie (we just came from Atlassian).
// Security is provided by HMAC-signed state: only our start route could have generated a valid state.
export async function GET(req: NextRequest) {
  try {
    return await handleCallback(req)
  } catch (err) {
    console.error('[atlassian-app-auth] unhandled error', err)
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=error&reason=${encodeURIComponent(String(err))}`)
  }
}

async function handleCallback(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=failed&reason=atlassian_error&detail=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=failed&reason=missing_params`)
  }
  if (!verifyState(state)) {
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=failed&reason=bad_state`)
  }

  const tokenRes = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      code,
      redirect_uri: `${APP_URL()}/api/admin/atlassian-app-auth/callback`,
    }),
  })

  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    console.error('[atlassian-app-auth] token exchange failed', tokenRes.status, body)
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=token_failed&status=${tokenRes.status}`)
  }

  const tokenJson = await tokenRes.json()
  const { access_token, expires_in } = tokenJson
  const refresh_token = tokenJson.refresh_token ?? null
  const expiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

  console.log('[atlassian-app-auth] token exchange ok, has refresh_token:', !!refresh_token)

  const supabase = createServiceClient()
  const { error: dbError } = await supabase.from('app_atlassian_credentials').upsert({
    id: 1,
    access_token: encryptJiraToken(access_token),
    refresh_token: refresh_token ? encryptJiraToken(refresh_token) : null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (dbError) {
    return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=db_failed`)
  }

  return NextResponse.redirect(`${APP_URL()}/admin?atlassian_app_auth=success`)
}
