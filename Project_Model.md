# Project Model — Time Translator

> The master source of truth for how Time Translator is built and governed. The PRD (`PRD.md`) says *what the product is*; this document says *how we work on it, what's decided, what's in scope, and what's still open*. Where the PRD and this document overlap, the PRD wins on product intent and this document wins on process, scope, and standards. If they genuinely conflict, STOP and ask Jasmine — do not guess which wins.

**Owner:** Jasmine Glasgow
**Last updated:** 2026-07-22
**Related docs:** `PRD.md` (product requirements), `CHANGELOG.md` (dated change history), `README.md` (setup), `SECURITY.md` (security posture)

---

## 1. Core Behaviour (applies to all agents and the main assistant)

These are the non-negotiable rules of engagement on this project:

- **Humans make decisions.** Agents explain consequences, trade-offs, and options. They do not decide product direction, architecture, or trade-offs on Jasmine's behalf.
- **Never silently resolve ambiguity.** If a request is unclear, incomplete, or open to more than one reading, STOP and ask specific, structured questions before acting. An assumption you don't surface is a decision you made without asking.
- **Surface conflicts, don't pick a winner.** If information conflicts — PRD vs. this document vs. the code vs. a new request — STOP, state the conflict plainly, and wait for Jasmine to resolve it.
- **Decisions must be recorded.** Every accepted product or architectural decision is written back into this document (Section 6 Key Decisions, Section 8 Open Questions, or Section 4 Scope). An accepted decision that isn't recorded doesn't count as done.
- **Stay within approved scope (Section 4).** Flag scope creep explicitly rather than absorbing it silently.
- **Respect the Key Product Principles** in `PRD.md` Section 11 — they may not be undone without an explicit recorded decision.

## 2. Product Overview (summary — PRD is authoritative)

Time Translator is a mobile-friendly web SaaS that ingests a user's calendar, uses rules and AI to interpret each event, and produces structured, reviewable outputs — Jira worklogs today, invoice-ready CSV next. One imported/reviewed time layer → multiple destination output lanes. See `PRD.md` Sections 1–2 for the authoritative version.

## 3. Domain Model (summary — PRD is authoritative)

The core flow is **Import → Match → Review → Confirm → Log/Export**:

- **Import** — `.ics` upload (2 MB, ≤200 events), date-range + rules, raw file never stored.
- **Match** — tiered, each tier beats the next: (1) exact Jira key / deterministic mapping rule, (2) learned user memory, (3) AI suggestion with confidence + reason, (4) needs-review. Duplicate detection auto-skips later copies.
- **Review** — sortable/filterable table; log/skip toggle; editable Jira key; confidence + reason shown; no rows silently dropped.
- **Confirm** — grouped by day, daily totals, log-all.
- **Log/Export** — post worklogs to Jira; export CSV.

Key entities live in Supabase with strict per-user RLS: `jira_credentials`, `profiles`, `usage`, `import_runs`, `import_event_traces`. See `PRD.md` Sections 5–6 for detail.

## 4. Current Scope

Scope is defined by the PRD roadmap (`PRD.md` Section 9). Restated here as the scope gate agents check against:

**In scope now (P0 — launch blockers):**
- End-to-end import reliability + real error surfaces on failure.
- Proven RLS isolation across all user-owned tables.
- Production migrations applied; `npm run security:check` + `npm run build` clean.
- Supabase Auth redirect allow-list correct; production env vars verified.
- Matching correctness (duplicates, ignore/mapping rules, overrides persist, no dropped rows) and output correctness (Jira + CSV).
- MFA on operator accounts; spend/usage alerts.

**Next (P1 — before wider launch):**
- Complete Stripe (checkout, portal, webhooks, subscription state) + user-facing billing.
- Learned-mapping memory surfaced and controllable.
- Durable rate limiting; user-facing "why matched/skipped" trace view.
- Support/data processes (delete/export user data).

**Later (P2 — post-launch):** CSV-only-without-Jira, Google Calendar OAuth, Xero invoice CSV export (then MYOB), expanded insights, team/multi-user *if traction supports it*.

**Out of scope (Non-Goals — `PRD.md` Section 3):** full in-app invoicing platform; direct Xero/MYOB API; team/multi-user or shared memory (MVP); storing raw `.ics`; ad/upsell sprawl.

Anything not covered above is **scope-affecting** and requires a product decision before it's built.

## 5. Tech Stack & Architecture (summary — PRD Section 8 authoritative)

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 4.
- **Backend:** Next.js API routes, Supabase (Auth + Postgres + RLS).
- **AI:** Anthropic SDK (event-to-ticket matching).
- **Libraries:** `node-ical`, `luxon`, `recharts`, `@upstash/ratelimit` + Redis, `stripe`.
- **Ops:** Vercel hosting + Analytics, Sentry monitoring.
- **Deploy:** push to `github.com/jlglasgow123-byte/time-translator` → Vercel → `timetranslator.com.au`.

Preserve this architecture unless an approved, recorded decision changes it.

## 6. Key Decisions

Record every accepted product/architecture decision here, most recent first, as: `YYYY-MM-DD — decision — one-line why`.

- 2026-08-03 — Go-to-market targets **two audiences on the two output lanes**: female founders/solopreneurs (Finance/Xero lane — the real revenue market) and vibe-coders/devs (Jira lane — the free QA/beta army). The beta runs on `.ics`+Jira and needs no Google, so it de-risks and hardens the product ahead of the founder-facing public launch. — recorded in `LAUNCH_PLAN.md` §6.
- 2026-08-01 — **The AI match reason is support-inspectable, not user-visible — and the docs now say so.** `PRD.md` 6.4 and the Help FAQ claimed "every AI suggestion shows a confidence level and reason", but `ReviewRow.tsx` only ever surfaced the reason for deterministic matches; AI rows get `ConfidenceBadge`, which has no tooltip. Rather than build the missing UI, Jasmine chose speed: the reason is still generated and persisted to `import_event_traces` for support lookup, and both documents were amended to describe actual behaviour. Principle 4 ("AI as explainable translation, not magic guesswork") is held by the confidence label, the editable Jira key and the ticket summary. Revisit if the P1 user-facing trace view is built. Note `inferMatchMethod()` in `import-runs.ts` string-matches on the **deterministic** reason literals — those strings must not be changed.
- 2026-08-01 — **AI quota is refunded when the failure is ours.** `matchEvents` catches Anthropic API errors internally and *resolves* with `aiUnavailable: true` rather than throwing, so the route's `catch` never fired and `refundAiUsage` never ran — the user's monthly cap was debited for matches never produced, caused by our API key or credit balance. `matchEvents` now returns `unbilledEventCount` and both routes refund it. Refunds on any thrown Anthropic error (401/402/429/5xx/timeout — deliberately not discriminating by cause, since the user got nothing either way), on a response that parses to zero usable matches, and on a `max_tokens` truncation yielding nothing. Does **not** refund a truncation that produced some matches (partial service, and proportional refunding would mean paying for parse quality) or a batch where the model simply matched fewer events than sent. Counted per batch so one failed batch of four refunds 50, not 200 or 0; a `usageRefunded` flag prevents double-refunding with the `catch` path, and the amount is clamped to what was consumed. Note the asymmetry: a 429 now refunds but does not set `aiUnavailable`, because that flag drives a user-facing "AI is down" message while the refund is an accounting fact.
- 2026-08-01 — **Import latency root-caused: it is output token generation, not anything fixable in our code.** Per-phase instrumentation showed `matchEvents` is ~100% the Anthropic API call (deterministic matching, prompt building and parsing total 6–12ms), and API time tracks output tokens at ~5ms/token over an ~800–900ms fixed floor. Prompt size, connection reuse, region and batch sizing were each tested and ruled out — recorded so they are not re-investigated. Two of the three hypotheses raised during the investigation were overturned by measurement, which is why the measure-before-optimising sequence was kept.
- 2026-08-01 — **Which events go to the AI is decided in exactly one place.** `countEventsRequiringAi()` and `matchEvents()` previously mirrored two gates (the `autoSkipped` filter and `tickets.length > 0`), with only a comment preventing divergence — a latent trap where adding a gate to one and not the other would silently break billing again. Extracted `selectForAi()` returning `{ nonSkipped, deterministicMatches, selected }`, with `selectEventsForAi()` as the exported wrapper and `countEventsRequiringAi()` as `selectEventsForAi(...).length`. Pure refactor: same events, same order, same batching, and `deterministic()` still runs once per `matchEvents` call.
- 2026-08-01 — **AI quota now charges only events that actually reach the model.** Both `/api/process` and `/api/google-calendar/sync` billed every non-skipped event, but `matchEvents` runs `deterministic()` first and only sends the leftover `unmatched` subset to Anthropic — a production 146-event import charged 146 matches for 15 real AI calls (~10x overcharge against the 200/month trial cap). Fixed by exporting `countEventsRequiringAi()` from `ai-matcher.ts` and computing the true count in the route *before* `checkRateLimit`/`consumeAiUsage`, so **the cap is still enforced pre-call** rather than refunded afterwards. Chose this over having `matchEvents` return the real count and reconciling via `refundAiUsage`, because that leaves a window where the user is over-charged and could strand the overcharge if the request died in between. The helper repeats the deterministic pass; benchmarked at ~0.2ms worst case (146 events, 20 rules, 200 learned mappings), under 0.01% of a ~5-12s import. No DB migration required — `consume_ai_usage` already accepts an amount of 0 and `refundAiUsage` already no-ops at 0.
- 2026-08-01 — **Import progress is a staged indicator, deliberately with no live counts or percentages.** The import is a single POST with no server→client progress channel, so stage *names* advance on a timer calibrated to measured `import_run_analytics` durations (AI stage dominates and holds longest; the final stage holds until the response actually arrives). Declined to show "42 of 186 processed" or a percentage: with no streaming channel those would be animated on a timer, disconnected from real work, and would visibly drift or stall during the ~6.6s AI call — costing more trust than they buy. Revisit only if a real progress channel is built.
- 2026-08-01 — **AI matching stays scoped to a single default project.** Considered letting users configure up to ~10 Jira projects for auto-matching, and declined. Events with a Jira key in the title already match deterministically against any project (`ai-matcher.ts` `deterministic()`); only key-less events reach the AI, and those are matched against the default project's open tickets alone. Kept on **simplicity and predictability** grounds — the title-key path already covers cross-project logging. Note the prompt-size argument does *not* support this decision: real open-ticket counts are ~89 (DOC), ~116 and ~139, so the 500-ticket cap (`MAX_JIRA_TICKETS_PER_FETCH`) never binds and even three projects would not make the prompt large. Revisit on its merits if multi-project matching is wanted. Documented in `PRD.md` 6.7, the Settings helper text, and the Help FAQ, because "default" wrongly implies a preference rather than a hard scope.
- 2026-08-01 — **Measured the import wait before building any performance tooling.** Scoped an admin panel over `import_run_analytics` (avg/p95 + per-stage %) but deliberately deferred building it until the server-vs-client split was known, since server-only stage timings cannot answer "what happens between clicking import and seeing the review page". Shipped a temporary, flag-gated client diagnostic to production to get that number — local measurement was impossible because `localhost` is not a registered Google OAuth redirect URI. Result: the server is ~98% of the wait, the review page render is <250ms, and `match_events` (the AI call) is ~73% of server time. The panel's original scoping assumptions need revisiting before it is built.
- 2026-08-01 — **`import_run_analytics` had never recorded a row** since creation in July: the insert used the request-scoped user client against an INSERT policy of `with check (false)`, and the error was swallowed. Fixed by writing via the service-role client (policy deliberately unchanged) and routing failures through `captureAppError`. The other three writes in `import-runs.ts` satisfy `auth.uid() = user_id` and correctly keep the user client, so RLS still enforces per-user isolation where it is meaningful.
- 2026-07-24 — **Paid launch on 30 August 2026**, not free-only or beta-only; Stripe checkout/portal/webhooks must be verified end-to-end before launch. Balanced technical/marketing tracks. Launch marketing uses Phase-1 (freelancer/solo) messaging; the enterprise "operational visibility" reposition stays Phase-2. — full plan in `LAUNCH_PLAN.md`.
- 2026-07-24 — **Google Calendar OAuth (`calendar.readonly`) sensitive-scope approved by Google** — the feature (built 2026-07-13) is now available to all users, not just ≤100 test users. Corrected the stale PRD assumption that Calendar OAuth was unbuilt P2 work.
- 2026-07-24 — Adopted the rule **"never create Claude artifacts for this project"** (repo is linked to a work account); shareable/rendered docs go to repo files instead. — recorded in `CLAUDE.md`.
- 2026-07-22 — Adopted the three-agent workflow (product-manager, software-developer, technical-reviewer) with a mandatory review-and-commit gate — to bring Time Translator onto the same governed process as other projects.
- 2026-07-22 — `technical-reviewer` is the single Claude-side reviewer; the older Codex `AGENTS.md` / `codex-review-prompts.md` flow is deprecated (its checklist folded into the reviewer). — one reviewer, one source of review truth.

*(Pre-existing product decisions are captured as the Key Product Principles in `PRD.md` Section 11.)*

## 7. Development Standards

- **Naming:** clear, descriptive; follow existing patterns in the codebase.
- **Commit style:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
- **Coding style:** simple, explicit, small functions. No premature abstraction, no clever generality, no silent failure. Validate at system boundaries (API routes, external integrations, user input).
- **Security posture (see `SECURITY.md` and `PRD.md` Section 7):** secrets stay server-side; Jira tokens encrypted at rest and never returned to the browser; RLS enforced on every user-owned table; usage caps enforced server-side. These are correctness requirements, not preferences.
- **Build gate:** `npm run build` (runs `prebuild` → `npm run security:check`) must pass clean before any commit.

## 8. Testing Expectations

Write tests for meaningful behaviour, prioritising the pieces where a defect is most damaging:

- **Matching intelligence** — tier ordering (exact/mapping → memory → AI → needs-review), duplicate detection, ignore/mapping rules, override persistence, and the guarantee that **no rows are silently dropped**.
- **Output correctness** — Jira worklog payloads, durations, timezone/date edge cases, no duplicate logging; CSV header/row stability.
- **Data isolation** — RLS: a user can never read/write another user's rows (the two-browser isolation test is the reference bar).
- **Usage/billing** — atomic usage consumption/refund RPCs; caps enforced without locking out normal users.

Flag meaningful behaviour that lacks a test — not raw coverage numbers.

## 9. Open Questions / Known Blockers

Track unresolved decisions here so they aren't silently resolved in code.

- **Stripe billing** — checkout/portal/webhooks not yet complete (P1). Blocks paid-plan launch.
- **Import latency (~12s at 146 events, ~7s at 1 event) — cause established, remaining fix deferred.** Root-caused 2026-08-01 with per-phase instrumentation; see the Key Decision of the same date. `matchEvents` is ~100% the Anthropic API call (everything else totals 6–12ms) and the API time tracks **output token generation**: 110 output tokens → 1,528ms, 1,173 → 6,585ms, i.e. ~800–900ms irreducible fixed cost (Sydney→US round trip + time-to-first-token) plus ~5ms per output token. **Ruled out and not to be revisited:** input/prompt size (~2,900 tokens; the 500-ticket cap never binds at 89–139 real tickets), connection reuse (client hoisted to module scope; cold vs warm within noise), region (`syd1` is correct for AU users), and every code-side optimisation (prompt caching, compact serialisation, batch sizing) — all would save single-digit ms. **The only remaining lever is output size:** the response schema requires a free-text `reason` per event (~78 output tokens/event, of which ~45–55 is the sentence). Replacing it with a short enum expanded client-side would cut the AI phase ~53% (~6.6s → ~3.1s at 15 AI-matched events) — but note it saves only ~400ms on a single-event import, so it does **not** address first-run drop-off. Deferred pre-launch in favour of the staged progress indicator. Gate any such change on a 30–50 event before/after comparison of `jiraKey`/`confidence`: generating a justification may act as reasoning that improves the decision, so compressing it risks degrading match accuracy invisibly.
- **`matchReason` is generated for AI matches but never rendered.** `ReviewRow.tsx` surfaces it only when `matchSource === 'rule'` (`MatchedBadge`) or via an exact string equality on one hardcoded deterministic reason (`MetaIcon`); AI rows get `ConfidenceBadge`, which has no tooltip. But `PRD.md` 6.4/Section 10 and the Help FAQ ("Every AI suggestion shows a confidence level and reason") promise otherwise. Resolve by rendering it or by amending the claim — Jasmine's stated preference is that speed beats a visible per-match reason, with a hidden value the support team can inspect, which points at amending the claim. Note `inferMatchMethod()` in `import-runs.ts` string-matches on the **deterministic** reason literals — those must not be changed.
- **Streaming the import response** — would not reduce total time but would replace a ~6.6s blank wait with progressive results, which targets perceived wait more directly than token-shaving. Assessed as multi-day: changes the sync route to a streamed response, needs a client-side incremental consumer, and introduces partial-session semantics that make the "no rows silently dropped" guarantee materially harder to hold. Deferred as P2, explicitly not before 30 August.
- **Temporary import-timing diagnostic is live in production** behind `NEXT_PUBLIC_TEMP_IMPORT_TIMING` + a per-browser `?devtiming=1` opt-in. Delete `src/lib/dev-import-timing.ts`, the tagged call sites, the `.env.example` entry and the Vercel variable once no longer needed.
- **No test runner exists** — no `test` script, framework, or test files, while Section 8 sets testing expectations. **Backlogged 2026-08-01** (Jasmine's call: tooling work competing with launch-blocking work five weeks out). Two bugs this year would have been caught by one: the `import_run_analytics` silent write failure that survived weeks, and the ~10x AI quota overcharge. The refund arithmetic added on 2026-08-01 is also uncovered. Options assessed but not chosen: Vitest (recommended — minimal config, native TS/ESM), Jest, or `node:test`. `selectEventsForAi()` was deliberately written as a pure function so the billing invariant is trivially testable when a runner lands.
- *(Add new open questions here as they arise; move them to Key Decisions once resolved.)*

## 10. Migrations

Any DB migration must be **explicitly flagged to Jasmine** with the full SQL script to run manually in Supabase. Never assume a migration has been run. (Also stated in `CLAUDE.md`.)
