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

  // Throw rather than swallow. A failed refund leaves the user charged AI quota they
  // should have got back, against a capped monthly allowance — callers must be able to
  // tell success from failure so they do not report a refund that never happened.
  // Every caller is responsible for catching this: a refund failure must never fail the
  // user's import.
  if (error) {
    console.error('[usage] failed to refund AI usage', {
      userId,
      period,
      amount,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    // The Postgres error code is carried in the message deliberately: captureAppError
    // persists only `message`, and the code is what distinguishes a missing RPC or a
    // permission failure (a deploy problem) from a transient network error when
    // triaging from the daily digest. `cause` keeps the original for anything local.
    const code = error.code ? ` [${error.code}]` : ''
    throw new Error(`refund_ai_usage RPC failed${code}: ${error.message}`, { cause: error })
  }
}
