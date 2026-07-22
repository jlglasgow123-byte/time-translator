import { DateTime } from 'luxon'

export function utcToLocal(utcIso: string, timezone: string): string {
  return DateTime.fromISO(utcIso, { zone: 'UTC' }).setZone(timezone).toISO() ?? utcIso
}

export function formatTime(localIso: string): string {
  const dt = DateTime.fromISO(localIso)
  return dt.toFormat('HH:mm')
}

export function formatDate(localIso: string): string {
  const dt = DateTime.fromISO(localIso)
  return dt.toFormat('yyyy-MM-dd')
}

export function formatDayLabel(localIso: string): string {
  const dt = DateTime.fromISO(localIso)
  return dt.toFormat('cccc') // "Monday", "Tuesday", etc.
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Jira requires "2025-04-07T09:00:00.000+1000" — no colon in offset
export function toJiraStarted(localIso: string): string {
  return DateTime.fromISO(localIso).toFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZZZ")
}

export function getISOWeek(localIso: string): string {
  const dt = DateTime.fromISO(localIso)
  return `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, '0')}`
}
