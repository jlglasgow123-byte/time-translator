'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts'
import { Button } from '@/components/ui/Button'
import { formatDuration } from '@/lib/timezone'
import type { WorklogEntry } from '@/app/api/jira/worklogs/route'

type TopN = 10 | 20 | 50
type TimeView = 'day' | 'week' | 'month'

const KEY_SERIES_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#EC4899', '#84CC16']

function getDefaults() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().slice(0, 10)
}

function formatAxisLabel(dateStr: string, view: TimeView): string {
  if (view === 'day') {
    const d = new Date(dateStr + 'T12:00:00')
    return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
  }
  if (view === 'week') {
    const d = new Date(dateStr + 'T12:00:00')
    const endD = new Date(d)
    endD.setDate(endD.getDate() + 6)
    const s = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    const e = endD.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
    return `${s} – ${e}`
  }
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-AU', { month: 'short', year: 'numeric' })
}

export default function InsightsPage() {
  const router = useRouter()
  const defaults = getDefaults()
  const [startDate, setStartDate] = useState(defaults.start)
  const [endDate, setEndDate] = useState(defaults.end)
  const [topN, setTopN] = useState<TopN>(10)
  const [timeView, setTimeView] = useState<TimeView>('day')
  const [worklogs, setWorklogs] = useState<WorklogEntry[] | null>(null)
  const [capped, setCapped] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  async function handleFetch() {
    const diffDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000
    if (diffDays > 90) { setDateError('Date range cannot exceed 90 days.'); return }
    setDateError(null)
    setError(null)
    setLoading(true)
    try {
      const res = await fetch(`/api/jira/worklogs?start=${startDate}&end=${endDate}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to fetch worklogs')
      setWorklogs(data.worklogs)
      setCapped(data.capped ?? false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const grandTotal = useMemo(
    () => worklogs?.reduce((s, w) => s + w.timeSpentSeconds, 0) ?? 0,
    [worklogs]
  )

  const allByTicket = useMemo(() => {
    if (!worklogs) return []
    return Object.values(
      worklogs.reduce<Record<string, { key: string; summary: string; seconds: number }>>((acc, w) => {
        if (!acc[w.issueKey]) acc[w.issueKey] = { key: w.issueKey, summary: w.issueSummary, seconds: 0 }
        acc[w.issueKey].seconds += w.timeSpentSeconds
        return acc
      }, {})
    ).sort((a, b) => b.seconds - a.seconds)
  }, [worklogs])

  const byTicket = allByTicket.slice(0, topN)
  const topNTotal = byTicket.reduce((s, t) => s + t.seconds, 0)
  const otherCount = allByTicket.length - byTicket.length
  const otherTotal = grandTotal - topNTotal

  const byTimeData = useMemo(() => {
    if (!worklogs) return []
    const acc: Record<string, number> = {}
    for (const w of worklogs) {
      let key = w.date
      if (timeView === 'week') key = getMondayKey(w.date)
      else if (timeView === 'month') key = w.date.slice(0, 7) + '-01'
      acc[key] = (acc[key] ?? 0) + w.timeSpentSeconds
    }
    return Object.entries(acc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, seconds]) => ({ date, seconds, label: formatAxisLabel(date, timeView) }))
  }, [worklogs, timeView])

  // Jira key breakdown over time: same top-N tickets as "Time by ticket", stacked
  // per time bucket so you can see how the mix of work shifts week to week.
  const topKeysForBreakdown = useMemo(() => allByTicket.slice(0, 8).map(t => t.key), [allByTicket])

  const byKeyOverTimeData = useMemo(() => {
    if (!worklogs || topKeysForBreakdown.length === 0) return []
    const keySet = new Set(topKeysForBreakdown)
    const acc: Record<string, Record<string, number>> = {}
    for (const w of worklogs) {
      if (!keySet.has(w.issueKey)) continue
      let bucketKey = w.date
      if (timeView === 'week') bucketKey = getMondayKey(w.date)
      else if (timeView === 'month') bucketKey = w.date.slice(0, 7) + '-01'
      if (!acc[bucketKey]) acc[bucketKey] = {}
      acc[bucketKey][w.issueKey] = (acc[bucketKey][w.issueKey] ?? 0) + w.timeSpentSeconds
    }
    return Object.entries(acc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byKey]) => ({ date, label: formatAxisLabel(date, timeView), ...byKey }))
  }, [worklogs, timeView, topKeysForBreakdown])

  const isEmpty = worklogs !== null && worklogs.length === 0
  const hasData = worklogs !== null && worklogs.length > 0

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-4xl px-4 space-y-6">

        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insights</h1>
          <p className="mt-1 text-sm text-gray-500">View time logged to Jira within a date range. Maximum 90 days.</p>
        </div>

        {/* Date range */}
        <div className="rounded-lg bg-white border border-gray-200 p-4 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">From</label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">To</label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              max={getToday()}
              onChange={e => setEndDate(e.target.value)}
              className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </div>
          <Button onClick={handleFetch} loading={loading}>Load insights</Button>
          {dateError && <p className="text-xs text-red-600 w-full -mt-2">{dateError}</p>}
          {error && <p className="text-xs text-red-600 w-full -mt-2">{error}</p>}
        </div>

        {/* Cap warning */}
        {capped && (
          <div className="rounded-md bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            This date range contains more than 500 issues with worklogs. Data shown may be incomplete — try a shorter date range for complete results.
          </div>
        )}

        {/* Grand total */}
        {hasData && (
          <div className="rounded-lg bg-white border border-gray-200 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">Total time logged for this period</p>
            <p className="text-3xl font-semibold text-gray-900">{formatDuration(grandTotal)}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="rounded-lg bg-white border border-gray-200 px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No time logged in this range.</p>
            <Link href="/upload" className="mt-2 inline-block text-sm text-blue-600 hover:underline">
              Upload a calendar file to get started →
            </Link>
          </div>
        )}

        {/* Time by ticket */}
        {byTicket.length > 0 && (
          <div className="rounded-lg bg-white border border-gray-200 p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Time by ticket</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Top {Math.min(topN, allByTicket.length)} of {allByTicket.length} {allByTicket.length === 1 ? 'ticket' : 'tickets'} · {formatDuration(topNTotal)} shown
                  {otherCount > 0 && (
                    <> · <span className="text-gray-500">{formatDuration(otherTotal)} logged to {otherCount} other {otherCount === 1 ? 'ticket' : 'tickets'} not shown</span></>
                  )}
                </p>
              </div>
              <div className="flex rounded border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
                {([10, 20, 50] as TopN[]).map(n => (
                  <button
                    key={n}
                    onClick={() => setTopN(n)}
                    className={`px-3 py-1.5 transition-colors ${topN === n ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    Top {n}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(200, byTicket.length * 38)}>
              <BarChart data={byTicket} layout="vertical" margin={{ left: 8, right: 72, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={s => `${Math.round(s / 3600)}h`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="key" tick={{ fontSize: 11 }} width={72} />
                <Tooltip
                  formatter={(v: unknown) => [formatDuration(Number(v)), 'Time logged']}
                  labelFormatter={(label: unknown) => {
                    const key = String(label)
                    const item = byTicket.find(t => t.key === key)
                    return item?.summary ? `${key} — ${item.summary}` : key
                  }}
                  contentStyle={{ fontSize: 12 }}
                  labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: '#374151' }}
                />
                <Bar dataKey="seconds" fill="#3B82F6" radius={[0, 3, 3, 0]}>
                  <LabelList
                    dataKey="seconds"
                    position="right"
                    formatter={(v: unknown) => formatDuration(Number(v))}
                    style={{ fontSize: 11, fill: '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Time by day / week / month */}
        {byTimeData.length > 0 && (
          <div className="rounded-lg bg-white border border-gray-200 p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  {timeView === 'day' ? 'Time by day' : timeView === 'week' ? 'Time by week' : 'Time by month'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">Total for period: {formatDuration(grandTotal)}</p>
              </div>
              <div className="flex rounded border border-gray-200 overflow-hidden text-xs font-medium shrink-0">
                {(['day', 'week', 'month'] as TimeView[]).map(v => (
                  <button
                    key={v}
                    onClick={() => setTimeView(v)}
                    className={`px-3 py-1.5 transition-colors ${timeView === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(120, byTimeData.length * 34)}>
              <BarChart data={byTimeData} layout="vertical" margin={{ left: 8, right: 72, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={s => `${Math.round(s / 3600)}h`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
                <Tooltip
                  formatter={(v: unknown) => [formatDuration(Number(v)), 'Time logged']}
                  contentStyle={{ fontSize: 12 }}
                  labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: '#374151' }}
                />
                <Bar dataKey="seconds" fill="#8B5CF6" radius={[0, 3, 3, 0]}>
                  <LabelList
                    dataKey="seconds"
                    position="right"
                    formatter={(v: unknown) => formatDuration(Number(v))}
                    style={{ fontSize: 11, fill: '#374151' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Jira key breakdown over time */}
        {byKeyOverTimeData.length > 0 && (
          <div className="rounded-lg bg-white border border-gray-200 p-6">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Jira key breakdown over time</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Top {topKeysForBreakdown.length} tickets by total time, stacked per {timeView}.
              </p>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(240, byKeyOverTimeData.length * 40)}>
              <BarChart data={byKeyOverTimeData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={s => `${Math.round(Number(s) / 3600)}h`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
                <Tooltip
                  formatter={(v: unknown, name: unknown) => [formatDuration(Number(v)), String(name)]}
                  contentStyle={{ fontSize: 12 }}
                  labelStyle={{ color: '#111827', fontWeight: 600, marginBottom: 2 }}
                  itemStyle={{ color: '#374151' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topKeysForBreakdown.map((key, i) => (
                  <Bar key={key} dataKey={key} stackId="keys" fill={KEY_SERIES_COLORS[i % KEY_SERIES_COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

      </div>
    </div>
  )
}
