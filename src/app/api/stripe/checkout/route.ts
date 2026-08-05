import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'
import { safeErrorResponse } from '@/lib/errors'

const ROUTE = '/api/stripe/checkout'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe secret key is not configured.')
  return new Stripe(secretKey)
}

export async function POST(req: Request) {
  const requestId = requestIdFromHeaders(req.headers)
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
    // A misconfigured price ID blocks every upgrade attempt for this tier — revenue is
    // being lost silently until someone notices. Loud on purpose.
    captureAppEvent('Stripe checkout is not configured — upgrade attempts are being rejected', 'error', {
      eventType: 'stripe_checkout_misconfigured',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'stripe_checkout',
      status: 'failed',
      errorCode: 'stripe_checkout_misconfigured',
      details: { requestedTier, annual, priceIdPresent: Boolean(priceId), appUrlPresent: Boolean(appUrl) },
    })
    return NextResponse.json({ error: 'Stripe checkout is not configured.' }, { status: 500 })
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    // Non-fatal: without an existing customer id Stripe creates one from the email.
    // Worth recording though — it can produce a duplicate Stripe customer.
    if (profileError) {
      captureAppError(profileError, {
        eventType: 'stripe_checkout_profile_read_failed',
        userId: user.id,
        requestId,
        route: ROUTE,
        action: 'stripe_checkout',
        status: 'failed',
        errorCode: 'stripe_checkout_profile_read_failed',
        details: { dbCode: (profileError as { code?: string }).code },
      })
    }

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
  } catch (error) {
    // Previously unhandled: a Stripe API failure threw straight out of the route,
    // giving the user a bare 500 and leaving no record of a failed upgrade.
    captureAppError(error, {
      eventType: 'stripe_checkout_failed',
      userId: user.id,
      requestId,
      route: ROUTE,
      action: 'stripe_checkout',
      status: 'failed',
      errorCode: 'stripe_checkout_session_failed',
      details: { requestedTier, annual },
    })
    return NextResponse.json(
      safeErrorResponse(error, 'Could not start checkout. Please try again, or contact support if it keeps happening.'),
      { status: 500 }
    )
  }
}
