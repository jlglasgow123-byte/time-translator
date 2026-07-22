import type { WorkEntry, JiraMatchesByWorkEntryId } from '@/types'
import { formatDuration } from '@/lib/timezone'

interface Props {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
  onFilterNeedsReview?: () => void
}

export function SummaryStatsBar({ workEntries, jiraMatchesByWorkEntryId, onFilterNeedsReview }: Props) {
  const toLog = workEntries.filter(e => e.logToggle === 'log' && !e.autoSkipped)
  const toSkip = workEntries.filter(e => e.logToggle === 'skip' && !e.autoSkipped)
  const ignored = workEntries.filter(e => e.autoSkipped)

  // Needs review = AI-matched entries that are LOW or MEDIUM confidence (not rule-matched)
  const needsReview = toLog.filter(e => {
    const match = jiraMatchesByWorkEntryId[e.id]
    if (!match || match.matchSource === 'rule') return false
    return match.confidence === 'LOW' || match.confidence === 'MEDIUM'
  })

  const logSeconds = toLog.reduce((s, e) => s + e.durationSeconds, 0)
  const skipSeconds = toSkip.reduce((s, e) => s + e.durationSeconds, 0)
  const ignoredSeconds = ignored.reduce((s, e) => s + e.durationSeconds, 0)

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-2 rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-sm">
      {/* Left: logging stats */}
      <div className="flex flex-wrap gap-6">
        <Stat label="To log" value={String(toLog.length)} sub={formatDuration(logSeconds)} />
        <Stat
          label="Needs review"
          value={String(needsReview.length)}
          highlight={needsReview.length > 0}
          onClick={needsReview.length > 0 ? onFilterNeedsReview : undefined}
        />
      </div>

      {/* Right: skip / ignore / total */}
      <div className="flex flex-wrap items-center gap-6">
        <Stat label="To skip" value={String(toSkip.length)} sub={formatDuration(skipSeconds)} />
        <Stat label="Ignored" value={String(ignored.length)} sub={formatDuration(ignoredSeconds)} />
      </div>
    </div>
  )
}

function Stat({ label, value, sub, highlight, onClick }: { label: string; value: string; sub?: string; highlight?: boolean; onClick?: () => void }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="font-semibold text-amber-700 underline decoration-dotted underline-offset-2 hover:text-amber-800"
          title="Click to filter to these entries"
        >
          {value}
        </button>
      ) : (
        <span className={`font-semibold ${highlight ? 'text-amber-700' : 'text-gray-900'}`}>{value}</span>
      )}
      {sub && <span className="ml-1 text-gray-400">({sub})</span>}
    </div>
  )
}
