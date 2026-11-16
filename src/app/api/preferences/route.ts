import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getStoredDefaultProject, normaliseProjectKey, saveDefaultProject } from '@/lib/supabase/user-preferences'

// Account-level preferences. Currently just the default Jira project.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const stored = await getStoredDefaultProject(supabase, user.id)
  if (!stored) return NextResponse.json({ error: 'Could not load your preferences.' }, { status: 500 })

  return NextResponse.json({ saved: stored.saved, defaultProjectKey: stored.key })
}

export async function PUT(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const key = normaliseProjectKey(body?.defaultProjectKey)
  if (key === null) {
    return NextResponse.json({ error: 'That does not look like a Jira project key.' }, { status: 400 })
  }

  const ok = await saveDefaultProject(supabase, user.id, key)
  if (!ok) return NextResponse.json({ error: 'Could not save your default project. Please try again.' }, { status: 500 })

  return NextResponse.json({ defaultProjectKey: key })
}
