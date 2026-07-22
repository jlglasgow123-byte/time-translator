import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchLearnedMappings, deleteLearnedMappingServer } from '@/lib/supabase/learned-mappings'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const mappings = await fetchLearnedMappings(supabase, user.id)
  return NextResponse.json({ mappings })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { eventTitle } = await req.json()
  if (!eventTitle || typeof eventTitle !== 'string') {
    return NextResponse.json({ error: 'eventTitle is required' }, { status: 400 })
  }

  await deleteLearnedMappingServer(supabase, user.id, eventTitle)
  return NextResponse.json({ ok: true })
}
