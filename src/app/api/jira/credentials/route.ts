import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('jira_credentials')
    .select('email, access_token')
    .eq('user_id', user.id)
    .single()

  if (!data) {
    return NextResponse.json({ connected: false, email: null })
  }

  return NextResponse.json({
    connected: Boolean(data.access_token),
    email: data.email ?? null,
  })
}
