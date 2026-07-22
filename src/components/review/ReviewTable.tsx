'use client'

import { useState } from 'react'
import type { WorkEntry, Confidence, JiraMatchesByWorkEntryId, JiraMatch } from '@/types'
import { formatDuration } from '@/lib/timezone'
import { ReviewRow } from './ReviewRow'

export type StatusOption = Confidence | 'MATCHED' | 'SKIPPED' | 'IGNORED' | 'DUPLICATE'
export type StatusFilter = StatusOption[]
type SortDirection = 'asc' | 'desc'
type SortKey = 'time' | 'duration' | 'event' | 'jiraKey' | 'jiraTask' | 'status'

interface SortState { key: SortKey; dir: SortDirection }

interface Props {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
  startDate: string
  endDate: string
  statusFilter: StatusFilter
  defaultProjectKey?: string
  onJiraKeyChange: (id: string, key: string) => void
  onJiraKeyBlur: (id: string, key: string) => void
  onJiraSelect: (id: string, key: string, summary: string) => void
  onToggleChange: (id: string, toggle: 'log' | 'skip') => void
}

const EMPTY_JIRA_MATCH: JiraMatch = {
  suggestedJiraKey: '',
  jiraTaskDescription: '',
  confidence: 'LOW',
  matchReason: '',
}

const SORT_HEADERS: Array<{ key: SortKey; label: string }> = [
  { key: 'time', label: 'Time' },
  { key: 'duration', label: 'Duration' },
  { key: 'event', label: 'Event' },
  { key: 'jiraKey', label: 'Jira Key' },
  { key: 'jiraTask', label: 'Jira Task' },
  { key: 'status', label: 'Status' },
]

const STATUS_ORDER: Record<string, number> = {
  MATCHED: 0, HIGH: 1, MEDIUM: 2, LOW: 3, SKIPPED: 4, IGNORED: 5, DUPLICATE: 6,
}

const DEFAULT_SORT: SortState = { key: 'time', dir: 'asc' }

function formatDateHeading(isoDate: string): string {
  // isoDate is YYYY-MM-DD
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function SortArrow({ active, dir }: { active: boolean; dir: SortDirection }) {
  if (active) {
    return (
      <svg className="w-3.5 h-3.5 text-gray-700 shrink-0" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {dir === 'asc'
          ? <polyline points="2,9 5,5 8,9" />
          : <polyline points="2,5 5,9 8,5" />}
      </svg>
    )
  }
  return (
    <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" viewBox="0 0 10 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="2,5 5,2 8,5" />
      <polyline points="2,9 5,12 8,9" />
    </svg>
  )
}

export function ReviewTable({
  workEntries,
  jiraMatchesByWorkEntryId,
  startDate,
  endDate,
  statusFilter,
  defaultProjectKey,
  onJiraKeyChange,
  onJiraKeyBlur,
  onJiraSelect,
  onToggleChange,
}: Props) {
  // Per-group sort state keyed by date string
  const [sortByDate, setSortByDate] = useState<Record<string, SortState>>({})

  function getSort(date: string): SortState {
    return sortByDate[date] ?? DEFAULT_SORT
  }

  function toggleSort(date: string, nextKey: SortKey) {
    setSortByDate(prev => {
      const current = prev[date] ?? DEFAULT_SORT
      return {
        ...prev,
        [date]: {
          key: nextKey,
          dir: current.key === nextKey ? (current.dir === 'asc' ? 'desc' : 'asc') : 'asc',
        },
      }
    })
  }

  function getStatus(entry: WorkEntry): StatusOption {
    if (entry.autoSkipped) return entry.autoSkipSource === 'duplicate' ? 'DUPLICATE' : 'IGNORED'
    if (entry.logToggle === 'skip') return 'SKIPPED'
    if (jiraMatchesByWorkEntryId[entry.id]?.matchSource === 'rule') return 'MATCHED'
    return jiraMatchesByWorkEntryId[entry.id]?.confidence ?? 'LOW'
  }

  function compareEntries(a: WorkEntry, b: WorkEntry, sort: SortState): number {
    const aMatch = jiraMatchesByWorkEntryId[a.id] ?? EMPTY_JIRA_MATCH
    const bMatch = jiraMatchesByWorkEntryId[b.id] ?? EMPTY_JIRA_MATCH
    let cmp = 0
    switch (sort.key) {
      case 'time':     cmp = a.startTime.localeCompare(b.startTime); break
      case 'duration': cmp = a.durationSeconds - b.durationSeconds; break
      case 'event':    cmp = a.calendarEventTitle.localeCompare(b.calendarEventTitle); break
      case 'jiraKey':  cmp = aMatch.suggestedJiraKey.localeCompare(bMatch.suggestedJiraKey); break
      case 'jiraTask': cmp = aMatch.jiraTaskDescription.localeCompare(bMatch.jiraTaskDescription); break
      case 'status':   cmp = (STATUS_ORDER[getStatus(a)] ?? 99) - (STATUS_ORDER[getStatus(b)] ?? 99); break
    }
    if (cmp === 0) cmp = a.startTime.localeCompare(b.startTime)
    return sort.dir === 'asc' ? cmp : -cmp
  }

  const filtered = workEntries.filter(e => {
    if (startDate && e.date < startDate) return false
    if (endDate && e.date > endDate) return false
    if (statusFilter.length === 0) return true
    return statusFilter.includes(getStatus(e) as StatusOption)
  })

  if (!filtered.length) {
    return <p className="py-8 text-center text-sm text-gray-400">No time entries match the current filters.</p>
  }

  // Group by date
  const dateOrder: string[] = []
  const byDate: Record<string, WorkEntry[]> = {}
  for (const entry of filtered) {
    if (!byDate[entry.date]) { dateOrder.push(entry.date); byDate[entry.date] = [] }
    byDate[entry.date].push(entry)
  }
  dateOrder.sort((a, b) => a.localeCompare(b))

  const colgroup = (
    <colgroup>
      <col style={{ width: '72px',  minWidth: '72px',  maxWidth: '72px'  }} />
      <col style={{ width: '80px',  minWidth: '80px',  maxWidth: '80px'  }} />
      <col style={{ width: '25%' }} />
      <col style={{ width: '100px', minWidth: '100px', maxWidth: '100px' }} />
      <col style={{ width: '25%' }} />
      <col style={{ width: '90px',  minWidth: '90px',  maxWidth: '90px'  }} />
      <col style={{ width: '104px', minWidth: '104px', maxWidth: '104px' }} />
    </colgroup>
  )

  return (
    <div className="space-y-3">
      {/* Mobile: card-list per day */}
      <div className="md:hidden rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-200">
        {dateOrder.map(date => {
          const entries = byDate[date]
          const dayLabel = entries[0].dayLabel
          const totalSeconds = entries
            .filter(e => !e.autoSkipped && e.logToggle !== 'skip')
            .reduce((sum, e) => sum + e.durationSeconds, 0)
          return (
            <div key={date}>
              <div className="bg-[#3F7C85] px-4 py-2 flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-white">{dayLabel}</span>
                  <span className="text-xs text-white/70">{formatDateHeading(date)}</span>
                </div>
                {totalSeconds > 0 && (
                  <span className="text-xs font-semibold text-white">{formatDuration(totalSeconds)}</span>
                )}
              </div>
              <div className="divide-y divide-gray-100">
                {entries.map(entry => (
                  <ReviewRow
                    key={entry.id}
                    entry={entry}
                    jiraMatch={jiraMatchesByWorkEntryId[entry.id] ?? EMPTY_JIRA_MATCH}
                    defaultProjectKey={defaultProjectKey}
                    onJiraKeyChange={onJiraKeyChange}
                    onJiraKeyBlur={onJiraKeyBlur}
                    onJiraSelect={onJiraSelect}
                    onToggleChange={onToggleChange}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop: one table per group, shared colgroup so widths align visually */}
      <div className="hidden md:block space-y-3">
        {dateOrder.map(date => {
          const entries = byDate[date]
          const dayLabel = entries[0].dayLabel
          const sort = getSort(date)
          const sorted = [...entries].sort((a, b) => compareEntries(a, b, sort))
          const totalSeconds = entries
            .filter(e => !e.autoSkipped && e.logToggle !== 'skip')
            .reduce((sum, e) => sum + e.durationSeconds, 0)

          return (
            <div key={date} className="rounded-lg border border-gray-200 overflow-hidden">
              {/* Date heading */}
              <div className="bg-[#3F7C85] px-4 py-2 flex items-center justify-between gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-sm font-bold text-white">{dayLabel}</span>
                  <span className="text-xs text-white/70">{formatDateHeading(date)}</span>
                </div>
                {totalSeconds > 0 && (
                  <span className="text-xs font-semibold text-white">{formatDuration(totalSeconds)}</span>
                )}
              </div>

              <table className="w-full text-sm">
                {colgroup}
                {/* Column headers per group */}
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    {SORT_HEADERS.map(header => (
                      <th key={header.key} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleSort(date, header.key)}
                          className="inline-flex items-center gap-1.5 transition-colors hover:text-gray-800"
                        >
                          <span>{header.label}</span>
                          <SortArrow active={sort.key === header.key} dir={sort.dir} />
                        </button>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sorted.map(entry => (
                    <ReviewRow
                      key={entry.id}
                      entry={entry}
                      jiraMatch={jiraMatchesByWorkEntryId[entry.id] ?? EMPTY_JIRA_MATCH}
                      onJiraKeyChange={onJiraKeyChange}
                      onJiraKeyBlur={onJiraKeyBlur}
                      onJiraSelect={onJiraSelect}
                      onToggleChange={onToggleChange}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>
    </div>
  )
}
