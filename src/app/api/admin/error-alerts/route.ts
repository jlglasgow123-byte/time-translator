import { NextRequest, NextResponse } from 'next/server'
import { checkAndAlertOnErrors } from '@/lib/error-alerts'

// Called every 15 minutes by Vercel cron (see vercel.json). Polls app_system_events
// for recent error-severity rows and emails the admin a digest if any exist.
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
