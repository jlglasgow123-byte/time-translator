import { createServiceClient } from '@/lib/supabase/service'

const NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'contact@timetranslator.com.au'
// Vercel Hobby cron only supports daily invocations, so this runs once/day and
// looks back 24h + a small buffer to tolerate a delayed invocation without gaps.
const LOOKBACK_MINUTES = 24 * 60 + 15

interface SystemEventRow {
  id: string
  event_type: string
  message: string
  error_code: string | null
  route: string | null
  user_id: string | null
  created_at: string
}

export interface ErrorAlertSummary {
  checked: boolean
  errorCount: number
  emailed: boolean
}

function renderEmailHtml(events: SystemEventRow[]): string {
  const rows = events
    .map(
      e => `<tr>
        <td style="padding:4px 8px;color:#555;">${e.created_at}</td>
        <td style="padding:4px 8px;font-weight:600;">${e.event_type}</td>
        <td style="padding:4px 8px;">${e.message}</td>
        <td style="padding:4px 8px;color:#555;">${e.route ?? ''}</td>
      </tr>`
    )
    .join('')

  return `
    <h2>⚠️ ${events.length} error${events.length === 1 ? '' : 's'} in the last 24 hours</h2>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr><th align="left">Time</th><th align="left">Type</th><th align="left">Message</th><th align="left">Route</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="color:#777;font-size:12px;">Full details in /admin/system-events.</p>
  `
}

async function sendErrorAlertEmail(events: SystemEventRow[]) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY not configured — cannot send error alert email')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Time Translator <noreply@timetranslator.com.au>',
      to: NOTIFY_EMAIL,
      subject: `⚠️ ${events.length} production error${events.length === 1 ? '' : 's'} — Time Translator`,
      html: renderEmailHtml(events),
    }),
  })

  if (!res.ok) throw new Error(`Resend API error: ${res.status} ${await res.text()}`)
}

// Polls app_system_events for error-severity rows in the lookback window and emails
// a digest if any are found. Designed to be called by a Vercel cron route (not
// pg_cron/pg_net — Supabase restricts passing secrets via custom GUC params, so
// the existing working pattern in this repo is Vercel cron hitting an API route).
export async function checkAndAlertOnErrors(): Promise<ErrorAlertSummary> {
  const supabase = createServiceClient()
  const since = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('app_system_events')
    .select('id, event_type, message, error_code, route, user_id, created_at')
    .eq('severity', 'error')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('[error-alerts] failed to query app_system_events', error.message)
    return { checked: false, errorCount: 0, emailed: false }
  }

  const events = (data ?? []) as SystemEventRow[]
  if (events.length === 0) return { checked: true, errorCount: 0, emailed: false }

  await sendErrorAlertEmail(events)
  return { checked: true, errorCount: events.length, emailed: true }
}
