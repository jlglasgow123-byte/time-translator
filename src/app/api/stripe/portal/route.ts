import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { captureAppError, captureAppEvent } from '@/lib/observability'
import { safeErrorResponse } from '@/lib/errors'

const ROUTE = '/api/stripe/portal'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe secret key is not configured.')
  return new Stripe(secretKey)
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    captureAppEvent('NEXT_PUBLIC_APP_URL is not configured — billing portal is unreachable', 'error', {
      eventType: 'stripe_portal_misconfigured',
      userId: user.id,
      route: ROUTE,
      action: 'stripe_portal',
      status: 'failed',
      errorCode: 'stripe_portal_misconfigured',
    })
    return NextResponse.json({ error: 'App URL is not configured.' }, { status: 500 })
  }

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single()

    if (profileError) {
      captureAppError(profileError, {
        eventType: 'stripe_portal_profile_read_failed',
        userId: user.id,
        route: ROUTE,
        action: 'stripe_portal',
        status: 'failed',
        errorCode: 'stripe_portal_profile_read_failed',
        details: { dbCode: (profileError as { code?: string }).code },
      })
    }

    // Expected for anyone who has never subscribed — a warning, not an error, so it
    // does not page. A paying user hitting this would be a real bug, which is why the
    // event is recorded at all rather than just returning 400.
    if (!profile?.stripe_customer_id) {
      captureAppEvent('Billing portal requested with no Stripe customer on the profile', 'warning', {
        eventType: 'stripe_portal_no_customer',
        userId: user.id,
        route: ROUTE,
        action: 'stripe_portal',
        status: 'failed',
        errorCode: 'stripe_portal_no_customer',
        details: { profileReadFailed: Boolean(profileError) },
      })
      return NextResponse.json({ error: 'No billing account found.' }, { status: 400 })
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${appUrl}/settings`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    // Previously unhandled: a paying customer unable to reach the portal cannot cancel
    // or update their card, which turns into a chargeback rather than a support ticket.
    captureAppError(error, {
      eventType: 'stripe_portal_failed',
      userId: user.id,
      route: ROUTE,
      action: 'stripe_portal',
      status: 'failed',
      errorCode: 'stripe_portal_session_failed',
    })
    return NextResponse.json(
      safeErrorResponse(error, 'Could not open the billing portal. Please try again, or contact support if it keeps happening.'),
      { status: 500 }
    )
  }
}
