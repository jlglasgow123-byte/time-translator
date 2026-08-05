// Monthly AI limits per tier live in src/lib/billing/entitlements.ts, as part of
// getUserEntitlement() — deliberately NOT duplicated here. A TIER_AI_MONTHLY_LIMITS
// table and a tierAiMonthlyLimit() helper used to sit in this file; both were removed
// 2026-08-05 because nothing read them and the table had drifted (no max_power row, so
// a Max Power tier looked up there would have silently got the 200 free-tier limit).
export const AI_CALLS_PER_MINUTE_PER_USER = 200
// Keep below Vercel's 4.5 MB function payload limit after multipart overhead.
export const MAX_ICS_FILE_BYTES = 4 * 1024 * 1024
export const MAX_EVENTS_PER_IMPORT = 200
export const MAX_JIRA_TICKETS_PER_FETCH = 500
export const UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE = 20
// Typeahead endpoints (Jira issue + project search) are driven by keystrokes, so each
// one is an outbound call to the user's Jira. Generous enough for real typing, low
// enough that a stuck client can't hammer their instance.
export const JIRA_LOOKUPS_PER_MINUTE_PER_USER = 60
// Jira's project search is a substring match over key and name, so a query longer
// than this is a stuck client rather than a real search. Truncated, not rejected.
export const MAX_JIRA_PROJECT_QUERY_LENGTH = 100

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} bytes`
}
