const SITE_URL = 'https://www.timetranslator.com.au'
const NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'contact@timetranslator.com.au'

const EXPECTED_HEADERS = [
  'content-security-policy-report-only',
  'referrer-policy',
  'x-content-type-options',
  'x-frame-options',
]

export interface CiCheckResult {
  name: string
  ok: boolean
  detail: string
}

export interface SecurityReport {
  headerFindings: string[]
  liveChecks: CiCheckResult[]
  ciChecks: CiCheckResult[]
}

async function checkHeaders(): Promise<string[]> {
  const findings: string[] = []
  try {
    const res = await fetch(SITE_URL, { redirect: 'manual' })
    for (const header of EXPECTED_HEADERS) {
      if (!res.headers.get(header)) {
        findings.push(`Missing header: ${header}`)
      }
    }
  } catch (err) {
    findings.push(`Could not fetch ${SITE_URL} to check headers: ${String(err)}`)
  }
  return findings
}

function checkStripeWebhookConfigured(): CiCheckResult {
  const ok = Boolean(process.env.STRIPE_WEBHOOK_SECRET)
  return {
    name: 'Stripe webhook secret configured',
    ok,
    detail: ok ? 'STRIPE_WEBHOOK_SECRET is set' : 'STRIPE_WEBHOOK_SECRET is missing — webhook signature verification would fail closed, or worse, be unverified',
  }
}

function checkCronSecretConfigured(): CiCheckResult {
  const ok = Boolean(process.env.CRON_SECRET)
  return {
    name: 'Cron endpoints secret configured',
    ok,
    detail: ok ? 'CRON_SECRET is set' : 'CRON_SECRET is missing — admin cron routes would be unreachable or unauthenticated',
  }
}

export async function buildSecurityReport(ciChecks: CiCheckResult[]): Promise<SecurityReport> {
  const headerFindings = await checkHeaders()
  const liveChecks = [checkStripeWebhookConfigured(), checkCronSecretConfigured()]
  return { headerFindings, liveChecks, ciChecks }
}

function renderCheckRow(check: CiCheckResult): string {
  const color = check.ok ? '#2E7D32' : '#C62828'
  const status = check.ok ? 'PASS' : 'FAIL'
  return `<tr><td style="padding:4px 8px;color:${color};font-weight:600;">${status}</td><td style="padding:4px 8px;">${check.name}</td><td style="padding:4px 8px;color:#555;">${check.detail}</td></tr>`
}

export function renderReportHtml(report: SecurityReport): string {
  const hasFailures =
    report.headerFindings.length > 0 ||
    report.liveChecks.some(c => !c.ok) ||
    report.ciChecks.some(c => !c.ok)

  const headerSection = report.headerFindings.length
    ? `<ul>${report.headerFindings.map(f => `<li style="color:#C62828;">${f}</li>`).join('')}</ul>`
    : '<p style="color:#2E7D32;">All expected response headers present.</p>'

  const liveSection = `<table>${report.liveChecks.map(renderCheckRow).join('')}</table>`
  const ciSection = report.ciChecks.length
    ? `<table>${report.ciChecks.map(renderCheckRow).join('')}</table>`
    : '<p style="color:#C62828;">No CI check results were received — the GitHub Actions job may have failed to run or failed to report in.</p>'

  return `
    <h2>Weekly Security Report — ${hasFailures ? 'Action needed' : 'All clear'}</h2>
    <h3>HTTP response headers (${SITE_URL})</h3>
    ${headerSection}
    <h3>Live configuration checks</h3>
    ${liveSection}
    <h3>Code checks (npm audit, custom security:check — run in CI)</h3>
    ${ciSection}
  `
}

export async function sendSecurityReportEmail(report: SecurityReport) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured — cannot send security report email')
  }

  const hasFailures =
    report.headerFindings.length > 0 ||
    report.liveChecks.some(c => !c.ok) ||
    report.ciChecks.some(c => !c.ok)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Time Translator <noreply@timetranslator.com.au>',
      to: NOTIFY_EMAIL,
      subject: hasFailures
        ? '⚠️ Weekly Security Report — action needed'
        : '✅ Weekly Security Report — all clear',
      html: renderReportHtml(report),
    }),
  })

  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status} ${await res.text()}`)
  }
}
