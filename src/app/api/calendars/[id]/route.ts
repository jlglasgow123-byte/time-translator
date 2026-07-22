import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserEntitlement } from '@/lib/billing/entitlements'
import { safeErrorResponse } from '@/lib/errors'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const entitlement = await getUserEntitlement(supabase, user.id)

  // Pro users cannot remove their one locked calendar (support-only change)
  // Trial users can remove freely (unlimited calendars during trial)
  if (entitlement.tier === 'paid_single_user') {
    return NextResponse.json(
      { error: 'Pro accounts cannot remove their linked calendar. Contact support if you need to change it, or upgrade to Max Power.' },
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('linked_calendars')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json(safeErrorResponse(error, 'Could not remove that calendar. Please try again.'), { status: 500 })
  return NextResponse.json({ ok: true })
}
