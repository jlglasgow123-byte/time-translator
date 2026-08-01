/**
 * THROWAWAY TEMPORARY DIAGNOSTIC — DELETE ME.
 *
 * Temporary client-side timing instrumentation for the import flow, added to answer
 * one question: of the user's real wait between clicking "match" and seeing the
 * /review table, how much is the server request and how much is everything else?
 *
 * This is NOT a feature. It writes nothing to the database and adds no endpoint. Once
 * the server-vs-client split is known, delete this file, the `devImportTiming.*` call
 * sites, and the NEXT_PUBLIC_TEMP_IMPORT_TIMING entry in .env.example.
 *
 * WHY THIS SHIPS TO PRODUCTION: the Google Calendar sync path — the one with the full
 * six-stage server instrumentation we need to compare against — cannot be exercised
 * locally, because the OAuth redirect_uri is built from NEXT_PUBLIC_APP_URL and
 * localhost:3000 is not a registered redirect URI in the Google Cloud Console.
 *
 * TWO INDEPENDENT SWITCHES ARE REQUIRED before a single mark is recorded:
 *   1. Deploy capability:  NEXT_PUBLIC_TEMP_IMPORT_TIMING=1  (build/deploy-time)
 *   2. Per-browser opt-in: localStorage key TEMP_DELETEME:import-timing-optin === '1',
 *      which is latched by visiting any page with ?devtiming=1
 * With (1) set but not (2) — the normal state for every real visitor — this module is
 * completely inert: no marks, no storage writes, no console output.
 *
 * Deliberately self-contained so removal is one file plus a handful of tagged call lines.
 */

// Obviously-disposable keys. Must not collide with the real session keys in
// src/lib/storage.ts (`jtl:session`, `jtl:form-config`, `jtl:learned`, `jtl:csv-overrides`).
const TEMP_KEY = 'TEMP_DELETEME:import-timing'
const OPT_IN_KEY = 'TEMP_DELETEME:import-timing-optin'
const OPT_IN_PARAM = 'devtiming'

// Switch 1: deploy capability. NEXT_PUBLIC_* so it is readable in the browser; unlike the
// old NODE_ENV gate this deliberately SURVIVES a production build. Unset/anything other
// than '1' means the whole module is dead.
const CAPABILITY_ENABLED = process.env.NEXT_PUBLIC_TEMP_IMPORT_TIMING === '1'

/**
 * Switch 2: per-browser opt-in, checked live on every call (not cached), so turning it
 * off in devtools takes effect immediately without a reload.
 *
 * `?devtiming=1` latches the opt-in for this browser; `?devtiming=0` clears it. This is
 * why a NEXT_PUBLIC_ var alone is not enough: the var is baked in for every visitor to
 * the deployment, whereas this key exists only in one browser's localStorage.
 */
function isEnabled(): boolean {
  if (!CAPABILITY_ENABLED) return false
  if (typeof window === 'undefined') return false
  try {
    const param = new URLSearchParams(window.location.search).get(OPT_IN_PARAM)
    if (param === '1') localStorage.setItem(OPT_IN_KEY, '1')
    else if (param === '0') localStorage.removeItem(OPT_IN_KEY)
    return localStorage.getItem(OPT_IN_KEY) === '1'
  } catch {
    // Storage blocked/unavailable (private mode, cookie policy) — stay off.
    return false
  }
}

// Every mark that a valid run MUST contain, in the order they fire. A run missing any
// of these is discarded rather than reported — see report().
const MARK_ORDER = [
  'click',
  'requestSent',
  'responseHeaders',
  'bodyRead',
  'sessionSaved',
  'reviewMounted',
  'reviewPainted',
] as const

// A run older than this is assumed stale (abandoned import, or a page revisit adopting
// a leftover entry) and is discarded. Real imports are seconds, not minutes.
const MAX_RUN_AGE_MS = 2 * 60 * 1000

export type TimingMark = (typeof MARK_ORDER)[number]

interface TimingRun {
  flow: string
  // performance.now() values. These are relative to the page's time origin, and the
  // time origin CHANGES if the browser does a full document load. Next.js client-side
  // router.push() does not, so within one import these are comparable — see the
  // caveats in the report footer.
  marks: Partial<Record<TimingMark, number>>
  eventCount?: number
  startedAtEpochMs?: number
}

function read(): TimingRun | null {
  try {
    const raw = sessionStorage.getItem(TEMP_KEY)
    return raw ? (JSON.parse(raw) as TimingRun) : null
  } catch {
    return null
  }
}

function write(run: TimingRun): void {
  try {
    sessionStorage.setItem(TEMP_KEY, JSON.stringify(run))
  } catch {
    // ignore — diagnostics must never break the import path
  }
}

/** Begin a new timing run and record the `click` mark. Call on the handler's first line. */
export function start(flow: 'gcal-sync' | 'ics-upload'): void {
  if (!isEnabled()) return
  try {
    write({
      flow,
      marks: { click: performance.now() },
      startedAtEpochMs: Date.now(),
    })
  } catch {
    // ignore
  }
}

/** Record a mark against the in-flight run. Silently ignored if no run is active. */
export function mark(name: TimingMark): void {
  if (!isEnabled()) return
  try {
    const run = read()
    if (!run) return
    run.marks[name] = performance.now()
    write(run)
    // Also drop a real performance mark so the numbers can be cross-checked against
    // the browser Performance panel rather than trusted blindly.
    performance.mark(`${TEMP_KEY}:${name}`)
  } catch {
    // ignore
  }
}

/** Record how many work entries the run returned — duration is meaningless without size. */
export function setEventCount(count: number): void {
  if (!isEnabled()) return
  try {
    const run = read()
    if (!run) return
    run.eventCount = count
    write(run)
  } catch {
    // ignore
  }
}

/**
 * Marks `reviewMounted` on the destination page. Call from the destination page's
 * first effect. Represents "React committed the first render", NOT "data is on screen".
 */
export function markReviewMounted(): void {
  mark('reviewMounted')
}

/**
 * Marks `reviewPainted` and prints the consolidated report (or a loud DISCARDED notice
 * if the run is incomplete or stale), then clears the run so a later mount — e.g. a
 * re-visit to /review — cannot print a stale duplicate report.
 *
 * WHAT reviewPainted ACTUALLY MEANS — read before drawing conclusions:
 * We wait for two nested requestAnimationFrames after the data-loaded render. The
 * inner callback runs at the start of the frame AFTER the one that painted our
 * content, so by the time it fires the content has been painted. It is an
 * approximation, not a real paint timestamp:
 *  - It can OVERSTATE by up to roughly one frame (~16ms at 60Hz), because we measure
 *    the start of the next frame rather than the moment pixels hit the screen.
 *  - It can UNDERSTATE the perceived wait if something renders lazily after this
 *    frame (images, fonts, a virtualised table filling in more rows).
 *  - rAF is throttled in background tabs. If the tab is not focused for the whole
 *    import, this number is garbage — keep the tab in the foreground.
 * Only call this once the page is genuinely rendering its content (not its loading state).
 */
export function markReviewPaintedAndReport(): void {
  if (!isEnabled()) return
  try {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          mark('reviewPainted')
          report()
          clear()
        } catch {
          // ignore
        }
      })
    })
  } catch {
    // ignore
  }
}

function clear(): void {
  try {
    sessionStorage.removeItem(TEMP_KEY)
  } catch {
    // ignore
  }
}

function pct(part: number, total: number): string {
  if (!(total > 0)) return 'n/a'
  return `${((part / total) * 100).toFixed(1)}%`
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10
}

function discard(reason: string, run: TimingRun | null): void {
  // Loud and unmistakable: no table, no SPLIT line, no total. A discarded run must never
  // be readable as a valid measurement — a plausible-looking wrong number is the single
  // worst outcome for this exercise.
  console.error(
    `%c[TEMP import timing] DISCARDED — incomplete run. NO VALID MEASUREMENT. Reason: ${reason}. Re-run the import.`,
    'color:#b00020;font-weight:bold'
  )
  if (run) {
    const present = MARK_ORDER.filter(name => run.marks[name] !== undefined)
    const missing = MARK_ORDER.filter(name => run.marks[name] === undefined)
    console.error('marks present:', present.length ? present.join(', ') : '(none)')
    console.error('marks missing:', missing.length ? missing.join(', ') : '(none)')
  }
  clear()
}

function report(): void {
  const run = read()
  if (!run) return

  // Guard 1: stale run. An abandoned import (error path, 402 billing block, !res.ok
  // early return) leaves a partial entry behind; a later visit to /review would
  // otherwise adopt it and report a "total" spanning minutes of idle human time.
  const age = run.startedAtEpochMs === undefined ? undefined : Date.now() - run.startedAtEpochMs
  if (age === undefined || age > MAX_RUN_AGE_MS) {
    discard(
      age === undefined ? 'no start timestamp' : `run is ${Math.round(age / 1000)}s old (limit ${MAX_RUN_AGE_MS / 1000}s)`,
      run
    )
    return
  }

  // Guard 2: incomplete mark chain. Every mark in MARK_ORDER is required.
  const missing = MARK_ORDER.filter(name => typeof run.marks[name] !== 'number')
  if (missing.length > 0) {
    discard(`missing mark(s): ${missing.join(', ')}`, run)
    return
  }

  const present = [...MARK_ORDER]
  const first = run.marks[present[0]] as number
  const last = run.marks[present[present.length - 1]] as number
  const total = last - first

  const rows = []
  for (let i = 1; i < present.length; i++) {
    const from = present[i - 1]
    const to = present[i]
    const ms = (run.marks[to] as number) - (run.marks[from] as number)
    rows.push({
      segment: `${from} → ${to}`,
      ms: round(ms),
      '% of total': pct(ms, total),
    })
  }

  // The one number this whole exercise exists to produce: server request vs everything
  // else. Both marks are guaranteed present by Guard 2 above.
  const serverMs = (run.marks.bodyRead as number) - (run.marks.requestSent as number)
  const clientMs = total - serverMs

  console.groupCollapsed(
    `%c[TEMP import timing] VALID — ${run.flow} — total ${round(total)}ms, ${run.eventCount ?? '?'} entries`,
    'color:#0b6b3a;font-weight:bold'
  )
  console.table(rows)
  console.log(
    `SPLIT — total ${round(total)}ms | server request (requestSent→bodyRead) ${round(serverMs)}ms (${pct(serverMs, total)}) | everything else ${round(clientMs)}ms (${pct(clientMs, total)})`
  )
  console.log(`entries returned (event_count): ${run.eventCount ?? 'unknown'}`)
  console.log(
    'CAVEATS: reviewPainted is a 2×requestAnimationFrame approximation (±~1 frame, and invalid if the tab was backgrounded). ' +
      'IMPORTANT — the "server request" segment (requestSent→bodyRead) is NOT pure server compute: it includes DNS/TLS/connection ' +
      'setup, request upload, real network latency, and response download. In production that network component is genuine and can be ' +
      'substantial, so this segment OVERSTATES server work. To separate the two, compare it against the six server-side stage timings ' +
      'recorded for this same run — the difference is network + framework overhead. ' +
      'The "everything else" (client) half absorbs this instrumentation\'s own sessionStorage read/write cost (~1-3ms), so it is very ' +
      'slightly pessimistic. ' +
      'A production build gives the trustworthy numbers; if you are running this against a dev server instead, expect the client half ' +
      'to be inflated by unminified code and on-demand route compilation (discard the first such run).'
  )
  console.groupEnd()
}

export const devImportTiming = {
  start,
  mark,
  setEventCount,
  markReviewMounted,
  markReviewPaintedAndReport,
}
