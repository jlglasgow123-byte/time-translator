import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptJiraToken } from '@/lib/crypto/jira-token'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'

const ROUTE = '/api/jira/oauth/callback'

export async function GET(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)

  // Every failure below redirects to a ?jira_error= page. Without a recorded event a
  // "I can't connect Jira" report gives no way to tell which of six steps failed.
  const failConnect = (
    reason: string,
    severity: 'warning' | 'error',
    message: string,
    details?: Record<string, unknown>
  ) => {
    captureAppEvent(message, severity, {
      eventType: 'jira_oauth_connect_failed',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'jira_oauth_callback',
      status: 'failed',
      errorCode: `jira_oauth_${reason}`,
      details,
    })
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=${reason}`)
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    // Usually the user declining consent at Atlassian — expected, so warning not error.
    return failConnect('oauth_failed', 'warning', 'Jira OAuth callback returned an error or was declined', {
      atlassianError: error ?? null,
      hasCode: Boolean(code),
      hasState: Boolean(state),
    })
  }

  // Verify state
  const { data: storedState } = await supabase
    .from('jira_oauth_state')
    .select('state')
    .eq('user_id', user.id)
    .single()

  if (!storedState || storedState.state !== state) {
    // A state mismatch is either an expired/restarted flow or a CSRF attempt — worth
    // recording as an error so a spike is visible.
    return failConnect('invalid_state', 'error', 'Jira OAuth state mismatch — possible CSRF or an expired flow', {
      storedStatePresent: Boolean(storedState),
    })
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
    // Bad/expired client credentials land here on every attempt — nobody can connect
    // Jira at all until it is fixed. The response body may carry a secret, so only the
    // status is recorded.
    return failConnect('token_exchange_failed', 'error', 'Jira OAuth token exchange failed', {
      httpStatus: tokenRes.status,
      // Merged into one boolean because a field named `clientSecretPresent` matches
      // sanitizeDetails()'s credential-key regex and would persist as '[redacted]' —
      // which says nothing about whether the secret is actually set.
      clientAuthConfigured:
        Boolean(process.env.ATLASSIAN_CLIENT_ID) && Boolean(process.env.ATLASSIAN_CLIENT_SECRET),
    })
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in } = tokens

  // Get the accessible Atlassian cloud resource (Jira instance)
  const resourcesRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  })

  if (!resourcesRes.ok) {
    return failConnect('no_resources', 'error', 'Could not list accessible Atlassian resources after Jira OAuth', {
      httpStatus: resourcesRes.status,
    })
  }

  const resources = await resourcesRes.json()
  if (!resources.length) {
    // The user authorised but has no Jira site on the account — their problem to fix,
    // not ours, so warning rather than error.
    return failConnect('no_jira_site', 'warning', 'Jira OAuth succeeded but the account has no accessible Jira site')
  }

  // Use first available cloud — single workspace assumption for now
  const cloud = resources[0]
  const cloudId = cloud.id
  const baseUrl = `https://api.atlassian.com/ex/jira/${cloudId}`

  // Get account info
  const meRes = await fetch('https://api.atlassian.com/me', {
    headers: { Authorization: `Bearer ${access_token}`, Accept: 'application/json' },
  })
  // Parse defensively: a malformed /me body previously threw an unhandled JSON error
  // here, after the token exchange had already succeeded.
  const meBody = await meRes.text()
  let me: { account_id?: string; email?: string } = {}
  if (meRes.ok) {
    try {
      me = JSON.parse(meBody)
    } catch (parseError) {
      captureAppError(parseError, {
        eventType: 'jira_oauth_me_parse_failed',
        userId: user.id,
        requestId,
        route: ROUTE,
        action: 'jira_oauth_callback',
        status: 'failed',
        errorCode: 'jira_oauth_me_parse_failed',
        details: { httpStatus: meRes.status, bodyLength: meBody.length },
      })
    }
  } else {
    captureAppEvent('Atlassian /me lookup failed during Jira OAuth', 'warning', {
      eventType: 'jira_oauth_me_failed',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'jira_oauth_callback',
      status: 'failed',
      errorCode: 'jira_oauth_me_failed',
      details: { httpStatus: meRes.status },
    })
  }
  const accountId = me.account_id ?? ''
  const email = me.email ?? ''

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  // This write is the whole point of the flow. If it fails the user is redirected to a
  // "connected!" page while nothing was actually saved — previously silent.
  const { error: credentialsError } = await supabase.from('jira_credentials').upsert({
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

  if (credentialsError) {
    captureAppError(credentialsError, {
      eventType: 'jira_credentials_write_failed',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'jira_oauth_callback',
      status: 'failed',
      errorCode: 'jira_credentials_write_failed',
      details: { dbCode: (credentialsError as { code?: string }).code },
    })
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_error=save_failed`)
  }

  captureAppEvent('Jira connected via OAuth', 'info', {
    eventType: 'jira_connected',
    userId: user.id,
    requestId,
    route: ROUTE,
    action: 'jira_oauth_callback',
    status: 'success',
    details: { cloudId, hasAccountId: Boolean(accountId) },
  })

  // Clean up state. Non-fatal — a stale row only forces the next connect to restart.
  const { error: stateCleanupError } = await supabase.from('jira_oauth_state').delete().eq('user_id', user.id)
  if (stateCleanupError) {
    captureAppError(stateCleanupError, {
      eventType: 'jira_oauth_state_cleanup_failed',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'jira_oauth_callback',
      status: 'failed',
      errorCode: 'jira_oauth_state_cleanup_failed',
    })
  }

  // pick_project prompts for a default Jira project on arrival — matching can't
  // work without one, and a fresh connection is the natural moment to ask.
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?jira_connected=1&pick_project=1`)
}
