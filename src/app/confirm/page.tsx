'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { WorkEntry, LogResult, JiraMatchesByWorkEntryId } from '@/types'
import { loadSession, clearSession, recordLearnedCorrection } from '@/lib/storage'
import { toUserMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { ConfidenceBadge } from '@/components/ui/Badge'
import { formatDuration } from '@/lib/timezone'
import { TimeByTicketDonut } from '@/components/charts/TimeByTicketDonut'
import { exportConfirmCsv } from '@/lib/csv-export'

type Phase = 'review' | 'logging' | 'done'

function formatDayHeading(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function ConfirmPage() {
  const router = useRouter()
  const [toLog, setToLog] = useState<WorkEntry[]>([])
  const [jiraMatchesByWorkEntryId, setJiraMatchesByWorkEntryId] = useState<JiraMatchesByWorkEntryId>({})
  const [results, setResults] = useState<LogResult[]>([])
  const [phase, setPhase] = useState<Phase>('review')
  const [loaded, setLoaded] = useState(false)
  const [excludeFailed, setExcludeFailed] = useState(false)

  useEffect(() => {
    const session = loadSession()
    if (!session) { router.replace('/upload'); return }
    const entries = session.workEntries.filter(e => e.logToggle === 'log' && !e.autoSkipped)
    setToLog(entries)
    setJiraMatchesByWorkEntryId(session.jiraMatchesByWorkEntryId)
    setResults(entries.map(e => ({
      entryId: e.id,
      issueKey: session.jiraMatchesByWorkEntryId[e.id]?.suggestedJiraKey ?? '',
      status: 'pending',
    })))
    setLoaded(true)
  }, [router])

  const totalSeconds = toLog.reduce((s, e) => s + e.durationSeconds, 0)

  async function handleLogAll() {
    setPhase('logging')
    for (const entry of toLog) {
      const jiraMatch = jiraMatchesByWorkEntryId[entry.id]
      try {
        const res = await fetch('/api/jira/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueKey: jiraMatch?.suggestedJiraKey ?? '',
            startedAt: entry.date + 'T' + entry.startTime + ':00',
            durationSeconds: entry.durationSeconds,
            comment: entry.calendarEventTitle,
            jiraSummary: jiraMatch?.jiraTaskDescription ?? '',
            startTime: entry.startTime,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Log failed')
        setResults(prev => prev.map(r => r.entryId === entry.id ? { ...r, status: 'success', worklogId: data.worklogId } : r))
        const key = jiraMatch?.suggestedJiraKey
        if (key) recordLearnedCorrection(entry.calendarEventTitle, key, entry.date)
      } catch (err) {
        const msg = toUserMessage(err, 'Could not log this entry to Jira. Please try again.')
        setResults(prev => prev.map(r => r.entryId === entry.id ? { ...r, status: 'error', errorMessage: msg } : r))
      }
    }
    setPhase('done')
  }

  function handleStartOver() {
    clearSession()
    router.push('/upload')
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  const grouped = toLog.reduce<Map<string, WorkEntry[]>>((map, entry) => {
    const existing = map.get(entry.date) ?? []
    map.set(entry.date, [...existing, entry])
    return map
  }, new Map())

  if (!loaded) return <div className="p-10 text-center text-sm text-gray-400">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-3xl px-4 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Log time to Jira</h1>
            <p className="mt-1 text-sm text-gray-500">
              {toLog.length} {toLog.length === 1 ? 'entry' : 'entries'} · {formatDuration(totalSeconds)} total
            </p>
          </div>
          {phase === 'review' && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => router.push('/review')}>← Back to Review</Button>
                <Button onClick={handleLogAll} disabled={!toLog.length}>Log all to Jira</Button>
              </div>
              <p className="text-xs text-gray-400">To make changes to your time, return to the Review page.</p>
            </div>
          )}
          {phase === 'done' && (
            <Button variant="secondary" onClick={handleStartOver}>Start over</Button>
          )}
        </div>

        {/* Result banner */}
        {phase === 'done' && (
          <div className={`rounded-md px-4 py-3 text-sm font-medium ${errorCount === 0 ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-yellow-50 text-yellow-800 border border-yellow-200'}`}>
            {errorCount === 0
              ? `All ${successCount} entries logged successfully.`
              : `${successCount} logged, ${errorCount} failed. Review errors below.`}
          </div>
        )}

        {!toLog.length && phase === 'review' && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            No entries are marked for logging. Go back and toggle some entries to &quot;Log&quot;.
          </div>
        )}

        {/* Donut chart — shown after logging completes */}
        {phase === 'done' && toLog.length > 0 && (
          <TimeByTicketDonut workEntries={toLog} jiraMatchesByWorkEntryId={jiraMatchesByWorkEntryId} />
        )}

        {/* CSV export — shown after logging */}
        {phase === 'done' && toLog.length > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-white border border-gray-200 px-4 py-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeFailed}
                onChange={e => setExcludeFailed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-blue-600"
              />
              <span className="text-sm text-gray-700">Exclude failed logs from export</span>
            </label>
            <Button variant="secondary" onClick={() => exportConfirmCsv(toLog, jiraMatchesByWorkEntryId, results, excludeFailed)}>
              Export CSV
            </Button>
          </div>
        )}

        {/* Entries grouped by day */}
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([date, entries]) => (
            <div key={date}>
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {formatDayHeading(date)}
                </h2>
                <span className="text-xs font-medium text-gray-500">
                  {formatDuration(entries.reduce((sum, entry) => sum + entry.durationSeconds, 0))} total
                </span>
              </div>
              <div className="space-y-2">
                {entries.map(entry => {
                  const result = results.find(r => r.entryId === entry.id)
                  const jiraMatch = jiraMatchesByWorkEntryId[entry.id]
                  const isLoggingOrDone = phase === 'logging' || phase === 'done'
                  return (
                    <div key={entry.id} className="relative rounded-md bg-white border border-gray-200 px-4 py-3">
                      <div className="absolute top-3 right-4">
                        {isLoggingOrDone ? (
                          <LogStatus status={result?.status ?? 'pending'} logging={phase === 'logging'} />
                        ) : (
                          <ConfidenceBadge confidence={jiraMatch?.confidence ?? 'LOW'} />
                        )}
                      </div>
                      <div className="pr-16 space-y-0.5">
                        <p className="text-sm font-medium text-gray-900">{entry.calendarEventTitle}</p>
                        <p className="text-sm text-blue-700">
                          <span className="font-mono">{jiraMatch?.suggestedJiraKey ?? ''}</span>
                          {jiraMatch?.jiraTaskDescription && (
                            <span className="text-gray-500 font-sans"> · {jiraMatch.jiraTaskDescription}</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">{entry.durationDisplay}</p>
                        {result?.errorMessage && (
                          <p className="text-xs text-red-600 mt-1">{result.errorMessage}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

function LogStatus({ status, logging }: { status: LogResult['status']; logging: boolean }) {
  if (status === 'success') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    )
  }
  if (status === 'error') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
      </svg>
    )
  }
  if (logging) {
    return (
      <svg className="h-4 w-4 animate-spin text-blue-500" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
    )
  }
  return null
}
