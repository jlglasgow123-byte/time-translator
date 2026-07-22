import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCalendarName } from '@/lib/ics-parser'
import { MAX_ICS_FILE_BYTES, formatBytes } from '@/lib/security-limits'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  if (file.size > MAX_ICS_FILE_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${formatBytes(MAX_ICS_FILE_BYTES)}.` },
      { status: 413 }
    )
  }

  const buffer = await file.arrayBuffer()
  const icsText = Buffer.from(buffer).toString('utf-8')
  const calendarName = getCalendarName(icsText)

  if (!calendarName) {
    return NextResponse.json(
      { error: 'Could not detect a calendar name from this file. Make sure it is a valid .ics export.' },
      { status: 422 }
    )
  }

  return NextResponse.json({ calendar_name: calendarName })
}
