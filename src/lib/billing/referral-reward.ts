import { createServiceClient } from '@/lib/supabase/service'

const REWARD_DAYS = 30
const NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'contact@timetranslator.com.au'

async function sendReferralRewardEmail(referrerEmail: string) {
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
      to: referrerEmail,
      bcc: NOTIFY_EMAIL,
      subject: 'You referred a friend — enjoy another month on us!',
      html: `
        <p>Hi there,</p>
        <p>Someone you referred just became a paying Time Translator customer. 🎉</p>
        <p>As a thank you, we've added <strong>30 days of free Pro access</strong> to your account.</p>
        <p>Keep sharing — every friend who subscribes earns you another free month.</p>
        <p>— The Time Translator team</p>
      `,
    }),
  })
}

/**
 * Called when a referred user makes their first payment.
 * Finds any unrewarded referral for this user, checks the referrer still has
 * active Pro, extends their subscription_current_period_end by 30 days, and
 * sends a reward email.
 */
export async function applyReferralReward(referredUserId: string) {
  const admin = createServiceClient()

  // Find an unrewarded referral for this new paying user
  const { data: referral } = await admin
    .from('referrals')
    .select('id, referrer_email, referrer_user_id')
    .eq('referred_user_id', referredUserId)
    .is('rewarded_at', null)
    .maybeSingle()

  if (!referral) return

  // Resolve referrer_user_id if it wasn't set at signup time
  let referrerUserId = referral.referrer_user_id
  if (!referrerUserId) {
    const { data: usersData } = await admin.auth.admin.listUsers()
    const match = usersData?.users?.find(u => u.email?.toLowerCase() === referral.referrer_email.toLowerCase())
    referrerUserId = match?.id ?? null
  }

  if (!referrerUserId) {
    // Referrer email doesn't match any account — mark as non-rewardable
    await admin.from('referrals').update({ rewarded_at: new Date().toISOString(), reward_days: 0 }).eq('id', referral.id)
    return
  }

  // Only reward if referrer currently has active Pro
  const { data: referrerProfile } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status, subscription_current_period_end')
    .eq('user_id', referrerUserId)
    .maybeSingle()

  const isActivePro =
    (referrerProfile?.subscription_tier === 'paid_single_user' || referrerProfile?.subscription_tier === 'max_power') &&
    (referrerProfile?.subscription_status === 'active' || referrerProfile?.subscription_status === 'trialing')

  if (!isActivePro) {
    // Don't reward — mark so we don't retry
    await admin.from('referrals').update({ rewarded_at: new Date().toISOString(), reward_days: 0 }).eq('id', referral.id)
    return
  }

  // Extend their period end by REWARD_DAYS
  const currentEnd = referrerProfile?.subscription_current_period_end
    ? new Date(referrerProfile.subscription_current_period_end)
    : new Date()
  currentEnd.setDate(currentEnd.getDate() + REWARD_DAYS)

  await admin
    .from('profiles')
    .update({ subscription_current_period_end: currentEnd.toISOString() })
    .eq('user_id', referrerUserId)

  // Mark referral as rewarded
  await admin
    .from('referrals')
    .update({
      rewarded_at: new Date().toISOString(),
      reward_days: REWARD_DAYS,
      referrer_user_id: referrerUserId,
    })
    .eq('id', referral.id)

  // Email the referrer
  await sendReferralRewardEmail(referral.referrer_email)
}
