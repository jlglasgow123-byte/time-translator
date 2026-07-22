import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe secret key is not configured.')
  return new Stripe(secretKey)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestedTier = body.tier === 'max_power' ? 'max_power' : 'pro'
  const annual = body.annual === true

  const priceId = requestedTier === 'max_power'
    ? (annual ? process.env.STRIPE_MAX_POWER_ANNUAL_PRICE_ID : process.env.STRIPE_MAX_POWER_PRICE_ID)
    : (annual ? process.env.STRIPE_PRO_ANNUAL_PRICE_ID : process.env.STRIPE_PRO_MONTHLY_PRICE_ID)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!priceId || !appUrl) {
    return NextResponse.json({ error: 'Stripe checkout is not configured.' }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single()

  const session = await getStripe().checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    customer: profile?.stripe_customer_id ?? undefined,
    customer_email: profile?.stripe_customer_id ? undefined : user.email,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/settings?upgraded=1`,
    cancel_url: `${appUrl}/settings`,
    metadata: { user_id: user.id, tier: requestedTier },
    subscription_data: { metadata: { user_id: user.id, tier: requestedTier } },
  })

  return NextResponse.json({ url: session.url })
}
