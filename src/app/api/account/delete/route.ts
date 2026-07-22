import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteUserById } from '@/lib/admin/delete-user'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await deleteUserById(user.id)
  if (error) return NextResponse.json({ error }, { status: 500 })

  return NextResponse.json({ ok: true })
}
