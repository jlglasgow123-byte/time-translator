import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserEntitlement } from '@/lib/billing/entitlements'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const entitlement = await getUserEntitlement(supabase, user.id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ entitlement, hasStripeSubscription: Boolean(profile?.stripe_customer_id) })
}
