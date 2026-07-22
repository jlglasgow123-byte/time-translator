import type { SupabaseClient } from '@supabase/supabase-js'

export type EntitlementTier = 'free_trial' | 'paid_single_user' | 'max_power'
export type EntitlementStatus = 'trialing' | 'active' | 'trial_expired' | 'past_due' | 'canceled' | 'blocked'

export interface UserEntitlement {
  tier: EntitlementTier
  status: EntitlementStatus
  monthlyAiLimit: number
  canUseAi: boolean
  trialEndsAt: string
  subscriptionCurrentPeriodEnd: string | null
  reason?: string
}

const FREE_TRIAL_AI_MONTHLY_LIMIT = 200
const PAID_SINGLE_USER_AI_MONTHLY_LIMIT = 5000
const MAX_POWER_AI_MONTHLY_LIMIT = 50000

interface ProfileLifecycleRow {
  tier?: string | null
  trial_started_at?: string | null
  trial_ends_at?: string | null
  subscription_tier?: string | null
  subscription_status?: string | null
  subscription_current_period_end?: string | null
  access_blocked_at?: string | null
  access_block_reason?: string | null
  is_admin?: boolean | null
}

function inFuture(value: string | null | undefined) {
  return Boolean(value && new Date(value).getTime() > Date.now())
}

function normalizeTier(value: string | null | undefined): EntitlementTier {
  if (value === 'max_power') return 'max_power'
  if (value === 'paid' || value === 'single_user' || value === 'pro' || value === 'paid_single_user') {
    return 'paid_single_user'
  }
  return 'free_trial'
}

function fallbackTrialEnd() {
  const end = new Date()
  end.setDate(end.getDate() + 30)
  return end.toISOString()
}

async function createDefaultProfile(supabase: SupabaseClient, userId: string) {
  const now = new Date()
  const trialEnds = new Date(now)
  trialEnds.setDate(trialEnds.getDate() + 30)

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: userId,
      tier: 'free_trial',
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnds.toISOString(),
      subscription_tier: 'free_trial',
      subscription_status: 'trialing',
    })
    .select('tier, trial_started_at, trial_ends_at, subscription_tier, subscription_status, subscription_current_period_end, access_blocked_at, access_block_reason')
    .single()

  if (error) throw error
  return data as ProfileLifecycleRow
}

export async function getUserEntitlement(supabase: SupabaseClient, userId: string): Promise<UserEntitlement> {
  const { data, error } = await supabase
    .from('profiles')
    .select('tier, trial_started_at, trial_ends_at, subscription_tier, subscription_status, subscription_current_period_end, access_blocked_at, access_block_reason, is_admin')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error

  const profile = (data as ProfileLifecycleRow | null) ?? await createDefaultProfile(supabase, userId)

  if (profile.is_admin) {
    return {
      tier: 'max_power',
      status: 'active',
      monthlyAiLimit: MAX_POWER_AI_MONTHLY_LIMIT,
      canUseAi: true,
      trialEndsAt: profile.trial_ends_at ?? fallbackTrialEnd(),
      subscriptionCurrentPeriodEnd: null,
    }
  }

  if (profile.access_blocked_at) {
    return {
      tier: normalizeTier(profile.subscription_tier ?? profile.tier),
      status: 'blocked',
      monthlyAiLimit: 0,
      canUseAi: false,
      trialEndsAt: profile.trial_ends_at ?? fallbackTrialEnd(),
      subscriptionCurrentPeriodEnd: profile.subscription_current_period_end ?? null,
      reason: profile.access_block_reason ?? 'Account access is blocked.',
    }
  }

  const tier = normalizeTier(profile.subscription_tier ?? profile.tier)
  const status = profile.subscription_status ?? 'trialing'
  const trialEndsAt = profile.trial_ends_at ?? fallbackTrialEnd()
  const subscriptionCurrentPeriodEnd = profile.subscription_current_period_end ?? null

  if (tier === 'paid_single_user' || tier === 'max_power') {
    const paidActive = status === 'active' || status === 'trialing'
    const paidPastDueButCurrent = status === 'past_due' && inFuture(subscriptionCurrentPeriodEnd)

    return {
      tier,
      status: paidActive ? 'active' : status === 'past_due' ? 'past_due' : status === 'canceled' ? 'canceled' : 'blocked',
      monthlyAiLimit: tier === 'max_power' ? MAX_POWER_AI_MONTHLY_LIMIT : PAID_SINGLE_USER_AI_MONTHLY_LIMIT,
      canUseAi: paidActive || paidPastDueButCurrent,
      trialEndsAt,
      subscriptionCurrentPeriodEnd,
      reason: paidActive || paidPastDueButCurrent ? undefined : 'Paid subscription is not active.',
    }
  }

  const trialActive = status === 'trialing' && inFuture(trialEndsAt)

  return {
    tier: 'free_trial',
    status: trialActive ? 'trialing' : 'trial_expired',
    monthlyAiLimit: FREE_TRIAL_AI_MONTHLY_LIMIT,
    canUseAi: trialActive,
    trialEndsAt,
    subscriptionCurrentPeriodEnd,
    reason: trialActive ? undefined : 'Free trial has expired.',
  }
}
