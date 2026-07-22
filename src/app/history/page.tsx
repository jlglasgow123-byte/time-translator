'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDuration } from '@/lib/timezone'
import { Button } from '@/components/ui/Button'

interface Worklog {
  id: string
  worklog_id: string
  jira_key: string
  jira_summary: string
  event_title: string
  event_date: string
  start_time: string | null
  duration_seconds: number
  logged_at: string
}

type GroupBy = 'logged_date' | 'event_date' | 'jira_key'

function formatDisplayDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getGroupKey(w: Worklog, groupBy: GroupBy): string {
  if (groupBy === 'logged_date') return w.logged_at.slice(0, 10)
  if (groupBy === 'event_date') return w.event_date
  return w.jira_key
}

function getGroupLabel(key: string, groupBy: GroupBy): string {
  if (groupBy === 'jira_key') return key
  return formatDisplayDate(key)
}

function groupWorklogs(worklogs: Worklog[], groupBy: GroupBy): { key: string; label: string; entries: Worklog[] }[] {
  const map = new Map<string, Worklog[]>()
  for (const w of worklogs) {
    const k = getGroupKey(w, groupBy)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(w)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, entries]) => ({ key, label: getGroupLabel(key, groupBy), entries }))
}

function downloadCsv(worklogs: Worklog[]) {
  const headers = ['Logged At', 'Event Date', 'Start Time', 'Duration', 'Event Title', 'Jira Key', 'Jira Task']
  const rows = worklogs.map(w => [
    w.logged_at.slice(0, 16).replace('T', ' '),
    w.event_date,
    w.start_time ?? '',
    formatDuration(w.duration_seconds),
    w.event_title,
    w.jira_key,
    w.jira_summary ?? '',
  ])
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `jira-log-history-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function JiraKeyBadge({ jiraKey }: { jiraKey: string }) {
  const project = jiraKey.split('-')[0]
  const colors: Record<string, string> = {
    DT: 'bg-violet-50 text-violet-700 ring-violet-200',
    DOC: 'bg-blue-50 text-blue-700 ring-blue-200',
    PRSD: 'bg-amber-50 text-amber-700 ring-amber-200',
  }
  const style = colors[project] ?? 'bg-[#EBF5F7] text-[#3F7C85] ring-[#DCEEF5]'
  return (
    <span className={`inline-block font-mono text-xs font-semibold px-2 py-0.5 rounded ring-1 whitespace-nowrap ${style}`}>
      {jiraKey}
    </span>
  )
}

export default function HistoryPage() {
  const router = useRouter()
  const [worklogs, setWorklogs] = useState<Worklog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [jiraKeyFilter, setJiraKeyFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('logged_date')

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setWorklogs(data.worklogs ?? [])
      })
      .catch(() => setError('Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  const jiraProjects = useMemo(() => {
    const projects = new Set(worklogs.map(w => w.jira_key.split('-')[0]))
    return Array.from(projects).sort()
  }, [worklogs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return worklogs.filter(w => {
      if (q && !w.event_title.toLowerCase().includes(q) && !w.jira_key.toLowerCase().includes(q) && !w.jira_summary?.toLowerCase().includes(q)) return false
      if (jiraKeyFilter && !w.jira_key.startsWith(jiraKeyFilter + '-')) return false
      if (dateFrom && w.event_date < dateFrom) return false
      if (dateTo && w.event_date > dateTo) return false
      return true
    })
  }, [worklogs, search, jiraKeyFilter, dateFrom, dateTo])

  const groups = useMemo(() => groupWorklogs(filtered, groupBy), [filtered, groupBy])
  const totalSeconds = filtered.reduce((s, w) => s + w.duration_seconds, 0)
  const hasFilters = search || jiraKeyFilter || dateFrom || dateTo

  function clearFilters() {
    setSearch('')
    setJiraKeyFilter('')
    setDateFrom('')
    setDateTo('')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-[#66747A]">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm">Loading history…</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F7C85]">Log History</p>
          <h1 className="mt-1.5 text-3xl font-extrabold tracking-tight text-[#26333A]">Jira Time Logs</h1>
          <p className="mt-1.5 text-sm text-[#66747A]">Every entry successfully logged to Jira from Time Translator.</p>
        </div>
        {worklogs.length > 0 && (
          <Button onClick={() => downloadCsv(filtered)} className="shrink-0">
            Export CSV
          </Button>
        )}
      </div>

      {worklogs.length === 0 ? (
        <div className="rounded-2xl border border-[#DCEEF5] bg-white px-6 py-16 text-center">
          <p className="text-sm text-[#66747A]">No logs yet. Time you log to Jira will appear here.</p>
        </div>
      ) : (
        <>
          {/* Filters + grouping bar */}
          <div className="rounded-xl border border-[#DCEEF5] bg-white p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-end">
              {/* Search */}
              <div className="flex-1 min-w-[180px]">
                <label className="block text-xs font-medium text-[#66747A] mb-1">Search</label>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Event, Jira key, task…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-[#FBFBF8] pl-8 pr-3 py-2 text-sm text-[#26333A] placeholder-gray-400 focus:border-[#3F7C85] focus:outline-none focus:ring-1 focus:ring-[#3F7C85]"
                  />
                </div>
              </div>

              {/* Jira project filter */}
              {jiraProjects.length > 1 && (
                <div className="min-w-[130px]">
                  <label className="block text-xs font-medium text-[#66747A] mb-1">Project</label>
                  <select
                    value={jiraKeyFilter}
                    onChange={e => setJiraKeyFilter(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 bg-[#FBFBF8] px-3 py-2 text-sm text-[#26333A] focus:border-[#3F7C85] focus:outline-none focus:ring-1 focus:ring-[#3F7C85]"
                  >
                    <option value="">All projects</option>
                    {jiraProjects.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div className="min-w-[130px]">
                <label className="block text-xs font-medium text-[#66747A] mb-1">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-[#FBFBF8] px-3 py-2 text-sm text-[#26333A] focus:border-[#3F7C85] focus:outline-none focus:ring-1 focus:ring-[#3F7C85]"
                />
              </div>
              <div className="min-w-[130px]">
                <label className="block text-xs font-medium text-[#66747A] mb-1">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-[#FBFBF8] px-3 py-2 text-sm text-[#26333A] focus:border-[#3F7C85] focus:outline-none focus:ring-1 focus:ring-[#3F7C85]"
                />
              </div>

              {/* Group by */}
              <div className="min-w-[150px]">
                <label className="block text-xs font-medium text-[#66747A] mb-1">Group by</label>
                <select
                  value={groupBy}
                  onChange={e => setGroupBy(e.target.value as GroupBy)}
                  className="w-full rounded-lg border border-gray-200 bg-[#FBFBF8] px-3 py-2 text-sm text-[#26333A] focus:border-[#3F7C85] focus:outline-none focus:ring-1 focus:ring-[#3F7C85]"
                >
                  <option value="logged_date">Date logged</option>
                  <option value="event_date">Event date</option>
                  <option value="jira_key">Jira key</option>
                </select>
              </div>

              {hasFilters && (
                <div className="flex items-end">
                  <button
                    onClick={clearFilters}
                    className="px-3 py-2 text-sm text-[#66747A] hover:text-[#26333A] transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Summary bar */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[#DCEEF5] bg-white px-5 py-3 text-sm">
            <div>
              <span className="text-[#66747A]">Entries </span>
              <span className="font-semibold text-[#26333A]">{filtered.length}</span>
              {hasFilters && worklogs.length !== filtered.length && (
                <span className="text-[#66747A]"> of {worklogs.length}</span>
              )}
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div>
              <span className="text-[#66747A]">Total time </span>
              <span className="font-semibold text-[#26333A]">{formatDuration(totalSeconds)}</span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div>
              <span className="text-[#66747A]">Groups </span>
              <span className="font-semibold text-[#26333A]">{groups.length}</span>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-[#DCEEF5] bg-white px-6 py-12 text-center">
              <p className="text-sm text-[#66747A]">No entries match your filters.</p>
              <button onClick={clearFilters} className="mt-2 text-sm text-[#3F7C85] hover:underline">Clear filters</button>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(group => {
                const groupSeconds = group.entries.reduce((s, w) => s + w.duration_seconds, 0)
                return (
                  <div key={group.key} className="rounded-xl border border-[#DCEEF5] overflow-hidden bg-white">
                    {/* Group header */}
                    <div className="bg-[#26333A] px-4 py-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {groupBy === 'jira_key' ? (
                          <JiraKeyBadge jiraKey={group.key} />
                        ) : (
                          <span className="text-sm font-semibold text-white">
                            {groupBy === 'logged_date' ? 'Logged ' : ''}{group.label}
                          </span>
                        )}
                        {groupBy === 'jira_key' && group.entries[0]?.jira_summary && (
                          <span className="text-xs text-white/60 truncate max-w-[400px]">{group.entries[0].jira_summary}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-white/60">{group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}</span>
                        <span className="text-sm font-semibold text-white">{formatDuration(groupSeconds)}</span>
                      </div>
                    </div>

                    {/* Table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#DCEEF5] bg-[#F7FBFC]">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider whitespace-nowrap">Event Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider whitespace-nowrap">Time</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider whitespace-nowrap">Duration</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider">Event</th>
                          {groupBy !== 'jira_key' && (
                            <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider whitespace-nowrap">Jira Key</th>
                          )}
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#66747A] uppercase tracking-wider">Jira Task</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F7F9]">
                        {group.entries.map((w, i) => (
                          <tr key={w.id} className={i % 2 === 0 ? 'bg-white' : 'bg-[#FAFCFD]'}>
                            <td className="px-4 py-2.5 whitespace-nowrap text-sm text-[#26333A]">{formatShortDate(w.event_date)}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-sm tabular-nums text-[#66747A]">{w.start_time ?? '—'}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-sm tabular-nums font-medium text-[#26333A]">{formatDuration(w.duration_seconds)}</td>
                            <td className="px-4 py-2.5 text-sm text-[#26333A] max-w-[260px]">
                              <div className="line-clamp-2">{w.event_title}</div>
                            </td>
                            {groupBy !== 'jira_key' && (
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <JiraKeyBadge jiraKey={w.jira_key} />
                              </td>
                            )}
                            <td className="px-4 py-2.5 text-sm text-[#66747A] max-w-[240px]">
                              <div className="line-clamp-2">{w.jira_summary}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
    </div>
  )
}
