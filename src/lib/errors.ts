// Shared error-handling convention: turns raw errors (Supabase, Jira, Google,
// Anthropic, fetch failures) into a plain-English message a non-technical user
// can act on, so individual routes/components stop hand-rolling ad-hoc rewrites.
//
// Server-side usage (in a route's catch block):
//   return NextResponse.json({ error: toUserMessage(err) }, { status: 500 })
//
// Client-side usage (rendering an error string that came back from any API):
//   <p>{toUserMessage(error)}</p>
//
// Both directions go through the same rewrite table below, so "the same class
// of failure reads the same everywhere" instead of being reworded per page.

const KNOWN_MESSAGE_REWRITES: Array<{ match: RegExp; rewrite: string }> = [
  {
    match: /jira account is not connected|please connect your time translator account/i,
    rewrite: 'Please connect your Time Translator account to your Jira Account in Settings.',
  },
  {
    match: /jira connection has expired|reconnect jira in settings/i,
    rewrite: 'Your Jira connection has expired. Please reconnect Jira in Settings.',
  },
  {
    match: /google calendar connection has expired|reconnect.*google/i,
    rewrite: 'Your Google Calendar connection has expired. Please reconnect in Settings.',
  },
  {
    match: /session has expired|sign in and try again/i,
    rewrite: 'Your session has expired — please sign in and try again.',
  },
  {
    match: /rate limit/i,
    rewrite: "You've hit the rate limit. Please wait a moment and try again.",
  },
  {
    match: /too large|maximum size/i,
    rewrite: 'That file is too large to process. Please use a smaller file.',
  },
  {
    match: /could not reach your jira account|check your jira url/i,
    rewrite: 'Could not reach your Jira account. Please check your Jira URL in Settings.',
  },
]

// Errors we consider already safe to show verbatim — hand-written by this
// codebase for a specific user-facing situation (concrete next action included).
const SAFE_PASSTHROUGH = /please (connect|reconnect|check|contact|sign in|upgrade)|please try again|is already linked|are limited to|cannot exceed|up to \d+ events/i

export function toUserMessage(input: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = input instanceof Error ? input.message : typeof input === 'string' ? input : ''
  if (!raw) return fallback

  for (const { match, rewrite } of KNOWN_MESSAGE_REWRITES) {
    if (match.test(raw)) return rewrite
  }

  if (SAFE_PASSTHROUGH.test(raw)) return raw

  // Unknown shape (raw DB/HTTP/library error) — never show it verbatim.
  return fallback
}

// For server routes: logs the real error server-side (so it's still diagnosable
// via app_system_events / server logs) while returning a safe message to the client.
export function safeErrorResponse(err: unknown, fallback?: string): { error: string } {
  console.error('[errors] unhandled error', err)
  return { error: toUserMessage(err, fallback) }
}
