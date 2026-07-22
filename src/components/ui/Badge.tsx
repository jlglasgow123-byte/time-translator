import type { Confidence } from '@/types'

const confidenceStyles: Record<Confidence, string> = {
  HIGH: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  MEDIUM: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  LOW: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
}

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${confidenceStyles[confidence]}`}>
      {confidence}
    </span>
  )
}

export function MatchedBadge({ reason }: { reason?: string }) {
  return (
    <span
      title={reason}
      className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-[#3F7C85] text-white cursor-help"
    >
      MATCHED
    </span>
  )
}
