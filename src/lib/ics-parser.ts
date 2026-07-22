import ical from 'node-ical'
import { DateTime } from 'luxon'
import type { CalendarEvent, SkipRule } from '@/types'
import { shouldSkip, DEFAULT_SKIP_RULES } from './skip-rules'
import { utcToLocal, formatTime, formatDate, formatDayLabel } from './timezone'

interface ParseOptions {
  icsText: string
  calendarName: string
  startDate: string   // "2025-04-01"
  endDate: string     // "2025-04-30"
  timezone: string
  catchAllMappings?: unknown
  skipRules?: SkipRule[]
  excludeWeekends?: boolean
}

type VEvent = ReturnType<typeof ical.sync.parseICS>[string] & {
  rrule?: { between: (after: Date, before: Date, inc?: boolean) => Date[] }
  recurrenceid?: Date | string
  exdate?: Record<string, Date> | Date[]
  status?: string
  summary?: string
  uid?: string
  start?: Date
  end?: Date
}

function buildEvent(
  comp: VEvent,
  instanceStart: Date,
  instanceEnd: Date,
  uid: string,
  fileCalendarName: string,
  calendarName: string,
  timezone: string,
  rangeStart: DateTime,
  rangeEnd: DateTime,
  excludeWeekends: boolean,
  skipRules: SkipRule[]
): CalendarEvent | null {
  const startUtc = DateTime.fromJSDate(instanceStart, { zone: 'UTC' }).toISO() ?? ''
  const endUtc = DateTime.fromJSDate(instanceEnd, { zone: 'UTC' }).toISO() ?? ''
  const startLocal = utcToLocal(startUtc, timezone)
  const endLocal = utcToLocal(endUtc, timezone)
  const startDt = DateTime.fromISO(startLocal)
  const endDt = DateTime.fromISO(endLocal)

  if (startDt < rangeStart || startDt > rangeEnd) {
    console.log('[ics-parser] DROP out-of-range', {
      title: typeof comp.summary === 'string' ? comp.summary : '',
      startLocal,
      rangeStart: rangeStart.toISO(),
      rangeEnd: rangeEnd.toISO(),
    })
    return null
  }
  if (excludeWeekends && (startDt.weekday === 6 || startDt.weekday === 7)) return null

  const durationSeconds = Math.round(endDt.diff(startDt, 'seconds').seconds)
  if (durationSeconds <= 0) return null

  const title = typeof comp.summary === 'string' ? comp.summary.trim() : ''
  const startTime = formatTime(startLocal)
  const { skip, source, reason } = shouldSkip(title, startTime, skipRules)

  return {
    uid,
    title,
    startUtc,
    endUtc,
    startLocal,
    endLocal,
    durationSeconds,
    dayLabel: formatDayLabel(startLocal),
    dateLabel: formatDate(startLocal),
    calendarName: fileCalendarName || calendarName,
    autoSkipped: skip,
    autoSkipSource: source,
    skipReason: reason,
  }
}

function markDuplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>()

  return events.map(event => {
    const fingerprint = [
      event.title.trim().toLowerCase(),
      event.startLocal,
      event.endLocal,
      String(event.durationSeconds),
    ].join('|')

    if (!seen.has(fingerprint)) {
      seen.add(fingerprint)
      return event
    }

    return {
      ...event,
      autoSkipped: true,
      autoSkipSource: 'duplicate',
      skipReason: 'This calendar event appears more than once in the import, so the duplicate copy was skipped automatically.',
    }
  })
}

export function parseIcs(options: ParseOptions): CalendarEvent[] {
  const { icsText, calendarName, startDate, endDate, timezone, skipRules = DEFAULT_SKIP_RULES, excludeWeekends = false } = options

  // Guard: fall back to Sydney if timezone is empty or not recognised by Luxon
  const tz = timezone && DateTime.now().setZone(timezone).isValid ? timezone : 'Australia/Sydney'
  if (tz !== timezone) {
    console.warn('[ics-parser] invalid timezone received, falling back to Australia/Sydney. Got:', JSON.stringify(timezone))
  }

  const calNameMatch = icsText.match(/X-WR-CALNAME:(.+)/i)
  const fileCalendarName = calNameMatch ? calNameMatch[1].trim() : ''

  const rangeStart = DateTime.fromISO(startDate, { zone: tz }).startOf('day')
  const rangeEnd = DateTime.fromISO(endDate, { zone: tz }).endOf('day')

  const parsed = ical.sync.parseICS(icsText)

  // First pass: collect exception instances (modified occurrences of recurring events)
  // keyed by uid → set of date strings (YYYY-MM-DD) that have been overridden
  const overriddenDates = new Map<string, Set<string>>()
  const exceptionVEvents: VEvent[] = []

  for (const key of Object.keys(parsed)) {
    const comp = parsed[key] as VEvent
    if (!comp || comp.type !== 'VEVENT') continue
    const uid = typeof comp.uid === 'string' ? comp.uid : key
    const recurrenceId = comp.recurrenceid
    if (!recurrenceId) continue

    const d = recurrenceId instanceof Date ? recurrenceId : new Date(String(recurrenceId))
    const dateStr = DateTime.fromJSDate(d, { zone: tz }).toISODate() ?? ''
    if (dateStr) {
      if (!overriddenDates.has(uid)) overriddenDates.set(uid, new Set())
      overriddenDates.get(uid)!.add(dateStr)
    }
    // Treat exception instances as regular one-off events
    exceptionVEvents.push(comp)
  }

  const events: CalendarEvent[] = []

  // Second pass: process base events
  for (const key of Object.keys(parsed)) {
    const comp = parsed[key] as VEvent
    if (!comp || comp.type !== 'VEVENT') continue
    if (comp.status === 'CANCELLED') continue

    const uid = typeof comp.uid === 'string' ? comp.uid : key

    // Skip exception instances — they're handled separately
    if (comp.recurrenceid) continue

    const start = comp.start as Date
    const end = comp.end as Date
    if (!start || !end) continue

    if (comp.rrule) {
      // Recurring event — expand all instances within the date range
      const duration = end.getTime() - start.getTime()

      // Collect EXDATE exclusions
      const exdates = new Set<string>()
      if (comp.exdate) {
        const dates = Array.isArray(comp.exdate) ? comp.exdate : Object.values(comp.exdate)
        for (const d of dates) {
          const dt = d instanceof Date ? d : new Date(String(d))
          const s = DateTime.fromJSDate(dt, { zone: tz }).toISODate()
          if (s) exdates.add(s)
        }
      }

      const modifiedDates = overriddenDates.get(uid) ?? new Set<string>()

      // Expand with 1-day padding either side to account for timezone offset (AEST = UTC+10/+11)
      const expandFrom = rangeStart.minus({ days: 1 }).toJSDate()
      const expandTo = rangeEnd.plus({ days: 1 }).toJSDate()

      console.log('[ics-parser] rrule expand:', {
        uid,
        title: typeof comp.summary === 'string' ? comp.summary : '',
        tz,
        rangeStartValid: rangeStart.isValid,
        expandFrom: expandFrom.toISOString(),
        expandTo: expandTo.toISOString(),
      })

      let instances: Date[] = []
      try {
        instances = comp.rrule.between(expandFrom, expandTo, true)
        console.log('[ics-parser] rrule instances:', instances.length)
      } catch (err) {
        console.error('[ics-parser] rrule.between threw:', err)
        const ev = buildEvent(comp, start, end, uid, fileCalendarName, calendarName, tz, rangeStart, rangeEnd, excludeWeekends, skipRules)
        if (ev) events.push(ev)
        continue
      }

      for (const instanceDate of instances) {
        const dateStr = DateTime.fromJSDate(instanceDate, { zone: tz }).toISODate() ?? ''
        if (exdates.has(dateStr)) continue
        if (modifiedDates.has(dateStr)) continue

        const instanceEnd = new Date(instanceDate.getTime() + duration)
        const instanceUid = `${uid}_${instanceDate.toISOString()}`
        const ev = buildEvent(comp, instanceDate, instanceEnd, instanceUid, fileCalendarName, calendarName, tz, rangeStart, rangeEnd, excludeWeekends, skipRules)
        if (ev) events.push(ev)
      }
    } else {
      // Non-recurring event
      const ev = buildEvent(comp, start, end, uid, fileCalendarName, calendarName, tz, rangeStart, rangeEnd, excludeWeekends, skipRules)
      if (ev) events.push(ev)
    }
  }

  // Add exception instances (modified occurrences)
  for (const comp of exceptionVEvents) {
    if (comp.status === 'CANCELLED') continue
    const uid = typeof comp.uid === 'string' ? comp.uid : ''
    const start = comp.start as Date
    const end = comp.end as Date
    if (!start || !end) continue
    const recId = comp.recurrenceid instanceof Date ? comp.recurrenceid : new Date(String(comp.recurrenceid))
    const instanceUid = `${uid}_exc_${recId.toISOString()}`
    const ev = buildEvent(comp, start, end, instanceUid, fileCalendarName, calendarName, tz, rangeStart, rangeEnd, excludeWeekends, skipRules)
    if (ev) events.push(ev)
  }

  events.sort((a, b) => a.startLocal.localeCompare(b.startLocal))
  const deduped = markDuplicateEvents(events)

  console.log('[ics-parser] parse complete', {
    totalParsed: Object.keys(parsed).filter(k => (parsed[k] as VEvent).type === 'VEVENT').length,
    afterBuild: events.length,
    afterDedup: deduped.length,
    autoSkipped: deduped.filter(e => e.autoSkipped).length,
    events: deduped.map(e => ({
      title: e.title,
      date: e.dateLabel,
      time: e.startLocal.slice(11, 16),
      duration: e.durationSeconds,
      autoSkipped: e.autoSkipped,
      skipReason: e.skipReason,
    })),
  })

  return deduped
}

export function getCalendarName(icsText: string): string {
  const match = icsText.match(/X-WR-CALNAME:(.+)/i)
  return match ? match[1].trim() : ''
}
