# Time Translator — Project Log

A running record of what has been built, fixed, and shipped. Most recent first.

---

## 2026-07-22

- **Repo made public** — Rewrote the README with a real project description, setup instructions, tech stack, and environment variable reference; added a `.env.example`, a `LICENSE` (all rights reserved — viewable but not open source), and a `SECURITY.md` with a responsible-disclosure contact. Also removed internal planning and security-sprint notes (`HISTORY/`, `CONTEXT/`, `FUTURE/`) from git entirely, including from past commit history, so they're no longer publicly visible.
- **Fixed high-severity dependency vulnerability** — Pinned the `sharp` image library (a transitive dependency of Next.js) to a patched version, closing out several inherited `libvips` CVEs flagged by GitHub Dependabot.
- **Blocked a broken automated dependency update** — Closed a Dependabot PR that bumped TypeScript to a major version incompatible with the app's build (it broke `next.config.ts` loading), and added a rule so future TypeScript major-version bumps are no longer auto-proposed.
- **Moved the admin notification address out of source** — The internal email that receives contact-form messages, error alerts, the weekly security report, and promo/referral notifications is now read from an `ADMIN_NOTIFY_EMAIL` environment variable (falling back to `contact@timetranslator.com.au`) instead of being hardcoded, so no personal address is baked into the now-public codebase.
- **Rebuilt the repository from a clean history** — Recreated the public repo from a single fresh commit so that internal planning notes and a previously-hardcoded email are gone from all commit history and from stale pull-request refs (which a normal history rewrite can't remove). Switched code scanning to GitHub's managed CodeQL "default setup" and removed the now-redundant custom CodeQL workflow that was failing.

---

## 2026-07-15

- **Google Calendar is now the primary import path** — The upload page now detects a connected Google Calendar and shows a direct "Import Events" panel with From/To date pickers (90-day cap) instead of the .ics drop-zone; without a connection, a "Connect your Google Calendar" card appears above the usual .ics upload as the recommended option.
- **Upload page polish** — The Google Calendar import card's ".ics instead" note moved below the date pickers with clearer wording, and "Create an Ignore Rule" is now a collapsed expander (with an "Add Rule" button inside) so its Create button can't be mistaken for the main Import button.
- **One calendar mechanism at a time** — Google Calendar sync and .ics upload are now mutually exclusive per account: connecting Google Calendar replaces any linked .ics calendar (with a confirmation warning beforehand), .ics uploads are blocked server-side while connected, and disconnecting Google Calendar re-enables .ics upload. This also closes the gap where Google Calendar sync bypassed the Pro one-calendar limit.
- **Google Search Console site verification** — Added a Google site-verification tag so domain ownership of timetranslator.com.au can be confirmed, a required step for Google's OAuth verification review of the Calendar integration.
- **Per-stage import timing breakdown** — Each Google Calendar import now records how long it spent in each stage (auth, credentials, fetching calendar events, entitlement check, fetching Jira tickets, matching) in addition to the total duration already tracked, so slow imports can be diagnosed by stage instead of guessing from the total time alone.
- **Privacy Policy now discloses Google Calendar data handling explicitly** — Added a dedicated "Google user data" section stating exactly what read-only calendar data the app accesses and why, the required Google API Services Limited Use commitments (no ads, no selling, restricted sharing, no human reading), how AI processing of that data works (no model training), and that disconnecting revokes and deletes access. Also names the read-only scope in the data-collection section and covers Google-data deletion on disconnect. Needed for Google's OAuth verification review of the calendar.readonly scope.

---

## 2026-07-14

- **Choose your own date range for Google Calendar sync** — The "Sync now" button previously always pulled the current month only. You can now pick From/To dates (From going back up to 2 years), capped at 90 days per sync with a clear inline warning instead of silently trimming the range. The manual upload page's date range cap was also changed from 6 months to 90 days so both import paths behave consistently.
- **Learned mappings now survive browser resets** — Event-to-Jira-ticket mappings the app learns from your approved time logs used to live only in browser storage, so clearing site data or switching devices lost them. They're now saved to your account in Supabase, backed up automatically, and still feed into matching the same way as before.
- **Jira ticket list caching for faster repeat imports** — Open Jira tickets are now cached for 2 minutes per account, so importing more than once in the same session skips a redundant Jira fetch. (Root cause of the reported 10+ second matching delay wasn't confirmed with live timing data in this pass — flagged for follow-up.)
- **Daily error alert email** — Production errors are now automatically emailed as a daily digest instead of requiring a manual check of the admin events page. Each import run also now records its duration and a breakdown of how events were matched (rule-based vs. AI confidence levels vs. unmatched), viewable later for troubleshooting slow or low-quality imports.
- **Google Calendar events can now be pulled directly** — Previously only the OAuth connection existed; there was no way to actually fetch events. Added a "Sync now" button in Settings that pulls the current month's events straight from Google Calendar and runs them through the same matching flow as a manual calendar file upload. Disconnecting now also revokes the connection on Google's side, not just locally.
- **Invoices page now works** — `/invoices` was a placeholder with no real functionality. It now shows your actual reviewed time and supports the same CSV export as the existing export page, and is reachable from the main navigation.
- **Clearer, more consistent error messages** — Various error messages across import, Jira, and Google Calendar were previously showing raw technical error text in a few places (e.g. account settings, time logging). These now show plain-English messages consistently.
- **Insights: new chart showing ticket time breakdown over time** — Added a stacked chart showing how time logged shifts between your top Jira tickets week to week (or day/month, using the existing view toggle).
- **Settings: clearer usage and trial warnings** — The AI usage bar now turns amber as you approach your monthly limit and red once you hit it. Added a proactive banner when your free trial has 7 days or less remaining, so it's no longer a surprise when it ends.
- **Manual test scripts for the day's new workflows** — Added step-by-step human test scripts covering learned mappings durability, Google Calendar sync, the Invoices page, error alert emails, and import run analytics, for click-through verification of this batch of changes.
- **Clearer Google sign-in disclaimer** — The small print under "Continue with Google" now says Time Translator doesn't access your Google Calendar unless you separately connect it, instead of the vaguer "never touches your calendar" wording. Updated consistently in both the sign-in and sign-up forms.
- **Clearer Google Calendar permission errors** — When Google refuses a calendar read, the app now distinguishes a genuinely expired connection (asks you to reconnect) from a permissions/setup problem (tells you calendar access wasn't granted or the app is awaiting verification), instead of always saying "connection has expired." Google's actual error is now logged server-side for faster diagnosis, and sign-in now also requests your email address so the connected Google account is recorded.
- **Fix: remove black loading screen during page transitions** — Pages showed a black background flash while loading on devices in dark mode, because globals.css had a `prefers-color-scheme: dark` override that conflicted with the rest of the light-only app. Removed the dark-mode CSS so the background is always light and consistent.

---

## 2026-07-13

- **Visible warning when AI matching is unavailable** — If the Anthropic AI matching service fails during import (e.g. API credits run out or the API key stops working), the app previously fell back to rule-based matching silently, leaving users unsure why matches looked off. Now shows a clear banner on the review page explaining that AI matching was unavailable and rule-based matches are being shown instead, with a distinct message for configuration problems on Jasmine's end versus temporary outages.
- **Repo cleanup** — Moved stray root-level docs (PRD, Google Calendar OAuth notes, marketing/security write-ups) into new `CONTEXT/`, `FUTURE/`, and `HISTORY/` folders to keep the repo root tidy; no functional changes. Also stopped tracking local dev server log files (`Logs/dev-3001.*.log`) that had accidentally been committed.
- **Fix: JSD support widget not appearing on the site** — The Jira Service Management help widget was embedded correctly but never actually rendered: Atlassian's widget script only initializes on the page's `DOMContentLoaded` event, and the old code loaded the script too late for that event to still be pending, so its setup silently never ran. Now loads via Next's script loader and re-fires that event once the script is ready, so the floating help button appears and visitors can submit a support request that lands in Jira as a ticket.

---

## 2026-07-12

- **Google Calendar connect messaging clarified** — Reworded the Settings copy for connecting Google Calendar to more clearly explain what access is granted ("see your calendar events and their details") and reinforced the read-only guarantee. Also added a Help FAQ entry explaining the connect option as an alternative to manual .ics upload, and updated the quick-start guide to mention both options.
- **Weekly automated security report** — A new GitHub Actions job runs every Sunday, running `npm audit` and the existing custom security check, then reports the results to a new endpoint in the app which also checks the live site's response headers and key config (Stripe webhook secret, cron secret), and emails a combined pass/fail summary to Jasmine via Resend.
- **Fix: CodeQL scan wasn't running on pushes** — The CodeQL workflow was configured to trigger on pushes/PRs to a `main` branch that doesn't exist (the repo's default branch is `master`), so it was silently only ever running on its weekly schedule. Fixed to trigger on `master`.
- **Help page: referral FAQ rewritten** — The existing referral FAQ entry (linkable via `/help#referral-program`) now actively encourages users to refer friends, with clearer step-by-step instructions on how the referral mechanic actually works.
- **Sign-up form: clearer calendar permissions and referral link** — Added a note under "Sign up" clarifying that creating an account does not grant calendar access (that's a separate, later step), and a link under "Referred by" to the new referral FAQ so users understand the reward before entering a referrer's email. Also replaced the developer's own name used as placeholder text in the name fields with generic examples.
- **Fix: duplicate calendar permission notice on sign-up** — The sign-up modal was showing two near-identical disclaimers about calendar access (one under the heading, one under "Continue with Google"). Removed the redundant one under the heading.
- **Landing page copy fixes** — Reworded the "How it works" section: step 1 (now "Import") makes clear users can import data themselves or connect Google Calendar for automatic fetching; step 2 ("Review") drops the billable/client framing and just says entries are matched to your chosen export and go out with your approval; step 3 ("Export") now ends with "Your time is translated" instead of "Your billing is done." Also made the pricing section honest about the trial limit — removed the vague "Upgrade when you need more" line and labeled the free tier "Free Trial (30 days)" so the 30-day cutoff isn't hidden.
- **Landing page: honest sign-up flow copy** — Fixed CTA buttons that implied connecting Google Calendar was the mandatory first step, when it's actually optional and account creation comes first. The hero, output preview, and final call-to-action buttons now read "Create an account" instead of "Connect my calendar," while the surrounding descriptive copy still highlights calendar connection as a benefit.
- **Landing page: more honest and consultant-neutral copy** — Softened the "every consultant" framing to "we all know this feeling," reworded the calendar-vs-manual-entry section to focus on not having to copy data into other systems by hand (rather than a billing-time framing that didn't match the Jira-first MVP), and removed "billable"/"to clients" language and renamed "timesheets" to "exports" in the features grid to keep the messaging aligned with actual product scope.
- **Landing page: fixed dead contact link** — "Tell us what you need" used a `mailto:` link that silently did nothing without a configured mail client. Added a proper `/contact` page with a form that emails submissions via Resend.
- **Landing page: equal-height comparison cards** — Fixed the Google Calendar vs. Time Translator comparison cards rendering at different heights, and updated their example content to real Jira ticket formatting (PMT-102, PPJ-277, WEB-759).
- **Security headers added** — The site now sends Content-Security-Policy (report-only, to catch issues before enforcing), Referrer-Policy, X-Content-Type-Options, and X-Frame-Options headers on every response, closing gaps flagged by a security scan.
- **Design polish: fonts and button shape** — Fixed a leftover CSS rule that was silently forcing Arial everywhere instead of the intended Plus Jakarta Sans font. Buttons now use a subtler rounded-corner style instead of full pill shapes, matching the more varied look already used across cards and panels.
- **Repo housekeeping** — Committed AGENTS.md and PRD.md to the repo, and added stray local files (review notes, downloaded binaries, one-off HTML exports) to `.gitignore` so they stop showing up as untracked.
- **Google Calendar connection (foundation)** — Added a separate "Connect Google Calendar" flow, distinct from Google sign-in, that requests read-only calendar access only when a user explicitly opts in. New post-signup "Connect your sources" screen offers Google Calendar, Jira, or manual .ics upload — all optional and skippable. Google Calendar and Jira can now be connected or disconnected from Settings at any time, and disconnecting either clearly explains that it stops future syncing but does not delete previously created time entries. This lays the groundwork for the upcoming Google Calendar import feature; actual event fetching comes in a follow-up.

## 2026-06-06

- **Landing page: Free Trial shows unlimited calendars** — Added "Unlimited linked calendars" to the Free Trial pricing card so users can see this benefit before signing up.

## 2026-06-04

- **Fix: logo always goes to login/home page** — Clicking the logo now takes you to `/login` regardless of auth state, instead of redirecting logged-in users to `/upload`.
- **Trial users: unlimited calendar linking** — Free trial users can now link and remove multiple calendars (same as Max Power), encouraging upgrade to Max Power at trial end rather than capping at one.
- **Backlog housekeeping** — Marked done: Google OAuth regression test, Vercel env vars audit, trial calendar decision, CSV-only workflow. Moved transactional email to future (not needed for ~2 years). Added enterprise pivot vision to backlog.

- **Fix: "Manage subscription" button no longer silently does nothing** — The button now shows an error message if the billing portal can't be opened, and is hidden entirely for accounts on Max Power via admin grant (no Stripe subscription to manage).

- **Atlassian reporting: store Cycle-Period header** — Atlassian's response includes a `Cycle-Period` header indicating the required reporting cadence (default 7 days). This is now stored as `cycle_period_days` in `atlassian_reporting_log` for all response types (ok, closed, updated, refresh_failed), providing evidence if Atlassian ever changes the cadence requirement.
- **Session expiry redirect on all protected pages** — When a user's session expires mid-visit, all logged-in pages (upload, review, export-review, history, insights, settings) now immediately redirect to `/login` instead of leaving the user stuck on a broken page. The nav flicker (showing "Sign in" briefly after load) is also fixed by reading the session from the local cookie before making a network call to Supabase.

- **Remove debug logging from Atlassian reporting job** — payload log removed now that the reporting API is confirmed working end-to-end.

- **Fix: `atlassian_account_id` not being populated on Jira connect** — the user OAuth flow was missing the `read:me` scope (not `read:account`, which is for app-level reporting only). Atlassian returned 403 on `/me`. Fixed scope in the OAuth start route; enabled `read:me` in the Atlassian developer console. Users who connected Jira before this fix should disconnect and reconnect in Settings.

- **Infrastructure: Supabase custom domain** — Supabase is now accessible via `app.timetranslator.com.au`. Google OAuth consent screen now correctly shows `app.timetranslator.com.au` as the authorised domain instead of the raw Supabase URL.

- **Fix: Atlassian reporting API 400 error** — Supabase returns timestamps with a space separator (`2026-06-03 11:54:57+00`) rather than strict ISO 8601 (`2026-06-03T11:54:57.000Z`). Atlassian's schema validation rejected this. Fixed by normalising all `updatedAt` values through `new Date().toISOString()` before sending.

- **Atlassian Personal Data Reporting API — Phase 2 (complete implementation)** — the app now satisfies the Atlassian Sharing requirement to report personal data holdings weekly. Full details below.

  **What was built:**
  - `atlassian_reporting_log` table — compliance audit log tracking every Atlassian account ID reported, when it was last reported, and Atlassian's response (`ok`, `closed`, `updated`, `refresh_failed`).
  - `src/lib/atlassian-reporting.ts` — core reporting logic: reads all `atlassian_account_id` values from `jira_credentials`, POSTs them to `https://api.atlassian.com/app/report-accounts/` in batches of 90, and handles all response types. `closed` → deletes user data. `updated` → re-fetches Atlassian profile. All results written to the audit log.
  - `src/lib/supabase/get-app-atlassian-token.ts` — loads and auto-refreshes the app-owner bearer token from `app_atlassian_credentials` (stored in Phase 1).
  - `POST /api/admin/atlassian-report` — HTTP endpoint called by the weekly cron job. Authenticated by `CRON_SECRET` header; no user session required.
  - `src/lib/admin/delete-user.ts` — shared `deleteUserById(userId)` helper extracted from both deletion routes so the reporting job can trigger user deletion without a session. Both existing delete routes now call this helper.
  - Vercel cron job (`vercel.json`) — fires `POST /api/admin/atlassian-report` every Monday at 04:00 UTC.
  - Admin page status bar — `/admin` now shows "Last Atlassian report ran: X days ago". Turns red if the job hasn't run in 8+ days.
  - Export route fixes — `linked_calendars` field names corrected (`calendar_id`, `linked_at` → `id`, `created_at`); `atlassian_account_id` added to the Jira connection section of user data exports.

  **Architectural decision — Vercel cron over Supabase pg_cron:**
  The reporting logic lives in Next.js (not Postgres), so the cron job needs to call the Vercel API over HTTP. Supabase pg_cron can do this via pg_net, but Supabase restricts `ALTER DATABASE` and `ALTER ROLE` for custom GUC parameters on all plans — making it impossible to pass `CRON_SECRET` to pg_net without hardcoding it in a migration file. Vercel cron handles secrets cleanly via env vars and supports weekly schedules (`0 4 * * 1`) without any plan restriction.

  **Known risks (documented for future maintainers):**
  1. The cron schedule lives in `vercel.json`, not in `supabase/migrations/` like the other cleanup jobs. If you're looking for what runs automatically, check `vercel.json` first.
  2. Vercel cron fires-and-forgets. Silent failures are visible via the `/admin` status bar (gap in last-run date) and the `atlassian_reporting_log` table.
  3. `CRON_SECRET` must be set as a Vercel environment variable. The reporting route rejects any request without the correct `Authorization: Bearer <secret>` header.
  4. The cron job does not run locally. Trigger it manually via `curl -X POST https://www.timetranslator.com.au/api/admin/atlassian-report -H "Authorization: Bearer <CRON_SECRET>"` or add a trigger button to `/admin` if needed.

  **Backlog — migrate to Supabase pg_cron when viable:**
  If Supabase ever lifts the GUC restriction, or if a different secret-passing mechanism becomes available (e.g. Vault-backed pg_net), migrate this job out of `vercel.json` and into a migration file alongside the other cleanup jobs. This removes the cross-platform dependency and makes the schedule discoverable in one place. Trigger: revisit when Supabase adds native support for custom GUC settings on the Pro plan.

- **Supabase upgraded to Pro** — upgraded from Free to Pro to support the Atlassian reporting compliance work. Vercel remains on Hobby; all budget allocated to Supabase.

---

## 2026-06-03

- **Fix: "Last Jira worklog" silently returning no results after OAuth migration** — pre-OAuth credential rows with a null `access_token` were causing a TypeError instead of a "please reconnect" prompt; users now see the correct Settings link and can reconnect via OAuth.

- **Atlassian Personal Data Reporting API — Phase 1** — added `app_atlassian_credentials` table and admin-only OAuth routes (`/api/admin/atlassian-app-auth`) so the app can obtain and store the app-owner bearer token required to call Atlassian's reporting API. One-time setup flow: visit the route while logged in as platform admin to complete consent.
- **Jira Service Desk widget** — fixed widget not appearing; switched from Next.js Script component to a client component that appends the script tag directly to the DOM, preserving all required Atlassian data attributes.

- **Helper text legibility** — all `text-gray-400` helper/explainer text across the app is now `#66727B` (slightly darker) with line-height 1.45 for easier reading.
- **Settings: delete account button** — solid red with circled ! icon so the action looks unmistakably destructive.
- **Settings: sign-out buttons** — both buttons now use the dark brand colour (#26333A) with white text instead of plain white.
- **Settings: sign-out button** — sign-out is now a proper button in the header and also appears as a card at the bottom of the settings page so it's impossible to miss.
- **Settings: delete account button** — changed to amber/yellow with a warning triangle so the destructive action is visually distinct.
- **Settings: calendar Remove button** — now an amber/yellow button with a warning triangle instead of plain grey text.
- **Settings: "detect" → "connect"** — updated wording throughout the linked calendars section for clarity.
- **Push workflow** — documented the build → changelog → commit → push process in CLAUDE.md so it is enforced every session.
- **Security: RLS on jira_credentials** — added database-level Row Level Security policy so Supabase enforces user-scoped access to Jira credentials at the DB layer, not just in application code.
- **Fix: governing law corrected to NSW** — Terms of Service section 13 now correctly names New South Wales instead of Queensland.
- **User data export** — users can now download a full copy of their account data (profile, plan, Jira connection, linked calendars, worklog history, import history) as JSON from the Settings page, satisfying Australian Privacy Act access requests. Tokens are excluded.
- **Fix: cancel Stripe subscription on account deletion** — both user-initiated and admin-initiated account deletion now cancel any active Stripe subscriptions before removing the account, so deleted users are never left being billed.
- **Remove "Back to login" button from legal pages** — removed unsolicited button from Privacy and Terms pages.

- **Fix: Jira revoked access handling** — stale "API token" error messages updated to prompt reconnection via OAuth; stale credentials row is now deleted automatically when a token refresh fails, so users see the Connect button instead of a broken state.

- **Security: enforce encrypted Jira token storage** — `decryptJiraToken` now throws instead of silently returning plaintext if a token is not encrypted, ensuring any unencrypted token in the DB is caught immediately rather than used without error.
- **Privacy policy — Jira write scope clarification** — added plain-English statement that Time Translator writes worklogs to Jira and never deletes them; bumped effective date to 2 June 2026 on both privacy policy and terms.

- **Security: patch postcss XSS vulnerability** — forced postcss to 8.5.15 via package.json overrides to resolve Dependabot moderate vulnerability (GHSA-qx2v-qp2m-jg93); 0 vulnerabilities now reported.
- **Privacy policy — Atlassian approval updates** — added explicit Customer Data / data controller section, named Anthropic and OpenAI as AI providers with no-training confirmation, replaced vague "reasonably necessary" retention with specific retention periods per data type, added 2-year inactivity auto-deletion clause, disclosed Jira submission history log, removed ambiguous "AI usage counts" language, and added Data Processing Agreement contact option.
- **Terms of service — Atlassian approval updates** — added 48-hour support response commitment, expanded acceptable use to cover automated scraping and abusive API requests, and added new Customer Data and Third-Party Integrations section covering what data Time Translator stores and why.

- **Self-service account deletion** — users can now permanently delete their account from the Settings page. Modal warns users to download their history first (with a link), lists exactly what will be deleted, and makes clear deletion is final with no rollback. Requires typing "delete my account" to confirm. Admins can also delete any user account from the admin panel.
- **GDPR erasure audit log** — every account deletion (user-initiated or admin-initiated) now writes an immutable record to `account_deletion_log` before data is removed. Stores the user ID and a one-way SHA-256 hash of the email — no personal data, but sufficient to prove a right-to-erasure request was fulfilled if a regulator or backup restore ever requires it.
- **Data retention policy** — import event traces and app system logs are now retained for 2 years (up from 90 days for traces; previously indefinite for system events). Both are auto-purged by scheduled Supabase cron jobs.

- **Durable rate limiting** — replaced in-memory rate limit counters (which reset on every Vercel cold start) with Upstash Redis-backed sliding windows via `@upstash/ratelimit`. Limits now hold across all serverless instances: 20 req/min per IP for unauthenticated traffic and 200 events/min per user for AI matching. Upgraded from fixed-window to sliding-window algorithm for smoother enforcement.

## 2026-06-01

- **Jira OAuth login** — replaced API token auth with Atlassian OAuth 2.0 (3LO). Users now click "Connect to Jira" in Settings and log in via Atlassian instead of generating and pasting an API key. Access tokens refresh automatically; refresh tokens are encrypted at rest. Settings page Jira section replaced with connect/disconnect UI showing connected account email.
- **History page redesign** — colour-coded Jira key badges, dark navy group headers, alternating row shading, human-readable dates, tabular-nums alignment
- Added **filters and grouping to history page** — search across event/key/task, project filter, date range, group by logged date / event date / Jira key
- Fixed **history page background** — was rendering black due to dark-mode CSS; now matches rest of site (`bg-gray-50`)
- Fixed **middleware service client** causing Edge runtime crash

---

## 2026-05-31

- **Major import performance** — parallelised AI batches, Jira pagination, and DB calls; import time cut from ~60s to ~8–15s
- Added **admin user delete and suspend controls**
- Added **referral status API** and `ReferralField` component
- Fixed double DB round-trip for Jira credentials in process route

---

## 2026-05-30

- Added **animated blob spinner** during import processing
- Changed "Processing…" label to "Matching…" for clarity
- Added **inline Jira search** to the Jira Key input field — searches as you type, only when input is focused
- Improved Jira search: prioritises default project, returns more results
- Fixed ORDER BY — reverted to `updated DESC` (`lastViewed` not supported in bulk search API)
- Added **DUPLICATE status badge** distinct from IGNORED
- Fixed "Needs review" count and made it a clickable filter
- Matched "Needs review" colour to MEDIUM badge (amber-700)
- SVG chevron sort icons; white date text in day heading
- Fixed learned mapping confidence display; added MATCHED tooltip
- Enforced **6-month max date range** on import
- Simplified nav — Import only, removed Outputs/Insights/Invoices links
- Moved spinner into active button; fixed brand colour

---

## 2026-05-29

- Added **Upgrade button to the nav** for all signed-in users — opens the pricing modal with Pro and Max Power options. Visible on every page so users can upgrade at any time.
- Added **Jira log history page** (`/history`) — lists every entry logged to Jira from Time Translator, grouped by session date, with CSV export

---

## 2026-05-28

- Fixed **pricing CTA hang** for logged-out users — clicking Get Pro/Max Power on the landing page now opens the signup modal immediately instead of hanging on "Redirecting…"
- Replaced all raw **Jira API error messages** with plain English — users now see "Your Jira connection has expired. Please update your API token in Settings." instead of `Jira API error 401 on /rest/api/3/myself`
- Switched **auth modal logo** to transparent background version
- Added **annual pricing** (A$50/yr Pro, A$150/yr Max Power) with monthly/annual toggle on the landing page pricing section and the in-app upgrade modal
- Fixed **Supabase Site URL** missing `www` — was causing Google OAuth to bounce users back to `/login` instead of `/upload`

---

## 2026-05-27

- Fixed **Google OAuth login loop** — session cookies now correctly written to the NextResponse so users land on `/upload` after signing in with Google

---

## 2026-05-25

- Added **platform admin and developer roles** with human-readable activity log in `/admin/system-events`
- Fixed admin page import and stale `isAdmin` property bugs
- **Removed Sentry entirely** — was causing dev server crashes (`self is not defined` in middleware) and added 197 packages for minimal benefit at pre-launch scale. All observability now via `app_system_events` in Supabase, visible at `/admin/system-events`. Sentry replacement added to backlog.
- Added **pricing section to the landing page** (Free Trial / Pro / Max Power cards with "Most popular" callout)
- Added **upgrade modal** in-app — `UpgradeButton` now opens a Pro vs Max Power comparison instead of going straight to Pro checkout
- Replaced SVG placeholder logos with real TT brand assets throughout the app
- Nav polish: bigger logo, tighter spacing, icon-only settings link

---

## 2026-05-23

- Fixed Sentry flooding issues feed with routine product events — now only error-severity events go to Sentry; info/warning events stay in Supabase only

---

## 2026-05-22

- Built **promo code system** — admin can create codes that grant free Pro access for a set period; milestone emails sent at 100/200/300 redemptions
- Built **referral system** — users can enter a referrer's email at signup; referrer gets 30 days free Pro when their referred user makes first payment
- Added **footer** to all public pages
- Redesigned **auth modal** with dark multi-step flow (email → password, separate sign in / sign up paths)
- Landing page image and layout improvements

---

## 2026-05-21

- Added **linked calendars** feature — users link a calendar by uploading a sample ICS; Pro users get 1 calendar locked on first link; Max Power users get unlimited
- Added **Max Power tier** (A$15/mo, 50,000 AI matches/month, unlimited calendars)
- Wired **Stripe customer portal** so users can manage subscriptions from Settings
- Import now validates the uploaded ICS against the user's linked calendar(s)
- Admin accounts get free Max Power entitlements
- Various import error message improvements and UI polish

---

## 2026-05-18

- Built **CSV/Xero export workflow** — users can now export calendar time as a Xero-compatible invoice CSV without needing a Jira connection
- Added `/export-review` page with editable Xero fields (ContactName, InvoiceNumber, DueDate, UnitAmount, etc.) and bulk-edit toolbar
- Contact name suggestions via Claude Haiku on the export review page
- Raised ICS file upload limit to 4 MB
- Jira connection errors now link directly to Settings

---

## 2026-05-17

- Added **Stripe billing** — Pro plan (A$5/mo), Stripe checkout, webhook, and upgrade prompts throughout the app
- Fixed Jira credentials error causing API routes to return HTML instead of JSON
- Removed today cap on end date — users can now select future dates

---

## 2026-05-16

- **Security sprint shipped** — hardened all API routes, encrypted Jira tokens at rest, removed unsafe `/api/env-check` endpoint, added app-level rate limiting, added inactivity logout (30 min)
- Added **email/password auth** with forgot password and reset flow
- Separated sign in and sign up modals
- Added admin pages: `/admin/system-events` and `/admin/billing`
- Added CodeQL, Dependabot, and weekly security check automation
- Added Sentry error monitoring

---

## 2026-05-12 — 2026-05-13

- Auth and upload workflow improvements
- Matching controls, duplicate detection safeguards
- Review page polish — defaults, summary assets, action toggle layout
- Jira suggestion improvements
- Legal pages (Privacy, Terms)
- Vercel Analytics installed

---

## 2026-05-08 — 2026-05-11

- **Initial app launched** — ICS parser, Jira matching, Supabase auth, usage tracking
- AI-assisted event matching with confidence labels and match reasons
- Review-first workflow before logging time to Jira
- Recharts insights page
- Vercel deployment to `timetranslator.com.au`
- Performance: consolidated upload flow to single API call, set Vercel region to `syd1`

---

## 2026-05-04

- Project created from Next.js starter
