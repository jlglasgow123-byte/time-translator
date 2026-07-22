export const TIER_AI_MONTHLY_LIMITS: Record<string, number> = {
  free: 200,
  free_trial: 200,
  trial: 200,
  paid: 5000,
  paid_single_user: 5000,
  single_user: 5000,
  pro: 5000,
  enterprise: Infinity,
}

export const AI_CALLS_PER_MINUTE_PER_USER = 200
// Keep below Vercel's 4.5 MB function payload limit after multipart overhead.
export const MAX_ICS_FILE_BYTES = 4 * 1024 * 1024
export const MAX_EVENTS_PER_IMPORT = 200
export const MAX_JIRA_TICKETS_PER_FETCH = 500
export const UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE = 20

export function tierAiMonthlyLimit(tier: string | null | undefined) {
  return TIER_AI_MONTHLY_LIMITS[tier ?? 'free'] ?? TIER_AI_MONTHLY_LIMITS.free
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}
