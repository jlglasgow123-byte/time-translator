'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveSession, loadFormConfig } from '@/lib/storage'
import { toUserMessage } from '@/lib/errors'
import type { JiraConfig, WorkEntry, JiraMatchesByWorkEntryId, AiUnavailableReason } from '@/types'

function localDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const getToday = () => localDateString(new Date())
export const getFirstOfMonth = () => localDateString(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

// From can go back up to 2 years from today
export function twoYearsAgo(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 2)
  return localDateString(d)
}

// End date minus 90 days — the earliest From allowed for a given To (mirrors the Insights cap)
export function ninetyDaysBeforeEnd(end: string): string {
  const d = new Date(end + 'T12:00:00')
  d.setDate(d.getDate() - 90)
  return localDateString(d)
}

// Shared Google Calendar import state + sync flow, used by both the Settings
// Google Calendar section and the upload page so the two never diverge.
export function useGoogleCalendarImport() {
  const router = useRouter()
  const [startDate, setStartDate] = useState(getFirstOfMonth)
  const [endDate, setEndDate] = useState(getToday)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  const minStartDate = endDate ? ninetyDaysBeforeEnd(endDate) : ''
  const dateRangeTooLong = startDate < minStartDate

  function handleStartDateChange(val: string) {
    const floor = twoYearsAgo()
    const ceiling = endDate || getToday()
    setStartDate(val > ceiling ? ceiling : val < floor ? floor : val)
  }

  function handleEndDateChange(raw: string) {
    const val = raw > getToday() ? getToday() : raw
    setEndDate(val)
    // Clamp From if it's now more than 90 days before the new To
    const newMin = ninetyDaysBeforeEnd(val)
    if (startDate < newMin) setStartDate(newMin)
    else if (startDate > val) setStartDate(val)
  }

  async function handleImport() {
    if (dateRangeTooLong) {
      setSyncError('Date range cannot exceed 90 days. Please adjust your From date.')
      return
    }
    setSyncing(true)
    setSyncError(null)
    try {
      const saved = loadFormConfig()

      const res = await fetch('/api/google-calendar/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          timezone: saved?.timezone || 'Australia/Sydney',
          catchAllMappings: saved?.catchAllMappings ?? [],
          skipRules: saved?.skipRules ?? [],
          excludeWeekends: saved?.excludeWeekends ?? false,
          defaultProjectKey: saved?.defaultProjectKey || 'DOC',
          includedIssueTypes: saved?.includedIssueTypes ?? [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(toUserMessage(data.error, 'Could not sync your Google Calendar. Please try again.'))

      const config: JiraConfig = {
        jiraBaseUrl: '',
        defaultProjectKey: saved?.defaultProjectKey || 'DOC',
        timezone: saved?.timezone || 'Australia/Sydney',
        calendarName: 'Google Calendar',
        catchAllMappings: saved?.catchAllMappings ?? [],
        skipRules: saved?.skipRules ?? [],
        includedIssueTypes: saved?.includedIssueTypes ?? [],
        dateRange: { start: startDate, end: endDate },
      }

      saveSession(
        data.workEntries as WorkEntry[],
        data.jiraMatchesByWorkEntryId as JiraMatchesByWorkEntryId,
        config,
        'jira',
        Boolean(data.ticketsTruncated),
        Boolean(data.aiUnavailable),
        data.aiUnavailableReason as AiUnavailableReason | undefined
      )
      router.push('/review')
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Sync failed')
      setSyncing(false)
    }
  }

  return {
    startDate,
    endDate,
    syncing,
    syncError,
    minStartDate,
    dateRangeTooLong,
    handleStartDateChange,
    handleEndDateChange,
    handleImport,
  }
}
