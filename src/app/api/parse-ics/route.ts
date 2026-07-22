import { NextRequest, NextResponse } from 'next/server'
import { parseIcs, getCalendarName } from '@/lib/ics-parser'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { MAX_EVENTS_PER_IMPORT, MAX_ICS_FILE_BYTES, formatBytes } from '@/lib/security-limits'
import type { CatchAllMapping, SkipRule } from '@/types'
import { safeErrorResponse } from '@/lib/errors'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const calendarName = (formData.get('calendarName') as string) ?? ''
    const startDate = (formData.get('startDate') as string) ?? ''
    const endDate = (formData.get('endDate') as string) ?? ''
    const timezone = (formData.get('timezone') as string) ?? 'Australia/Sydney'
    const catchAllRaw = (formData.get('catchAllMappings') as string) ?? '[]'
    const skipRulesRaw = (formData.get('skipRules') as string) ?? ''
    const excludeWeekends = formData.get('excludeWeekends') === 'true'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!startDate || !endDate) return NextResponse.json({ error: 'Date range required' }, { status: 400 })
    if (file.size > MAX_ICS_FILE_BYTES) {
      return NextResponse.json(
        { error: `ICS file is too large. Maximum size is ${formatBytes(MAX_ICS_FILE_BYTES)}.` },
        { status: 413 }
      )
    }

    const buffer = await file.arrayBuffer()
    const icsText = Buffer.from(buffer).toString('utf-8')

    const fileCalName = getCalendarName(icsText)
    if (calendarName && fileCalName && !fileCalName.toLowerCase().includes(calendarName.toLowerCase())) {
      return NextResponse.json(
        { error: `Calendar name mismatch: file is "${fileCalName}", expected "${calendarName}"` },
        { status: 400 }
      )
    }

    let catchAllMappings: CatchAllMapping[] = []
    try { catchAllMappings = JSON.parse(catchAllRaw) } catch { /* use empty */ }

    let skipRules: SkipRule[] = DEFAULT_SKIP_RULES
    try { if (skipRulesRaw) skipRules = JSON.parse(skipRulesRaw) } catch { /* use defaults */ }

    const events = parseIcs({ icsText, calendarName, startDate, endDate, timezone, catchAllMappings, skipRules, excludeWeekends })
    if (events.length > MAX_EVENTS_PER_IMPORT) {
      return NextResponse.json(
        { error: `Too many calendar events. Import up to ${MAX_EVENTS_PER_IMPORT} events at a time.` },
        { status: 413 }
      )
    }
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json(safeErrorResponse(err, 'Could not read that calendar file. Please check it and try again.'), { status: 500 })
  }
}
