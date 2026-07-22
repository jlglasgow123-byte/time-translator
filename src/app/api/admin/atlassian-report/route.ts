import { NextRequest, NextResponse } from 'next/server'
import { runAtlassianReport } from '@/lib/atlassian-reporting'

// Called weekly by Supabase pg_cron via pg_net.
// Authenticated by CRON_SECRET header — no user session available.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[atlassian-report] CRON_SECRET env var not set')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[atlassian-report] job started')

  try {
    const summary = await runAtlassianReport()
    console.log('[atlassian-report] job complete', summary)
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    console.error('[atlassian-report] unhandled error', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
