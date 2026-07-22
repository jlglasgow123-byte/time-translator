import { createServiceClient } from './service'

interface ConsumeAiUsageResult {
  allowed: boolean
  ai_calls: number
  remaining: number
}

export async function consumeAiUsage(userId: string, period: string, amount: number, limit: number) {
  const supabase = createServiceClient()
  const rpcLimit = Number.isFinite(limit) ? limit : -1

  const { data, error } = await supabase.rpc('consume_ai_usage', {
    p_user_id: userId,
    p_period: period,
    p_amount: amount,
    p_limit: rpcLimit,
  })

  if (error) throw error

  const result = Array.isArray(data) ? data[0] : data
  return result as ConsumeAiUsageResult
}

export async function refundAiUsage(userId: string, period: string, amount: number) {
  if (amount <= 0) return

  const supabase = createServiceClient()
  const { error } = await supabase.rpc('refund_ai_usage', {
    p_user_id: userId,
    p_period: period,
    p_amount: amount,
  })

  if (error) {
    console.error('[usage] failed to refund AI usage', {
      userId,
      period,
      amount,
      message: error.message,
    })
  }
}
