import { NextRequest, NextResponse } from 'next/server'
import { checkAndAlertOnErrors } from '@/lib/error-alerts'

// Called once daily by Vercel cron at 21:00 UTC (see vercel.json) — Vercel Hobby does
// not support sub-daily cron. Polls app_system_events for recent error-severity rows and
// emails the admin a digest if any exist. Because the cadence is daily, this is NOT a
// real-time alerting channel: watch /admin/system-events directly when a problem is
// expected (e.g. launch day). See Project_Model.md §6, 2026-08-03.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[error-alerts] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await checkAndAlertOnErrors()
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    console.error('[error-alerts] unhandled error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
