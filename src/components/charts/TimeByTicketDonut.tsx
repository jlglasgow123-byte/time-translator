'use client'

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import Link from 'next/link'
import type { WorkEntry, JiraMatchesByWorkEntryId } from '@/types'
import { formatDuration } from '@/lib/timezone'

const COLORS = ['#5E8C95', '#8AB8B0', '#A7BFA6', '#D5B37A', '#C98C7A', '#C47B8B', '#8C88C7', '#6D9DC5', '#78B8A1', '#B39B7A']

interface Props {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
}

export function TimeByTicketDonut({ workEntries, jiraMatchesByWorkEntryId }: Props) {
  const byTicket = workEntries.reduce<Map<string, { key: string; description: string; seconds: number }>>((map, e) => {
    const jiraMatch = jiraMatchesByWorkEntryId[e.id]
    const jiraKey = jiraMatch?.suggestedJiraKey ?? ''
    if (!jiraKey) return map
    const existing = map.get(jiraKey)
    if (existing) {
      existing.seconds += e.durationSeconds
    } else {
      map.set(jiraKey, { key: jiraKey, description: jiraMatch?.jiraTaskDescription ?? '', seconds: e.durationSeconds })
    }
    return map
  }, new Map())

  const sorted = Array.from(byTicket.values()).sort((a, b) => b.seconds - a.seconds)
  const top10 = sorted.slice(0, 10)
  const hiddenCount = sorted.length - top10.length

  const data = top10.map(t => ({ name: t.key, value: t.seconds, description: t.description }))

  if (!data.length) return null

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900">Time by ticket</h3>
        <Link href="/insights" className="text-xs text-blue-600 hover:underline">View full insights →</Link>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Top {top10.length} tickets by time logged{hiddenCount > 0 ? `. ${hiddenCount} other ${hiddenCount === 1 ? 'ticket' : 'tickets'} not shown.` : '.'}
      </p>
      <ResponsiveContainer width="100%" height={332}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="42%"
            innerRadius={68}
            outerRadius={104}
            paddingAngle={3}
            dataKey="value"
            stroke="#FFFFFF"
            strokeWidth={3}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={<TicketTooltip />}
          />
          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="square"
            wrapperStyle={{ paddingTop: 18 }}
            formatter={(value: unknown) => <span className="text-xs text-gray-600">{String(value)}</span>}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function TicketTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; payload?: { description?: string } }>
}) {
  if (!active || !payload?.length) return null

  const item = payload[0]
  const jiraKey = item.name ?? ''
  const description = item.payload?.description ?? ''

  return (
    <div className="rounded-xl border border-[#DCE7E3] bg-white/95 px-3 py-2 shadow-[0_12px_30px_rgba(38,51,58,0.12)]">
      <p className="text-xs font-semibold text-[#26333A]">{jiraKey}</p>
      {description ? <p className="mt-1 max-w-[220px] text-xs leading-5 text-[#66747A]">{description}</p> : null}
      <p className="mt-2 text-xs font-medium text-[#3F7C85]">Time logged: {formatDuration(Number(item.value ?? 0))}</p>
    </div>
  )
}
