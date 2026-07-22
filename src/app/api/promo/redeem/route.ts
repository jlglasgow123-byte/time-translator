import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const MILESTONE_COUNTS = [100, 200, 300]
const NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'contact@timetranslator.com.au'

async function sendMilestoneEmail(count: number, codeName: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Time Translator <noreply@timetranslator.com.au>',
      to: NOTIFY_EMAIL,
      subject: `🎉 ${count} people have used your ${codeName} promo code!`,
      html: `
        <p>Hi Jasmine,</p>
        <p>Your promo code <strong>${codeName}</strong> has just been redeemed by its <strong>${count}th user</strong>.</p>
        <p>The campaign is working — keep sharing!</p>
        <p>— Time Translator</p>
      `,
    }),
  })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  if (!code) return NextResponse.json({ error: 'No code provided.' }, { status: 400 })

  const admin = createServiceClient()

  // Look up the code
  const { data: promoCode, error: codeError } = await admin
    .from('promo_codes')
    .select('id, code, grants_tier, promo_duration_days, expires_at, max_uses')
    .eq('code', code)
    .maybeSingle()

  if (codeError || !promoCode) {
    return NextResponse.json({ error: 'Invalid promo code.' }, { status: 400 })
  }

  // Check expiry
  if (new Date(promoCode.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This promo code has expired.' }, { status: 400 })
  }

  // Check max uses
  if (promoCode.max_uses !== null) {
    const { count } = await admin
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promo_code_id', promoCode.id)

    if ((count ?? 0) >= promoCode.max_uses) {
      return NextResponse.json({ error: 'This promo code has reached its limit.' }, { status: 400 })
    }
  }

  // Check if user already redeemed this code
  const { data: existing } = await admin
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code_id', promoCode.id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'You have already redeemed this code.' }, { status: 400 })
  }

  // Calculate promo end date from today
  const promoEndsAt = new Date()
  promoEndsAt.setDate(promoEndsAt.getDate() + promoCode.promo_duration_days)

  // Record redemption
  const { error: insertError } = await admin
    .from('promo_redemptions')
    .insert({
      promo_code_id: promoCode.id,
      user_id: user.id,
      promo_ends_at: promoEndsAt.toISOString(),
    })

  if (insertError) {
    return NextResponse.json({ error: 'Could not redeem code. Please try again.' }, { status: 500 })
  }

  // Grant Pro access on the user's profile
  await admin
    .from('profiles')
    .update({
      subscription_tier: promoCode.grants_tier,
      subscription_status: 'active',
      subscription_current_period_end: promoEndsAt.toISOString(),
    })
    .eq('user_id', user.id)

  // Count total redemptions and check milestones
  const { count: totalCount } = await admin
    .from('promo_redemptions')
    .select('id', { count: 'exact', head: true })
    .eq('promo_code_id', promoCode.id)

  if (totalCount && MILESTONE_COUNTS.includes(totalCount)) {
    await sendMilestoneEmail(totalCount, promoCode.code)
  }

  return NextResponse.json({
    success: true,
    promoEndsAt: promoEndsAt.toISOString(),
    tier: promoCode.grants_tier,
  })
}
