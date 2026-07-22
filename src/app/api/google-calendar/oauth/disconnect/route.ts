import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptGoogleCalendarToken } from '@/lib/crypto/google-calendar-token'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('google_calendar_credentials')
    .select('access_token')
    .eq('user_id', user.id)
    .maybeSingle()

  if (data?.access_token) {
    try {
      const accessToken = decryptGoogleCalendarToken(data.access_token)
      // Revoke at Google so the grant disappears from the user's Google Account
      // permissions page too, not just from our own storage.
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, { method: 'POST' })
    } catch (err) {
      console.error('[google-calendar/disconnect] token revoke failed', err)
    }
  }

  await supabase.from('google_calendar_credentials').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
