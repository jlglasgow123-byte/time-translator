import { createClient } from './server'
import { createServiceClient } from './service'
import { NextResponse } from 'next/server'
import { decryptJiraToken, encryptJiraToken } from '@/lib/crypto/jira-token'
import type { JiraCredentials } from '@/lib/jira-client'

export const JIRA_CONNECTION_REQUIRED_MESSAGE = 'Please connect your Time Translator account to your Jira Account in Settings'

type CredsError = { __credsError: true; response: NextResponse }
export type CredsResult = JiraCredentials | CredsError

function credsError(response: NextResponse): CredsError {
  return { __credsError: true, response }
}

export function isCredsError(r: CredsResult): r is CredsError {
  return (r as CredsError).__credsError === true
}

export function credsErrorResponse(r: CredsError): NextResponse {
  return r.response
}

async function refreshAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, encryptedRefreshToken: string): Promise<string | null> {
  const refreshToken = decryptJiraToken(encryptedRefreshToken)

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

  if (!res.ok) return null

  const tokens = await res.json()
  const { access_token, refresh_token: new_refresh_token, expires_in } = tokens
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  await supabase.from('jira_credentials').update({
    access_token: encryptJiraToken(access_token),
    refresh_token: encryptJiraToken(new_refresh_token ?? refreshToken),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return access_token
}

export async function getJiraCreds(): Promise<CredsResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return credsError(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }

  const { data } = await supabase
    .from('jira_credentials')
    .select('base_url, email, access_token, refresh_token, expires_at')
    .eq('user_id', user.id)
    .single()

  if (!data || !data.access_token) {
    return credsError(NextResponse.json(
      { error: JIRA_CONNECTION_REQUIRED_MESSAGE },
      { status: 400 }
    ))
  }

  // Check if access token is expired or within 5 minutes of expiry
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  let accessToken: string

  if (needsRefresh && data.refresh_token) {
    const refreshed = await refreshAccessToken(supabase, user.id, data.refresh_token)
    if (!refreshed) {
      await supabase.from('jira_credentials').delete().eq('user_id', user.id)
      return credsError(NextResponse.json(
        { error: 'Your Jira connection has expired. Please reconnect Jira in Settings.' },
        { status: 401 }
      ))
    }
    accessToken = refreshed
  } else {
    accessToken = decryptJiraToken(data.access_token)
  }

  return { baseUrl: data.base_url, accessToken }
}

// Service-client variant for background jobs (no user session available).
// Returns null if the user has no credentials or their token cannot be refreshed.
export async function getJiraCredsForUser(userId: string): Promise<JiraCredentials | null> {
  const supabase = createServiceClient()

  const { data } = await supabase
    .from('jira_credentials')
    .select('base_url, access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .single()

  if (!data || !data.access_token) return null

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  if (!needsRefresh) {
    return { baseUrl: data.base_url, accessToken: decryptJiraToken(data.access_token) }
  }

  if (!data.refresh_token) return null

  const refreshed = await refreshAccessToken(supabase as any, userId, data.refresh_token)
  if (!refreshed) {
    await supabase.from('jira_credentials').delete().eq('user_id', userId)
    return null
  }

  return { baseUrl: data.base_url, accessToken: refreshed }
}
