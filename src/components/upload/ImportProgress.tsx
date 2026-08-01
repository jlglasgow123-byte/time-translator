'use client'

import type { ImportStage } from '@/lib/import-stages'

interface ImportProgressProps {
  stages: ImportStage[]
  activeIndex: number
}

/**
 * Pipeline-style staged indicator shown while an import is in flight.
 *
 * Stage state is conveyed by SHAPE + TEXT as well as colour: completed stages get
 * a tick glyph, the current stage a spinner, pending stages a hollow ring — and
 * every row carries visually-hidden state text ("Done"/"In progress"/"Waiting")
 * so nothing depends on colour alone.
 *
 * Accessibility: the wrapper is role="status" aria-live="polite". Only the CURRENT
 * stage label sits inside the live region's announced content, so screen readers
 * announce one short phrase per stage change rather than re-reading the whole list.
 */
export function ImportProgress({ stages, activeIndex }: ImportProgressProps) {
  if (activeIndex < 0) return null

  const currentStage = stages[Math.min(activeIndex, stages.length - 1)]

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-[#DCEEF5] bg-white px-4 py-4"
    >
      {/* Announced to screen readers on each stage change. */}
      <span className="sr-only">{currentStage ? `${currentStage.label}. Please wait.` : ''}</span>

      <ol aria-hidden="true" className="space-y-2.5">
        {stages.map((stage, i) => {
          const isDone = i < activeIndex
          const isCurrent = i === activeIndex
          const stateLabel = isDone ? 'Done' : isCurrent ? 'In progress' : 'Waiting'

          return (
            <li key={stage.id} className="flex items-start gap-3 text-left">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {isDone ? (
                  <svg className="h-5 w-5 text-[#3F7C85]" viewBox="0 0 20 20" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : isCurrent ? (
                  <svg className="h-4 w-4 animate-spin text-[#3F7C85]" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-90"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full border-2 border-[#DCEEF5]" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={`block text-sm ${
                    isCurrent
                      ? 'font-extrabold text-[#26333A]'
                      : isDone
                        ? 'font-semibold text-[#3F7C85]'
                        : 'font-medium text-[#66747A]'
                  }`}
                >
                  {stage.label}
                  <span className="sr-only"> — {stateLabel}</span>
                </span>
                {isCurrent && stage.detail && (
                  <span className="mt-1 block text-xs font-normal leading-5 text-[#66747A]">{stage.detail}</span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
