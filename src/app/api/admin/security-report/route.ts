import { NextRequest, NextResponse } from 'next/server'
import { buildSecurityReport, sendSecurityReportEmail, type CiCheckResult } from '@/lib/security-report'

// Called weekly by the GitHub Actions "weekly-security-report" workflow, which
// runs npm audit + security:check (real npm environment) and posts the results
// here. This route adds live checks (response headers, env config) and emails
// the combined report via Resend.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[security-report] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const ciChecks: CiCheckResult[] = Array.isArray(body.ciChecks) ? body.ciChecks : []

  try {
    const report = await buildSecurityReport(ciChecks)
    await sendSecurityReportEmail(report)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[security-report] unhandled error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
