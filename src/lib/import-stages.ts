// Staged progress indicator for calendar imports.
//
// HONESTY NOTE — read before changing any of this.
//
// The import is a SINGLE POST that returns everything at once. There is no
// server→client progress channel, so the client genuinely does not know how far
// along the server is. Consequently:
//
//   * Stage NAMES advance on a timer calibrated to real measured server stage
//     durations (below). This is an honest approximation of elapsed progress.
//   * We show NO numbers, percentages or progress bars, and no live "42 of 186
//     processed" counter. A live count would have to be animated on a timer and
//     would visibly drift — stalling, or sitting at "186 of 186" through the
//     multi-second AI call. That costs more trust than it buys.
//   * The FINAL stage holds indefinitely until the response actually arrives, so
//     a slow import never runs off the end of the list and never claims to be
//     finished before it is.
//
// Do not add a percentage, an ETA, or a live item counter unless a real progress
// channel exists to back it.
//
// Durations come from production `import_run_analytics` (see Project_Model.md
// Section 9): auth ~200ms, creds ~580ms, fetch calendar events ~930-1,150ms,
// entitlement ~190ms, fetch Jira tickets ~900-960ms, match events ~1,500ms
// (small) to ~6,600ms (large). Total ~5.2s to ~11.9s. The AI stage dominates, so
// stages are deliberately NOT evenly distributed.

export interface ImportStage {
  id: string
  label: string
  /**
   * How long to display this stage before advancing to the next one, in ms.
   * Calibrated to measured server timings. The last stage ignores this and holds
   * until the request resolves.
   */
  holdMs: number
  /** Optional expectation-setting detail, shown only while this stage is current. */
  detail?: string
}

export const IMPORT_STAGES: ImportStage[] = [
  {
    id: 'reading',
    label: 'Reading your calendar',
    // auth + creds + calendar fetch ≈ 1.7-1.9s
    holdMs: 1800,
  },
  {
    id: 'identifying',
    label: 'Identifying work meetings',
    // entitlement + rule/duplicate handling — fast
    holdMs: 700,
  },
  {
    id: 'finding',
    label: 'Finding matching Jira issues',
    // Jira ticket fetch ≈ 0.9-1.0s
    holdMs: 1000,
  },
  {
    id: 'confidence',
    label: 'Checking confidence',
    // Start of the AI phase. This and the final stage cover match_events, which is
    // ~1.5s on a small import and ~6.6s on a large one.
    holdMs: 2500,
    detail: 'This can take up to a minute if your calendar contains lots of meetings.',
  },
  {
    id: 'preparing',
    // Final stage — holds until the response arrives, however long that takes.
    label: 'Preparing suggestions',
    holdMs: Number.POSITIVE_INFINITY,
    detail: 'Almost there — putting your suggestions in order.',
  },
]

/** For the ICS "CSV Export" path, which never calls the AI. */
export const CSV_IMPORT_STAGES: ImportStage[] = [
  IMPORT_STAGES[0],
  IMPORT_STAGES[1],
  { ...IMPORT_STAGES[4], detail: 'Almost there — preparing your export.' },
]
