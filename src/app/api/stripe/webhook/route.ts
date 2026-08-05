import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { applyReferralReward } from '@/lib/billing/referral-reward'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'

const ROUTE = '/api/stripe/webhook'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe secret key is not configured.')
  return new Stripe(secretKey)
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers)
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')

  if (!sig) {
    captureAppEvent('Stripe webhook received without a signature header', 'error', {
      eventType: 'stripe_webhook_unsigned',
      requestId,
      route: ROUTE,
      action: 'stripe_webhook',
      status: 'failed',
      errorCode: 'stripe_webhook_unsigned',
    })
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhookSecret) {
    // Config failure, not a caller failure: every subscription change is being dropped
    // on the floor until this is set. Must be loud.
    captureAppEvent('STRIPE_WEBHOOK_SECRET is not configured — all Stripe webhooks are being rejected', 'error', {
      eventType: 'stripe_webhook_misconfigured',
      requestId,
      route: ROUTE,
      action: 'stripe_webhook',
      status: 'failed',
      errorCode: 'stripe_webhook_secret_missing',
    })
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 500 })
  }

  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, sig, webhookSecret)
  } catch (error) {
    // Previously a bare `catch {}`. A wrong webhook secret in production lands here on
    // EVERY event — payments succeed at Stripe while no subscription is ever activated,
    // and nothing anywhere recorded it. Also catches a missing STRIPE_SECRET_KEY, since
    // getStripe() throws; errorCode distinguishes the two.
    const secretKeyMissing = !process.env.STRIPE_SECRET_KEY
    captureAppError(error, {
      eventType: 'stripe_webhook_signature_invalid',
      requestId,
      route: ROUTE,
      action: 'stripe_webhook_verify',
      status: 'failed',
      errorCode: secretKeyMissing ? 'stripe_secret_key_missing' : 'stripe_webhook_signature_invalid',
      details: { signaturePresent: true, bodyLength: body.length },
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = await createClient()

  // Supabase returns errors in the result object rather than throwing, so an
  // unchecked `await supabase.from('profiles').update(...)` fails silently. On this
  // route that means the money moved at Stripe but entitlement never changed — the
  // user is charged and not upgraded, or cancels and keeps access. Every write below
  // goes through here so that can no longer happen unnoticed.
  async function applyProfileUpdate(
    update: Record<string, unknown>,
    match: { column: 'user_id' | 'stripe_customer_id'; value: string },
    context: { errorCode: string; userId?: string }
  ): Promise<boolean> {
    const { error } = await supabase.from('profiles').update(update).eq(match.column, match.value)
    if (error) {
      captureAppError(error, {
        eventType: 'stripe_profile_update_failed',
        userId: context.userId,
        requestId,
        route: ROUTE,
        action: 'stripe_apply_subscription_state',
        status: 'failed',
        errorCode: context.errorCode,
        details: {
          stripeEventType: event.type,
          stripeEventId: event.id,
          matchedOn: match.column,
          fields: Object.keys(update).join(','),
          dbCode: (error as { code?: string }).code,
        },
      })
      return false
    }
    return true
  }

  // Set when an entitlement write fails. We return 500 so Stripe retries the event
  // rather than acking a payment whose upgrade never landed — the daily error digest
  // could otherwise leave a paying user un-upgraded for up to a day. Stripe events are
  // replayed against the same handler, and every write here is idempotent.
  let writeFailed = false

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.user_id
      const tier = session.metadata?.tier === 'max_power' ? 'max_power' : 'paid_single_user'
      if (!userId || !session.customer || !session.subscription) {
        // A completed checkout we cannot attribute to a user. The payment succeeded, so
        // this needs manual reconciliation — never let it pass silently.
        captureAppEvent('Stripe checkout completed but could not be attributed to a user', 'error', {
          eventType: 'stripe_checkout_unattributable',
          requestId,
          route: ROUTE,
          action: 'stripe_apply_subscription_state',
          status: 'failed',
          errorCode: 'stripe_checkout_unattributable',
          details: {
            stripeEventId: event.id,
            hasUserId: Boolean(userId),
            hasCustomer: Boolean(session.customer),
            hasSubscription: Boolean(session.subscription),
            sessionId: session.id,
          },
        })
        break
      }

      if (!await applyProfileUpdate({
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        subscription_tier: tier,
        subscription_status: 'active',
        tier,
      }, { column: 'user_id', value: userId }, { errorCode: 'stripe_activation_write_failed', userId })) {
        writeFailed = true
      }

      // Reward any referrer whose referred user just made their first payment.
      // Guarded: a referral-reward failure must not fail the webhook, or Stripe will
      // retry an event whose subscription write already succeeded.
      try {
        await applyReferralReward(userId)
      } catch (rewardError) {
        captureAppError(rewardError, {
          eventType: 'referral_reward_failed',
          userId,
          requestId,
          route: ROUTE,
          action: 'apply_referral_reward',
          status: 'failed',
          errorCode: 'referral_reward_failed',
          details: { stripeEventId: event.id },
        })
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      const paidTier = sub.metadata?.tier === 'max_power' ? 'max_power' : 'paid_single_user'
      const isActive = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due'

      if (!await applyProfileUpdate({
        subscription_status: sub.status,
        subscription_tier: isActive ? paidTier : 'free_trial',
        tier: isActive ? paidTier : 'free_trial',
        subscription_current_period_end: sub.items?.data?.[0]?.current_period_end
          ? new Date(sub.items.data[0].current_period_end * 1000).toISOString()
          : null,
      }, { column: 'user_id', value: userId }, { errorCode: 'stripe_subscription_update_write_failed', userId })) {
        writeFailed = true
      }
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.user_id
      if (!userId) break

      if (!await applyProfileUpdate({
        subscription_status: 'canceled',
        subscription_tier: 'free_trial',
        tier: 'free_trial',
        stripe_subscription_id: null,
      }, { column: 'user_id', value: userId }, { errorCode: 'stripe_cancellation_write_failed', userId })) {
        writeFailed = true
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const customerId = invoice.customer as string
      if (!customerId) break

      if (!await applyProfileUpdate({
        subscription_status: 'past_due',
      }, { column: 'stripe_customer_id', value: customerId }, { errorCode: 'stripe_past_due_write_failed' })) {
        writeFailed = true
      }
      break
    }
  }

  // 500 makes Stripe retry with backoff, which usually clears a transient DB failure
  // long before a human would see the error digest.
  if (writeFailed) {
    return NextResponse.json({ error: 'Could not record subscription state.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
