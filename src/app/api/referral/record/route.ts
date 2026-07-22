import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const referrerEmail = typeof body.referrerEmail === 'string' ? body.referrerEmail.trim().toLowerCase() : ''
  if (!referrerEmail) return NextResponse.json({ error: 'No email provided.' }, { status: 400 })

  // Can't refer yourself
  if (referrerEmail === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'You cannot refer yourself.' }, { status: 400 })
  }

  const admin = createServiceClient()

  // Resolve referrer email to a user_id if the account exists
  const { data: referrerLookup } = await admin.auth.admin.listUsers()
  const referrerUser = referrerLookup?.users?.find(u => u.email?.toLowerCase() === referrerEmail)
  const referrerProfile = referrerUser ? { user_id: referrerUser.id } : null

  // Upsert — if the user already recorded a referral, ignore
  const { error } = await admin
    .from('referrals')
    .upsert(
      {
        referred_user_id: user.id,
        referrer_email: referrerEmail,
        referrer_user_id: referrerProfile?.user_id ?? null,
      },
      { onConflict: 'referred_user_id', ignoreDuplicates: true }
    )

  if (error) {
    return NextResponse.json({ error: 'Could not save referral.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
