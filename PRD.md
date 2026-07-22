# PRD — Time Translator

> Turn the time you already track in your calendar into structured, reviewable business outputs — Jira timesheets today, invoice-ready CSVs next.

**Status:** Live in production (`https://www.timetranslator.com.au`), pre-launch / beta-hardening
**Owner:** Jasmine Glasgow (sole trader — GLASGOW, JASMINE LEIGH, ABN 67 730 170 835)
**Last updated:** 2026-07-22
**Note:** This is a *retrospective* PRD reconstructed from the shipped codebase and the launch handovers in `HISTORY/`. It documents what the product is and where it is going, not a from-scratch spec.

---

## 1. Product Overview

Time Translator is a mobile-friendly web SaaS that ingests a user's calendar, uses rules and AI to interpret each event, and produces structured outputs the user can review and act on.

The founding insight:

> People already record what they worked on in their calendar. Time Translator turns that messy, human calendar data into structured, reviewable, useful business output — without forcing users to reconstruct their week by hand.

The differentiator is **not** automation for its own sake — it is the **AI-assisted translation layer** that turns rough, ambiguous calendar entries into trustworthy, explainable suggestions, always subject to user review before anything is logged or exported.

**Architecture in one line:** one imported/reviewed time layer → multiple destination output lanes.

- **Input:** calendar data (currently `.ics` upload; Google Calendar OAuth is a near-term lane)
- **Intelligence layer:** ignore/duplicate detection, deterministic mapping rules, learned user memory, AI-assisted matching with confidence + reasons
- **Outputs:** Jira worklogs (live), invoice-ready CSV for Xero (next), further export/reporting formats (later)

## 2. Positioning

Time Translator is **not** "just another timesheet tool." It is an AI-assisted translation layer built on top of existing calendar behaviour, designed to create multiple outputs from one time source.

- **Calendar-first, not Jira-first.** Calendar behaviour is the source of truth; Jira is one output lane, not the product's identity.
- **Standalone SaaS, not an Atlassian Marketplace app.**
- **Review before action.** The user always approves time before it is logged or exported.
- **Rules and exact matches before AI.** Deterministic behaviour builds trust; AI is used only for genuine ambiguity.

## 3. Non-Goals (Explicit)

- No full in-app invoicing platform for MVP — invoice output is **CSV export** (Xero schema first), imported into the user's accounting system.
- No direct Xero/MYOB API integration for MVP.
- No team/multi-user or org-shared memory for MVP — all learned memory is strictly user-scoped.
- No storage of the raw `.ics` file — it is parsed server-side in memory and discarded.
- No in-app ads or "go premium" upsell sprawl.

## 4. Target User

Independent professionals and small consultancies who bill or report time against Jira tickets and already keep their working day in a calendar — and who currently reconstruct timesheets manually at week's end.

## 5. Core User Workflow

1. User signs in (Google, or email/password, magic-link fallback).
2. User connects Jira in Settings (base URL, account email, API token).
3. User uploads a Google Calendar `.ics` file on the Upload page.
4. User selects a date range and import rules (ignore rules, exclude weekends).
5. The app parses events, then in order:
   - applies ignore rules
   - detects duplicates (auto-skip later copies)
   - fetches candidate Jira tickets
   - applies exact-key / deterministic mapping
   - applies learned user memory
   - uses AI for genuinely ambiguous rows, with confidence + reason
6. User reviews every imported item on the **Time Sheets** (review) page — sort, filter, toggle log/skip, edit Jira key, see confidence.
7. User proceeds to a grouped-by-day confirmation summary with daily totals.
8. User logs approved entries to Jira; sees per-entry results and a post-log chart.
9. User can export CSVs and view insights.

**Product principle preserved throughout:** no rows are silently dropped, and nothing is logged without explicit review.

## 6. Functional Requirements

### 6.1 Authentication (implemented)
- Supabase Auth; Google sign-in (preferred), email/password (default), magic link (fallback).
- Forgot-password + `/reset-password` (handles PKCE `?code=` and hash `PASSWORD_RECOVERY`).
- Middleware-protected authenticated pages; auth callback route.
- Inactivity warning ~25 min; auto sign-out ~30 min.

### 6.2 Calendar Upload & Import (implemented)
- `.ics` upload, 2 MB file limit, max 200 events per import.
- Date range selection, calendar-name validation, timezone handling, weekend exclusion.
- Ignore/skip rules (create/edit/delete); mapping rules managed on the Time Sheets page.
- Raw `.ics` never intentionally stored.

### 6.3 Jira Integration (implemented)
- Configure base URL, account email, API token; test connection.
- Ticket fetch (limit 2,000), issue lookup, worklog posting, latest-worklog lookup.
- API tokens **encrypted at rest** (`JIRA_TOKEN_ENCRYPTION_KEY`); never returned to the browser.
- *Currently required* for the import flow — a CSV-only-without-Jira path is backlogged.

### 6.4 Matching Intelligence (implemented, evolving)
Desired order — each tier beats the next:
1. Exact Jira key in title / deterministic mapping rule
2. Learned user memory (recurring title → confirmed target)
3. AI suggestion (Anthropic) for ambiguous rows
4. Needs-review / no-match

- Duplicate detection with conservative fingerprint (title + start + end + duration); first copy active, later copies auto-skipped.
- Confidence labels: `HIGH` / `MEDIUM` / `LOW`, each with a human-readable match **reason**.
- Issue-type inclusion settings (e.g. include tasks/stories, exclude epics).
- **Product truth:** AI need not be perfect, but it must never feel random — every suggestion is explainable and reviewable.

### 6.5 Review → Confirm → Log (implemented)
- Review table: sortable/filterable, log/skip toggle, editable Jira key with on-blur lookup, confidence display, CSV export. Defaults to showing **all** imported items (no silent date pre-filter).
- Confirmation: grouped by day, daily totals, log-all, per-entry status, post-log donut chart, CSV export.

### 6.6 Insights (implemented)
- Time-by-Jira-ticket visualisation (Recharts).

### 6.7 Settings (implemented)
- Jira credentials + test, timezone, calendar name, default project key, issue-type inclusion, usage/entitlement display.

### 6.8 Legal / Trust / Help (implemented)
- Privacy Policy, Terms, Help/FAQ. Business entity + ABN + contact disclosed.

### 6.9 Admin & Observability (implemented)
- Admin-only `/admin/system-events` (auth/import/Jira/AI/usage events, failures) and `/admin/billing`.
- Sentry, structured app-event logging, `import_runs` + `import_event_traces` (90-day trace retention).

### 6.10 Usage Limits & Billing groundwork (partially implemented)
- Free trial: 200 AI matches/month. Paid single user: 5,000/month. AI ≤200/min/user. Unauth ≤60/min/IP.
- Atomic usage via Supabase RPC (`consume_ai_usage`, `refund_ai_usage`).
- `profiles` carries trial/subscription/Stripe lifecycle fields + entitlement logic. **Stripe checkout/portal/webhooks not yet complete.**

## 7. Non-Functional Requirements

- **Data isolation is non-negotiable.** Supabase RLS enforced; a user can only read/write their own rows across `jira_credentials`, `profiles`, `usage`, `import_runs`, `import_event_traces`. Proven via two-browser isolation test.
- **Secrets stay server-side.** Jira tokens encrypted; no debug route exposes environment state.
- **Output correctness must be "boringly correct."** Jira payloads, durations, and timezones accurate; CSV headers/rows stable; no accidental duplicate logging.
- **Usage caps enforced server-side**, without locking out normal users.

## 8. Tech Stack

- **Frontend:** Next.js 15 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API routes, Supabase (Auth + Postgres + RLS)
- **AI:** Anthropic SDK (matching)
- **Libraries:** `node-ical` (ICS), `luxon` (time/tz), `recharts` (charts), `@upstash/ratelimit` + Redis, `stripe`
- **Ops:** Vercel hosting + Analytics, Sentry monitoring
- **Deploy:** push to `github.com/jlglasgow123-byte/time-translator` → Vercel → `timetranslator.com.au`

## 9. Roadmap

### P0 — Launch blockers
- Confirm end-to-end import reliability and a real (non-generic) error surface on failure.
- Prove RLS isolation (two-browser test) across all user-owned tables.
- Confirm production migrations applied; `npm run security:check` + `npm run build` clean.
- Verify Supabase Auth redirect allow-list (incl. `/reset-password`) and production env vars.
- Hammer-test matching (duplicates, ignore/mapping rules, overrides persist, no dropped rows) and output correctness (Jira + CSV).
- MFA on all operator accounts; spend/usage alerts on Vercel/Supabase/Anthropic/Sentry.

### P1 — Before wider launch
- Complete Stripe (checkout, portal, webhooks, subscription-state handling) + user-facing billing.
- Match-correction memory (learned mappings) surfaced and controllable ("always use this" / "forget this").
- Durable (Redis/WAF) rate limiting; user-facing "why matched/skipped" trace view.
- Support/data processes (delete/export user data, billing & Jira-auth issues).

### P2 — Post-launch / growth
- CSV-only workflow without Jira.
- Direct Google Calendar OAuth integration.
- **Xero-first invoice CSV export** (one row per line item; fields: `ContactName`, `InvoiceNumber`, `Reference`, `InvoiceDate`, `DueDate`, `Description`, `Quantity`, `UnitAmount`, `Discount`, `AccountCode`, `TaxType`, `Status`, `Type`), then MYOB.
- Expanded insights/reporting; richer admin dashboards; team/multi-user plans if traction supports it.

## 10. Success Criteria

- A user imports a week of calendar events and logs correct Jira worklogs in minutes, not by hand.
- Every suggestion carries a trustworthy confidence label and an explainable reason.
- No user can ever access another user's data.
- Jira and CSV outputs are correct across timezone/date edge cases, with no duplicate logging.
- The learned-memory loop measurably reduces AI calls and correction rate over time for repeat users.

## 11. Key Product Principles (do not undo without explicit decision)

1. Review before action.
2. Calendar-first — source data is human and messy.
3. Rules and memory before AI.
4. AI as explainable translation, not magic guesswork.
5. Output modularity — timesheets and invoices stay separable lanes.
6. No invoicing-platform sprawl in MVP — CSV export first.
7. User data isolation is non-negotiable.
