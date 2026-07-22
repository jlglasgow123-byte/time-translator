import Stripe from 'stripe'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('Stripe secret key is not configured.')
  return new Stripe(secretKey)
}

export async function cancelStripeSubscription(stripeCustomerId: string | null | undefined) {
  if (!stripeCustomerId) return

  const stripe = getStripe()

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 10,
  })

  await Promise.all(
    subscriptions.data.map(sub => stripe.subscriptions.cancel(sub.id))
  )
}
