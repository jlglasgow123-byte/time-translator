'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CatchAllMapping, ImportMode, JiraConfig, SkipRule, WorkEntry, JiraMatchesByWorkEntryId, JiraMatch, AiUnavailableReason } from '@/types'
import { SkipRulesEditor, ExistingIgnoreRules } from '@/components/upload/SkipRulesEditor'
import { Button } from '@/components/ui/Button'
import { saveSession, saveFormConfig, loadFormConfig, loadLearnedMappings } from '@/lib/storage'
import { toUserMessage } from '@/lib/errors'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'
import { UpgradePrompt } from '@/components/billing/UpgradePrompt'
import { useGoogleCalendarImport, twoYearsAgo, getToday, getFirstOfMonth, ninetyDaysBeforeEnd } from '@/hooks/useGoogleCalendarImport'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#DCEEF5]" />
      <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">{children}</span>
      <div className="h-px flex-1 bg-[#DCEEF5]" />
    </div>
  )
}

type LegacyWorkEntry = WorkEntry & JiraMatch
type LatestWorklog = {
  startedAt: string
  date: string
  issueKey: string
  issueSummary: string
  searchedDays: number
}

const JIRA_CONNECTION_REQUIRED_MESSAGE = 'Please connect your Time Translator account to your Jira Account in Settings'

function isJiraConnectionError(message: string | null | undefined) {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('jira account is not connected') ||
    normalized.includes('connect your time translator account')
}

function normalizeJiraConnectionError(message: string) {
  return isJiraConnectionError(message) ? JIRA_CONNECTION_REQUIRED_MESSAGE : message
}

function JiraConnectionMessage() {
  return (
    <>
      Please connect your Time Translator account to your Jira Account in{' '}
      <Link href="/settings" className="font-bold underline underline-offset-2 hover:text-[#3F7C85]">
        Settings
      </Link>
    </>
  )
}

function renderErrorMessage(message: string) {
  if (isJiraConnectionError(message)) return <JiraConnectionMessage />
  if (message.toLowerCase().includes('session has expired') || message.toLowerCase().includes('sign in and try again')) {
    return (
      <>
        Your session has expired —{' '}
        <Link href="/login" className="font-bold underline underline-offset-2 hover:text-[#3F7C85]">
          sign in
        </Link>{' '}
        and try again.
      </>
    )
  }
  return toUserMessage(message)
}

function isLatestWorklog(value: unknown): value is LatestWorklog {
  if (!value || typeof value !== 'object') return false
  const maybe = value as Record<string, unknown>
  return typeof maybe.startedAt === 'string' &&
    typeof maybe.date === 'string' &&
    typeof maybe.issueKey === 'string' &&
    typeof maybe.issueSummary === 'string' &&
    typeof maybe.searchedDays === 'number'
}

function splitLegacyEntries(entries: LegacyWorkEntry[]): {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
} {
  const workEntries: WorkEntry[] = []
  const jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId = {}

  for (const entry of entries) {
    const {
      suggestedJiraKey,
      jiraTaskDescription,
      confidence,
      matchReason,
      ...workEntry
    } = entry

    workEntries.push(workEntry)
    jiraMatchesByWorkEntryId[entry.id] = {
      suggestedJiraKey: suggestedJiraKey ?? '',
      jiraTaskDescription: jiraTaskDescription ?? '',
      confidence: confidence ?? 'LOW',
      matchReason: matchReason ?? '',
    }
  }

  return { workEntries, jiraMatchesByWorkEntryId }
}

export default function UploadPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [startDate, setStartDate] = useState(getFirstOfMonth)
  const [endDate, setEndDate] = useState(getToday)
  const [catchAllMappings, setCatchAllMappings] = useState<CatchAllMapping[]>([])
  const [skipRules, setSkipRules] = useState<SkipRule[]>(DEFAULT_SKIP_RULES)
  const [excludeWeekends, setExcludeWeekends] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [billingBlock, setBillingBlock] = useState<'trial_expired' | 'ai_limit' | null>(null)
  const [mode, setMode] = useState<ImportMode>('jira')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [latestWorklog, setLatestWorklog] = useState<LatestWorklog | null>(null)
  const [latestWorklogLoading, setLatestWorklogLoading] = useState(true)
  const [latestWorklogError, setLatestWorklogError] = useState<string | null>(null)
  const [latestWorklogOpen, setLatestWorklogOpen] = useState(false)

  const [timezone, setTimezone] = useState('Australia/Sydney')
  const [defaultProjectKey, setDefaultProjectKey] = useState('DOC')
  const [includedIssueTypes, setIncludedIssueTypes] = useState<string[]>([...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES])
  const [initialized, setInitialized] = useState(false)
  const endDateIsFuture = endDate > getToday()

  // Mutually exclusive import mechanisms: while Google Calendar is connected it is
  // the primary (and only) import path; ICS upload is hidden. null = still checking.
  const [gcalConnected, setGcalConnected] = useState<boolean | null>(null)
  const gcal = useGoogleCalendarImport()

  useEffect(() => {
    fetch('/api/google-calendar/credentials')
      .then(r => r.json())
      .then(d => setGcalConnected(!!d.connected))
      .catch(() => setGcalConnected(false))
  }, [])

  // Start date must be within 90 days of end date
  const minStartDate = endDate ? ninetyDaysBeforeEnd(endDate) : ''
  const dateRangeTooLong = startDate < minStartDate

  // Redirect to login if session expires while on this page
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load persisted config on mount — must complete before save effect is allowed to run
  useEffect(() => {
    const saved = loadFormConfig()
    if (saved) {
      if (saved.timezone) setTimezone(saved.timezone)
      if (saved.defaultProjectKey) setDefaultProjectKey(saved.defaultProjectKey)
      if (saved.catchAllMappings) setCatchAllMappings(saved.catchAllMappings)
      if (saved.skipRules) setSkipRules(saved.skipRules)
      if (saved.includedIssueTypes?.length) setIncludedIssueTypes(saved.includedIssueTypes)
      if (saved.excludeWeekends !== undefined) setExcludeWeekends(saved.excludeWeekends)
    }
    setInitialized(true)
  }, [])

  // Persist config — only after initial load to avoid overwriting saved data with defaults
  useEffect(() => {
    if (!initialized) return
    saveFormConfig({ timezone, defaultProjectKey, catchAllMappings, skipRules, includedIssueTypes, excludeWeekends })
  }, [initialized, timezone, defaultProjectKey, catchAllMappings, skipRules, includedIssueTypes, excludeWeekends])

  useEffect(() => {
    let cancelled = false

    if (mode !== 'jira') {
      setLatestWorklog(null)
      setLatestWorklogError(null)
      setLatestWorklogLoading(false)
      return () => { cancelled = true }
    }

    async function loadLatestWorklog() {
      setLatestWorklogLoading(true)
      setLatestWorklogError(null)

      try {
        const res = await fetch('/api/jira/latest-worklog')
        const responseText = await res.text()
        let data: Record<string, unknown> = {}
        try {
          data = responseText ? JSON.parse(responseText) : {}
        } catch {
          data = {}
        }
        if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Failed to fetch latest Jira worklog')
        if (!cancelled) setLatestWorklog(isLatestWorklog(data.latestWorklog) ? data.latestWorklog : null)
      } catch (err) {
        if (!cancelled) {
          setLatestWorklog(null)
          setLatestWorklogError(err instanceof Error ? normalizeJiraConnectionError(err.message) : 'Failed to fetch latest Jira worklog')
        }
      } finally {
        if (!cancelled) setLatestWorklogLoading(false)
      }
    }

    loadLatestWorklog()
    return () => { cancelled = true }
  }, [mode])

  function formatLatestWorklog(startedAt: string) {
    return new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(startedAt))
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f?.name.endsWith('.ics')) setFile(f)
  }, [])

  async function handleSubmit(e: React.FormEvent, submitMode: ImportMode) {
    e.preventDefault()
    if (!file) { setError('Please select an .ics file'); return }
    if (dateRangeTooLong) { setError('Date range cannot exceed 90 days. Please adjust your From date.'); return }
    setMode(submitMode)
    setError(null)
    setBillingBlock(null)
    setLoading(true)
    setStatus('Matching…')

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('mode', submitMode)
      formData.append('startDate', startDate)
      formData.append('endDate', endDate)
      formData.append('timezone', timezone)
      formData.append('catchAllMappings', JSON.stringify(catchAllMappings))
      formData.append('learnedMappings', JSON.stringify(loadLearnedMappings()))
      formData.append('skipRules', JSON.stringify(skipRules))
      formData.append('excludeWeekends', String(excludeWeekends))
      formData.append('defaultProjectKey', defaultProjectKey)
      formData.append('includedIssueTypes', JSON.stringify(includedIssueTypes))

      const res = await fetch('/api/process', { method: 'POST', body: formData })
      let data: Record<string, unknown> = {}
      const responseText = await res.text()
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        console.error('Failed to parse API response', { status: res.status, body: responseText.slice(0, 500) })
        data = {}
      }
      if (res.status === 402) {
        const reason = typeof data.error === 'string' && data.error.toLowerCase().includes('trial')
          ? 'trial_expired'
          : 'ai_limit'
        setBillingBlock(reason)
        setLoading(false)
        setStatus('')
        return
      }
      if (!res.ok) {
        const message = typeof data.error === 'string'
          ? data.error
          : submitMode === 'jira' && isJiraConnectionError(latestWorklogError)
            ? JIRA_CONNECTION_REQUIRED_MESSAGE
            : res.status === 429
              ? "You've hit the rate limit. Please wait a moment and try again."
              : res.status === 413
                ? 'Your calendar file is too large to process.'
                : res.status === 401
                  ? 'Your session has expired — please sign in and try again.'
                  : res.status >= 500
                    ? 'Import failed due to a server error. If this keeps happening, contact support.'
                    : `Import failed (${res.status}). Please check your settings and try again.`
        throw new Error(normalizeJiraConnectionError(message))
      }

      const config: JiraConfig = {
        jiraBaseUrl: '',
        defaultProjectKey,
        timezone,
        calendarName: typeof data.calendarName === 'string' ? data.calendarName : '',
        catchAllMappings,
        skipRules,
        includedIssueTypes,
        dateRange: { start: startDate, end: endDate },
      }

      const processed = data.workEntries && data.jiraMatchesByWorkEntryId
        ? {
            workEntries: data.workEntries as WorkEntry[],
            jiraMatchesByWorkEntryId: data.jiraMatchesByWorkEntryId as JiraMatchesByWorkEntryId,
          }
        : splitLegacyEntries((data.entries ?? []) as LegacyWorkEntry[])

      saveSession(
        processed.workEntries,
        processed.jiraMatchesByWorkEntryId,
        config,
        submitMode,
        Boolean(data.ticketsTruncated),
        Boolean(data.aiUnavailable),
        data.aiUnavailableReason as AiUnavailableReason | undefined
      )
      router.push(submitMode === 'csv' ? '/export-review' : '/review')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
      setStatus('')
    }
  }

  return (
    <div className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-3xl px-4">

        {/* Header */}
        <div className="mb-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">Import time</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">Bring in your calendar</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-[#66747A]">
            {gcalConnected
              ? 'Pull your events straight from your connected Google Calendar. Time Translator will turn them into reviewable time before creating outputs.'
              : 'Upload the calendar export that already contains your work. Time Translator will turn it into reviewable time before creating outputs.'}
          </p>
        </div>

        {gcalConnected !== null && (
        <form className="space-y-7 rounded-[32px] border border-[#DCEEF5] bg-white/90 p-6 shadow-[0_18px_48px_rgba(38,51,58,0.06)]">

          <SectionHeading>Import</SectionHeading>

          {gcalConnected ? (
            /* Google Calendar is the one import path while connected — ICS upload is hidden */
            <div className="rounded-[28px] border border-[#DCEEF5] bg-[#FBFBF8] p-6">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <p className="text-sm font-bold text-[#26333A]">Import from Google Calendar</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-[#26333A]">From</label>
                  <input
                    type="date"
                    value={gcal.startDate}
                    min={twoYearsAgo()}
                    max={gcal.endDate || getToday()}
                    onChange={e => gcal.handleStartDateChange(e.target.value)}
                    className={`mt-1 block w-full rounded-2xl border px-3 py-2 text-sm text-[#26333A] outline-none focus:ring-4 focus:ring-[#8FD5C3]/30 bg-white ${gcal.dateRangeTooLong ? 'border-red-300 focus:border-red-400' : 'border-[#DCEEF5] focus:border-[#3F7C85]'}`}
                  />
                  {gcal.dateRangeTooLong && (
                    <p className="mt-1 text-xs text-red-600">Date range cannot exceed 90 days.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-bold text-[#26333A]">To</label>
                  <input
                    type="date"
                    value={gcal.endDate}
                    min={gcal.startDate}
                    max={getToday()}
                    onChange={e => gcal.handleEndDateChange(e.target.value)}
                    className="mt-1 block w-full rounded-2xl border border-[#DCEEF5] bg-white px-3 py-2 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
                  />
                </div>
              </div>
              <p className="mt-4 text-xs text-[#66747A]">
                To upload .ics files instead, you must disconnect Google Calendar in{' '}
                <Link href="/settings#google-calendar" className="font-bold underline underline-offset-2 hover:text-[#3F7C85]">Settings</Link>.
              </p>
            </div>
          ) : (
          <>
          {/* Encouraged path: connect Google Calendar (OAuth lives in Settings) */}
          <Link
            href="/settings#google-calendar"
            className="block rounded-[28px] border-2 border-[#3F7C85] bg-[#DCEEF5]/50 p-5 transition-colors hover:bg-[#DCEEF5]"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold text-[#26333A]">Connect your Google Calendar</p>
                <p className="mt-1 text-xs text-[#66747A]">
                  Recommended — import events directly from your calendar, no export file needed.
                </p>
              </div>
              <span className="rounded-full bg-[#3F7C85] px-4 py-2 text-xs font-extrabold text-white">Connect</span>
            </div>
          </Link>

          {/* File drop zone */}
          <div
            onDrop={onDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className={`cursor-pointer rounded-[28px] border-2 border-dashed p-7 text-center transition-colors ${
              file
                ? 'border-[#3F7C85] bg-[#DCEEF5] hover:border-[#356D75] hover:bg-[#DCEEF5]'
                : 'border-[#DCEEF5] bg-[#FBFBF8] hover:border-[#8FD5C3] hover:bg-[#DCEEF5]/60'
            }`}
          >
            {file ? (
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-2 h-6 w-6 text-[#3F7C85]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm font-bold text-[#26333A]">{file.name}</p>
                <p className="mt-0.5 text-xs font-semibold text-[#3F7C85]">Click to change</p>
              </div>
            ) : (
              <div>
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto mb-2 h-8 w-8 text-[#8FD5C3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-semibold text-[#26333A]">Drop your .ics file here, or <span className="text-[#3F7C85]">browse</span></p>
                <p className="mt-1 text-xs text-[#66747A]">Google Calendar export file</p>
              </div>
            )}
            <input ref={fileRef} type="file" accept=".ics" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </div>
          </>
          )}

          {/* Last Jira Worklog collapsible card */}
          {mode === 'jira' && (
            <div className="rounded-[28px] border border-[#DCEEF5] bg-white">
              <div className="flex w-full items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  onClick={() => setLatestWorklogOpen(o => !o)}
                  aria-label={latestWorklogOpen ? 'Collapse last Jira timesheet' : 'Expand last Jira timesheet'}
                  className="rounded-full p-1 text-[#3f7c85] transition-colors hover:bg-[#DCEEF5]"
                >
                  <svg className={`h-4 w-4 transition-transform shrink-0 ${latestWorklogOpen ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
                <div className="flex-1 min-w-0 text-left">
                  <span className="text-sm font-bold text-[#26333A]">View your last Jira timesheet information</span>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0 text-[#3f7c85]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>

              {latestWorklogOpen && (
                <div className="border-t border-[#DCEEF5] px-4 py-4 text-sm text-[#66747A]">
                  {latestWorklogLoading ? (
                    <p>Checking your most recent logged time...</p>
                  ) : latestWorklogError ? (
                    <p>Couldn&apos;t check Jira right now: {renderErrorMessage(latestWorklogError)}</p>
                  ) : latestWorklog ? (
                    <div className="grid gap-2">
                      <p>
                        <span className="font-bold text-[#26333A]">Date:</span>{' '}
                        {formatLatestWorklog(latestWorklog.startedAt)}
                      </p>
                      <p>
                        <span className="font-bold text-[#26333A]">Jira Task:</span>{' '}
                        {latestWorklog.issueKey}
                      </p>
                      {latestWorklog.issueSummary && (
                        <p>
                          <span className="font-bold text-[#26333A]">Description:</span>{' '}
                          {latestWorklog.issueSummary}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p>No Jira worklogs found in the last 12 months.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <SectionHeading>Filters</SectionHeading>

          {/* Dates sub-section — ICS mode only; GCal mode has its own pickers above */}
          {!gcalConnected && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#66747A]">Dates</p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-[#26333A]">From</label>
                <input
                  type="date"
                  value={startDate}
                  min={minStartDate}
                  max={endDate || getToday()}
                  onChange={e => {
                    const val = e.target.value
                    const ceiling = endDate || getToday()
                    const clamped = val > ceiling ? ceiling : val < minStartDate ? minStartDate : val
                    setStartDate(clamped)
                  }}
                  className={`mt-1 block w-full rounded-2xl border px-3 py-2 text-sm text-[#26333A] outline-none focus:ring-4 focus:ring-[#8FD5C3]/30 bg-[#FBFBF8] ${dateRangeTooLong ? 'border-red-300 focus:border-red-400' : 'border-[#DCEEF5] focus:border-[#3F7C85]'}`}
                />
                {dateRangeTooLong && (
                  <p className="mt-1 text-xs text-red-600">Date range cannot exceed 90 days.</p>
                )}
              </div>
              <div>
                <label className="flex items-center gap-2 text-sm font-bold text-[#26333A]">
                  To
                  {endDateIsFuture && (
                    <span
                      title="You have selected an end date that is in the future"
                      aria-label="You have selected an end date that is in the future"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-xs font-extrabold text-amber-700"
                    >
                      !
                    </span>
                  )}
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={e => {
                    const val = e.target.value
                    setEndDate(val)
                    // Clamp start date if it's now more than 90 days before the new end
                    const newMin = ninetyDaysBeforeEnd(val)
                    if (startDate < newMin) setStartDate(newMin)
                    else if (startDate > val) setStartDate(val)
                  }}
                  className="mt-1 block w-full rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-2 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
                />
              </div>
            </div>
          </div>
          )}

          {/* Ignore sub-section */}
          <div id="ignore-rules" className="space-y-4 border-t border-[#DCEEF5] pt-5">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#66747A]">Ignore</p>
            <label className="flex items-center gap-2 cursor-pointer rounded-[28px] border border-[#DCEEF5] bg-white px-4 py-3">
              <input
                type="checkbox"
                checked={excludeWeekends}
                onChange={e => setExcludeWeekends(e.target.checked)}
                className="h-4 w-4 rounded border-[#DCEEF5] text-[#3F7C85] accent-[#3F7C85]"
              />
              <span className="text-sm font-medium text-[#26333A]">Exclude weekends</span>
            </label>
            <SkipRulesEditor rules={skipRules} onChange={setSkipRules} />
            <ExistingIgnoreRules rules={skipRules} onChange={setSkipRules} />
          </div>

          {billingBlock && (
            <UpgradePrompt reason={billingBlock} inline />
          )}
          {error && !billingBlock && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{renderErrorMessage(error)}</div>
          )}
          {gcalConnected && gcal.syncError && (
            <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{renderErrorMessage(gcal.syncError)}</div>
          )}
          <SectionHeading>Review</SectionHeading>
          {gcalConnected ? (
          <button
            type="button"
            disabled={gcal.syncing || gcal.dateRangeTooLong}
            onClick={() => gcal.handleImport()}
            className={`w-full rounded-[28px] border-2 px-6 py-3 text-sm font-extrabold transition-all disabled:opacity-50 ${
              gcal.syncing
                ? 'border-[#3F7C85] bg-[#DCEEF5] text-[#3F7C85]'
                : 'border-[#3F7C85] bg-[#3F7C85] text-white hover:bg-[#356D75] hover:border-[#356D75]'
            }`}
          >
            {gcal.syncing ? (
              <span className="flex flex-col items-center gap-1">
                <span className="select-none animate-bounce text-2xl leading-none" style={{ filter: 'hue-rotate(175deg) saturate(2) brightness(0.75)' }} role="status" aria-label="Processing">👾</span>
                <span>Importing…</span>
              </span>
            ) : 'Import Events'}
          </button>
          ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={e => handleSubmit(e as unknown as React.FormEvent, 'jira')}
              className={`rounded-[28px] border-2 px-6 py-3 text-sm font-extrabold transition-all disabled:opacity-50 ${
                loading && mode === 'jira'
                  ? 'border-[#3F7C85] bg-[#DCEEF5] text-[#3F7C85]'
                  : 'border-[#3F7C85] bg-[#3F7C85] text-white hover:bg-[#356D75] hover:border-[#356D75]'
              }`}
            >
              {loading && mode === 'jira' ? (
                <span className="flex flex-col items-center gap-1">
                  <span className="select-none animate-bounce text-2xl leading-none" style={{ filter: 'hue-rotate(175deg) saturate(2) brightness(0.75)' }} role="status" aria-label="Processing">👾</span>
                  <span>{status || 'Matching…'}</span>
                </span>
              ) : 'Timesheets'}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={e => handleSubmit(e as unknown as React.FormEvent, 'csv')}
              className={`rounded-[28px] border-2 px-6 py-3 text-sm font-extrabold transition-all disabled:opacity-50 ${
                loading && mode === 'csv'
                  ? 'border-[#3F7C85] bg-[#DCEEF5] text-[#3F7C85]'
                  : 'border-[#3F7C85] bg-white text-[#3F7C85] hover:bg-[#DCEEF5]'
              }`}
            >
              {loading && mode === 'csv' ? (
                <span className="flex flex-col items-center gap-1">
                  <span className="select-none animate-bounce text-2xl leading-none" style={{ filter: 'hue-rotate(175deg) saturate(2) brightness(0.75)' }} role="status" aria-label="Processing">👾</span>
                  <span>{status || 'Matching…'}</span>
                </span>
              ) : 'CSV Export'}
            </button>
          </div>
          )}
        </form>
        )}
      </div>

    </div>
  )
}
