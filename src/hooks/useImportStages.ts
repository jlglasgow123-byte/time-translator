'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { IMPORT_STAGES, type ImportStage } from '@/lib/import-stages'

/**
 * Drives the staged import indicator.
 *
 * Advances through the given stages on a timer calibrated to real server stage
 * durations, then HOLDS on the final stage until stop() is called. See
 * `src/lib/import-stages.ts` for why this is a timed approximation and not a
 * real progress feed.
 *
 * Timer safety: exactly one pending timeout exists at a time. It is cleared on
 * stop() (success AND error paths) and on unmount, so nothing can fire after the
 * component goes away or after the router navigates to /review.
 */
export function useImportStages(stages: ImportStage[] = IMPORT_STAGES) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Held in a ref so the recursive scheduling loop never closes over a stale stage
  // list. Kept in sync on every render; start() may override it for the current tick
  // when the caller switches lists and starts simultaneously (see start()).
  const stagesRef = useRef(stages)
  useEffect(() => { stagesRef.current = stages }, [stages])

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const scheduleFrom = useCallback((index: number) => {
    clearTimer()
    const stage = stagesRef.current[index]
    // Final stage (or an unknown index) holds until stop() — never auto-advance
    // past the end, so a slow import doesn't run out of stages.
    if (!stage || !Number.isFinite(stage.holdMs)) return
    if (index >= stagesRef.current.length - 1) return

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const next = index + 1
      setActiveIndex(next)
      scheduleFrom(next)
    }, stage.holdMs)
  }, [clearTimer])

  /**
   * Begin the sequence. Pass `overrideStages` when the caller is switching stage
   * lists in the same tick as starting (e.g. choosing the CSV list on submit) —
   * the ref would otherwise still hold the previous render's list.
   */
  const start = useCallback((overrideStages?: ImportStage[]) => {
    if (overrideStages) stagesRef.current = overrideStages
    clearTimer()
    setActiveIndex(0)
    scheduleFrom(0)
  }, [clearTimer, scheduleFrom])

  /** Call on success AND on every failure path — stops the sequence and resets. */
  const stop = useCallback(() => {
    clearTimer()
    setActiveIndex(-1)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return {
    stages,
    activeIndex,
    running: activeIndex >= 0,
    start,
    stop,
  }
}
