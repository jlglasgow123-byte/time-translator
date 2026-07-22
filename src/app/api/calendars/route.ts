import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserEntitlement } from '@/lib/billing/entitlements'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('linked_calendars')
    .select('id, calendar_name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json(safeErrorResponse(error, 'Could not load your linked calendars. Please try again.'), { status: 500 })
  return NextResponse.json({ calendars: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { calendar_name } = await req.json()
  if (!calendar_name || typeof calendar_name !== 'string' || !calendar_name.trim()) {
    return NextResponse.json({ error: 'Calendar name is required.' }, { status: 400 })
  }

  const entitlement = await getUserEntitlement(supabase, user.id)

  // Pro: max 1 calendar, locked after first link
  if (entitlement.tier === 'paid_single_user') {
    const { data: existing } = await supabase
      .from('linked_calendars')
      .select('id')
      .eq('user_id', user.id)
    if (existing && existing.length >= 1) {
      return NextResponse.json(
        { error: 'Pro accounts are limited to one linked calendar. Upgrade to Max Power to link multiple calendars.' },
        { status: 403 }
      )
    }
  }

  // Trial: unlimited calendars (same as Max Power) — encourages upgrade to Max Power at trial end

  const { data, error } = await supabase
    .from('linked_calendars')
    .insert({ user_id: user.id, calendar_name: calendar_name.trim() })
    .select('id, calendar_name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'This calendar is already linked.' }, { status: 409 })
    }
    return NextResponse.json(safeErrorResponse(error, 'Could not link that calendar. Please try again.'), { status: 500 })
  }

  return NextResponse.json({ calendar: data })
}
