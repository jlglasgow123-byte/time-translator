import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { isPlatformAdmin } = await requirePlatformAdmin()
  if (!isPlatformAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await params
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const suspend: boolean = body.suspend ?? true
  const reason: string = body.reason ?? 'Suspended by admin'

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('profiles')
    .update(
      suspend
        ? { access_blocked_at: new Date().toISOString(), access_block_reason: reason }
        : { access_blocked_at: null, access_block_reason: null }
    )
    .eq('user_id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, suspended: suspend })
}
