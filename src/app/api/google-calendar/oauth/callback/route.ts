import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { encryptGoogleCalendarToken } from '@/lib/crypto/google-calendar-token'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`)

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gcal_error=oauth_failed`)
  }

  const { data: storedState } = await supabase
    .from('google_calendar_oauth_state')
    .select('state')
    .eq('user_id', user.id)
    .single()

  if (!storedState || storedState.state !== state) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gcal_error=invalid_state`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/google-calendar/oauth/callback`,
    }),
  })

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gcal_error=token_exchange_failed`)
  }

  const tokens = await tokenRes.json()
  const { access_token, refresh_token, expires_in } = tokens

  if (!refresh_token) {
    // Google only returns a refresh_token on first-ever consent (or with prompt=consent, which we set).
    // If missing, the exchange can't sustain background sync — surface as an error rather than storing a dead-end token.
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gcal_error=no_refresh_token`)
  }

  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const userInfo = userInfoRes.ok ? await userInfoRes.json() : {}
  const googleEmail = userInfo.email ?? ''

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  await supabase.from('google_calendar_credentials').upsert({
    user_id: user.id,
    google_email: googleEmail,
    access_token: encryptGoogleCalendarToken(access_token),
    refresh_token: encryptGoogleCalendarToken(refresh_token),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  // Mutually exclusive import mechanisms: Google Calendar is now the user's one
  // calendar, so any .ics-linked calendars are replaced by this connection.
  await supabase.from('linked_calendars').delete().eq('user_id', user.id)

  await supabase.from('google_calendar_oauth_state').delete().eq('user_id', user.id)

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/settings?gcal_connected=1`)
}
