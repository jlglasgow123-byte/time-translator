import { createServiceClient } from '@/lib/supabase/service'
import { decryptJiraToken, encryptJiraToken } from '@/lib/crypto/jira-token'

// Loads the app-owner Atlassian access token from app_atlassian_credentials (id=1).
// Auto-refreshes if expired or within 5 minutes of expiry.
// Used exclusively by the Personal Data Reporting API job — never for user requests.
export async function getAppAtlassianToken(): Promise<string> {
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('app_atlassian_credentials')
    .select('access_token, refresh_token, expires_at')
    .eq('id', 1)
    .single()

  if (error || !data) {
    throw new Error('app_atlassian_credentials row not found — run /api/admin/atlassian-app-auth to set up app-owner token')
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  if (!needsRefresh) {
    return decryptJiraToken(data.access_token)
  }

  if (!data.refresh_token) {
    throw new Error('app_atlassian_credentials has no refresh_token — re-run /api/admin/atlassian-app-auth to get a fresh token')
  }

  const refreshToken = decryptJiraToken(data.refresh_token)

  const res = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: process.env.ATLASSIAN_CLIENT_ID,
      client_secret: process.env.ATLASSIAN_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`app_atlassian_credentials token refresh failed (${res.status}): ${body} — re-run /api/admin/atlassian-app-auth`)
  }

  const tokens = await res.json()
  const { access_token, refresh_token: new_refresh_token, expires_in } = tokens
  const newExpiresAt = new Date(Date.now() + (expires_in ?? 3600) * 1000).toISOString()

  await supabase.from('app_atlassian_credentials').update({
    access_token: encryptJiraToken(access_token),
    refresh_token: new_refresh_token ? encryptJiraToken(new_refresh_token) : data.refresh_token,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq('id', 1)

  return access_token
}
