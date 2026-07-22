import { createHash } from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'
import { cancelStripeSubscription } from '@/lib/billing/cancel-stripe-subscription'

export async function deleteUserById(userId: string): Promise<{ error?: string }> {
  const supabase = createServiceClient()

  const { data: { user } } = await supabase.auth.admin.getUserById(userId)

  // If user is already gone, nothing to do — treat as success
  if (!user) return {}

  const emailHash = createHash('sha256').update((user.email ?? '').toLowerCase().trim()).digest('hex')

  await supabase.from('account_deletion_log').insert({ user_id: userId, email_hash: emailHash, deleted_by: 'system' })

  const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('user_id', userId).single()
  await cancelStripeSubscription(profile?.stripe_customer_id)

  await Promise.all([
    supabase.from('jira_credentials').delete().eq('user_id', userId),
    supabase.from('usage').delete().eq('user_id', userId),
    supabase.from('promo_redemptions').delete().eq('user_id', userId),
    supabase.from('referrals').delete().or(`referred_user_id.eq.${userId},referrer_user_id.eq.${userId}`),
  ])

  // Cascades: profiles, import_runs, import_event_traces, jira_worklogs, linked_calendars.
  // app_system_events nullifies user_id via SET NULL.
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }

  return {}
}
