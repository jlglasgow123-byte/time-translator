import { Redis } from '@upstash/redis/cloudflare'
import { Ratelimit } from '@upstash/ratelimit'

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set')
  }
  return new Redis({ url, token })
}

// Cache limiter instances per key pattern so we don't recreate on every request
const limiters = new Map<string, Ratelimit>()

function getLimiter(id: string, limit: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${id}:${limit}:${windowSeconds}`
  if (!limiters.has(cacheKey)) {
    limiters.set(
      cacheKey,
      new Ratelimit({
        redis: getRedis(),
        limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
        prefix: `rl:${id}`,
      })
    )
  }
  return limiters.get(cacheKey)!
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

/**
 * Sliding-window rate limit backed by Upstash Redis.
 * amount > 1 consumes multiple tokens in one call (e.g. batch of events).
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  amount = 1,
): Promise<RateLimitResult> {
  const limiter = getLimiter(`${limit}:${windowSeconds}`, limit, windowSeconds)
  const { success, remaining, reset } = await limiter.limit(key, { rate: amount })
  return {
    allowed: success,
    remaining,
    resetAt: reset,
  }
}
