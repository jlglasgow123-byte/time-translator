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
- *(Add new open questions here as they arise; move them to Key Decisions once resolved.)*

## 10. Migrations

Any DB migration must be **explicitly flagged to Jasmine** with the full SQL script to run manually in Supabase. Never assume a migration has been run. (Also stated in `CLAUDE.md`.)
