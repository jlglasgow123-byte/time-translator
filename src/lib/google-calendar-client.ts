import { DateTime } from 'luxon'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, SkipRule } from '@/types'
import { encryptGoogleCalendarToken, decryptGoogleCalendarToken } from '@/lib/crypto/google-calendar-token'
import { shouldSkip, DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { formatDate, formatDayLabel, formatTime, utcToLocal } from '@/lib/timezone'

export interface GoogleCalendarCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: string
}

interface GoogleEventsListResponse {
  items?: GoogleEvent[]
  nextPageToken?: string
}

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

async function refreshAccessToken(
  supabase: SupabaseClient,
  userId: string,
  encryptedRefreshToken: string
): Promise<string | null> {
  const refreshToken = decryptGoogleCalendarToken(encryptedRefreshToken)

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) return null

  const tokens = await res.json()
  const { access_token, expires_in } = tokens
  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

  await supabase.from('google_calendar_credentials').update({
    access_token: encryptGoogleCalendarToken(access_token),
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId)

  return access_token
}

export type GoogleCalendarCredsResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'not_connected' | 'reconnect_required' }

// Loads stored credentials for a user, transparently refreshing the access token
// if it has expired. Only surfaces a reconnect prompt if the refresh call itself
// fails (refresh_token revoked/expired) — never on ordinary expiry.
export async function getGoogleCalendarCreds(
  supabase: SupabaseClient,
  userId: string
): Promise<GoogleCalendarCredsResult> {
  const { data } = await supabase
    .from('google_calendar_credentials')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return { ok: false, reason: 'not_connected' }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0
  const needsRefresh = Date.now() > expiresAt - 5 * 60 * 1000

  if (!needsRefresh) {
    return { ok: true, accessToken: decryptGoogleCalendarToken(data.access_token) }
  }

  const refreshed = await refreshAccessToken(supabase, userId, data.refresh_token)
  if (!refreshed) {
    await supabase.from('google_calendar_credentials').delete().eq('user_id', userId)
    return { ok: false, reason: 'reconnect_required' }
  }

  return { ok: true, accessToken: refreshed }
}

function toCalendarEvent(
  event: GoogleEvent,
  timezone: string,
  rangeStart: DateTime,
  rangeEnd: DateTime,
  excludeWeekends: boolean,
  skipRules: SkipRule[],
  calendarName: string
): CalendarEvent | null {
  // All-day events (date-only, no dateTime) carry no meaningful duration for time logging — skip.
  if (!event.start?.dateTime || !event.end?.dateTime) return null
  if (event.status === 'cancelled') return null

  const startUtc = DateTime.fromISO(event.start.dateTime, { setZone: true }).toUTC().toISO() ?? ''
  const endUtc = DateTime.fromISO(event.end.dateTime, { setZone: true }).toUTC().toISO() ?? ''
  const startLocal = utcToLocal(startUtc, timezone)
  const endLocal = utcToLocal(endUtc, timezone)
  const startDt = DateTime.fromISO(startLocal)
  const endDt = DateTime.fromISO(endLocal)

  if (startDt < rangeStart || startDt > rangeEnd) return null
  if (excludeWeekends && (startDt.weekday === 6 || startDt.weekday === 7)) return null

  const durationSeconds = Math.round(endDt.diff(startDt, 'seconds').seconds)
  if (durationSeconds <= 0) return null

  const title = (event.summary ?? '').trim()
  const startTime = formatTime(startLocal)
  const { skip, source, reason } = shouldSkip(title, startTime, skipRules)

  return {
    uid: event.id,
    title,
    startUtc,
    endUtc,
    startLocal,
    endLocal,
    durationSeconds,
    dayLabel: formatDayLabel(startLocal),
    dateLabel: formatDate(startLocal),
    calendarName,
    autoSkipped: skip,
    autoSkipSource: source,
    skipReason: reason,
  }
}

function markDuplicateEvents(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>()
  return events.map(event => {
    const fingerprint = [event.title.trim().toLowerCase(), event.startLocal, event.endLocal, String(event.durationSeconds)].join('|')
    if (!seen.has(fingerprint)) {
      seen.add(fingerprint)
      return event
    }
    return {
      ...event,
      autoSkipped: true,
      autoSkipSource: 'duplicate' as const,
      skipReason: 'This calendar event appears more than once in the import, so the duplicate copy was skipped automatically.',
    }
  })
}

export interface FetchGoogleCalendarEventsOptions {
  accessToken: string
  calendarId?: string // defaults to 'primary'
  startDate: string // "2025-04-01"
  endDate: string // "2025-04-30"
  timezone: string
  skipRules?: SkipRule[]
  excludeWeekends?: boolean
}

// Pulls events from the Google Calendar Events API (calendar.readonly scope) and
// maps them into the same CalendarEvent shape ics-parser.ts produces, so
// matchEvents() consumes Google-sourced and ICS-sourced events identically.
export async function fetchGoogleCalendarEvents(options: FetchGoogleCalendarEventsOptions): Promise<CalendarEvent[]> {
  const {
    accessToken,
    calendarId = 'primary',
    startDate,
    endDate,
    timezone,
    skipRules = DEFAULT_SKIP_RULES,
    excludeWeekends = false,
  } = options

  const tz = timezone && DateTime.now().setZone(timezone).isValid ? timezone : 'Australia/Sydney'
  const rangeStart = DateTime.fromISO(startDate, { zone: tz }).startOf('day')
  const rangeEnd = DateTime.fromISO(endDate, { zone: tz }).endOf('day')

  const timeMin = rangeStart.minus({ days: 1 }).toUTC().toISO()
  const timeMax = rangeEnd.plus({ days: 1 }).toUTC().toISO()

  const events: GoogleEvent[] = []
  let pageToken: string | undefined

  do {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`)
    url.searchParams.set('timeMin', timeMin ?? '')
    url.searchParams.set('timeMax', timeMax ?? '')
    url.searchParams.set('singleEvents', 'true') // pre-expands recurring events server-side
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[google-calendar] events fetch failed: ${res.status} ${res.statusText} — ${body.slice(0, 500)}`)
      if (res.status === 401) {
        throw new Error('Your Google Calendar connection has expired. Please reconnect in Settings.')
      }
      if (res.status === 403) {
        // A 403 on a non-expired token is a permission/scope problem, not an expiry.
        // Telling the user to "reconnect" would loop them; surface it as an access issue instead.
        throw new Error('Time Translator does not have permission to read your Google Calendar. This usually means calendar access was not granted during sign-in, or the app is still awaiting Google verification. Please reconnect and ensure you tick the calendar access checkbox.')
      }
      if (res.status === 404) {
        throw new Error('Could not find that Google Calendar. It may have been deleted or you no longer have access.')
      }
      throw new Error('Could not fetch Google Calendar events. Please try again or check your connection in Settings.')
    }

    const data: GoogleEventsListResponse = await res.json()
    events.push(...(data.items ?? []))
    pageToken = data.nextPageToken
  } while (pageToken)

  const calendarEvents = events
    .map(e => toCalendarEvent(e, tz, rangeStart, rangeEnd, excludeWeekends, skipRules, 'Google Calendar'))
    .filter((e): e is CalendarEvent => e !== null)

  calendarEvents.sort((a, b) => a.startLocal.localeCompare(b.startLocal))
  return markDuplicateEvents(calendarEvents)
}
