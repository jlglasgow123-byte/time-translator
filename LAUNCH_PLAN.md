# Launch Plan — Time Translator

> **Target launch date: Saturday 30 August 2026.** Paid launch (Stripe billing live day one), balanced technical + marketing tracks.

**Owner:** Jasmine Glasgow
**Created:** 2026-07-24
**Status:** Active — this is the working source of truth for the run to launch.
**Related docs:** `PRD.md` (product), `Project_Model.md` (process/scope), `Logs/backlog.md` (task detail), `CHANGELOG.md` (dated history).

---

## 0. Where we actually are (honest baseline)

The engine is **built**. The risk before launch is not "we need to build features" — it is **"most features have never been verified end-to-end in production with real money and real emails."** This plan is therefore mostly a *verification-and-readiness* plan, not a build plan.

**Just unblocked (2026-07-24):** Google approved the `calendar.readonly` **sensitive scope**. Google Calendar OAuth was already built and shipped (backlog, DONE 2026-07-13) but gated to test-users-only pending this approval. It is now available to **all users** — the headline "connect your calendar, no file upload" flow is live pending one live end-to-end verification.

**The genuine launch blockers (all "built, not verified"):**

| Area | State | Risk if unverified at launch |
|---|---|---|
| Stripe billing (checkout/portal/webhooks) | Built, never tested E2E in prod | Users cannot pay / double-charged / stuck — **kills paid launch** |
| Billing entitlement enforcement | Built, never tested E2E | Trial/paid/blocked states wrong; revenue leak or lockout |
| `RESEND_API_KEY` not configured | **Broken in prod right now** | `/contact` form + all alert/digest emails silently fail |
| Import + matching flow | Not regression-tested since OAuth/parallelisation changes | Core product path could drop rows or mis-match |
| Google Calendar live E2E | Now un-gated; never click-through tested live | Headline feature fails on first real user |
| Xero CSV into real Xero | Never run through Xero's actual import | Export rejected by accounting software |
| Password reset E2E | Never tested E2E in prod | Locked-out users can't recover |
| Jira worklog history E2E | Never verified E2E | Core output trust |
| Mobile end-to-end | Never documented-tested | ~half of users on mobile |
| Vercel spend alerts | Deferred to ~20-paying-user trigger | Accepted risk — Hobby throttles, doesn't overspend |

Marketing baseline: landing page exists; `FUTURE/MARKETING/beta-tester-consent-plan.md` defines the `FREETIME` promo + consent flow; `HISTORY/Landing page repositioning brief.txt` exists **but is the Phase-2 enterprise reposition — NOT for this launch** (see §4).

---

## 1. Launch decisions (recorded)

- **2026-07-24 — Launch date set: 30 August 2026.** ~5 weeks out. Gives buffer to fix what verification breaks.
- **2026-07-24 — Paid launch, not free-only or beta-only.** Stripe checkout/portal/webhooks must be verified E2E before launch; users can subscribe day one. Highest-stakes item — scheduled early (Week 2) with buffer.
- **2026-07-24 — Plan emphasis: balanced 50/50 technical readiness vs marketing.**
- **2026-07-24 — Launch marketing uses Phase-1 (freelancer/solo) messaging.** The enterprise "operational visibility" reposition (`Landing page repositioning brief.txt`) is explicitly **post-launch** — mixing the two audiences at launch would muddy the message.

*(These are also to be mirrored into `Project_Model.md` §6 Key Decisions.)*

---

## 2. The two tracks

Every week runs a **Technical (T)** track and a **Marketing (M)** track in parallel, roughly balanced.

### Guiding sequencing logic (technical)
1. **Unblock what's silently broken first** — `RESEND_API_KEY` (emails dead in prod today).
2. **De-risk the money path early** — Stripe + entitlements in Week 2, so there's time to fix breakage.
3. **Verify the core product path** — import/matching, Google live, Jira history.
4. **Verify the edges** — mobile, password reset, Xero-into-Xero.
5. **Freeze, soak-test, launch.** No new features in the final week.

---

## 3. Week-by-week plan

> Weeks run Monday–Sunday. Launch is Sat 30 Aug (end of Week 5).

### Week 0 — This weekend (Thu 24 Jul – Sun 27 Jul) — "Stop the bleeding"
- **T:** Configure **`RESEND_API_KEY`** end-to-end: sign up at resend.com, verify `timetranslator.com.au` sending domain (DNS), generate key, add to Vercel (Production), redeploy. Then confirm `/contact` sends a real email AND `gh workflow run weekly-security-report.yml` lands in the inbox. *(This unblocks the contact form, security report, error digests, AND the beta consent emails below.)*
- **T:** Confirm the Google sensitive-scope approval is fully live: check the OAuth consent screen shows "In production / verified", and that a **non-test-user** Google account can complete the connect flow.
- **M:** Decide the launch messaging spine (Phase-1 freelancer framing). Draft the one-line value prop and the 3 core benefits for the landing hero.

### Week 1 — Mon 28 Jul – Sun 3 Aug — "Prove the core product path"
- **T:** **Import + matching E2E regression** (backlog steps): real `.ics`, ignore/mapping rules, duplicate detection, AI confidence labels, manual override persists review→confirm→log, no rows silently dropped, useful error on failure, CSV export headers correct.
- **T:** **Google Calendar live E2E** now that scope is approved: real consent click-through → "Sync now" pulls real events and matches; token-refresh-on-expiry (set `expires_at` to past, confirm silent refresh); disconnect actually revokes the grant in Google Account "Third-party access".
- **M:** Rewrite/tighten the **landing page** to the Phase-1 messaging. Ensure the "Connect your Google Calendar" flow is the hero CTA (now that it's un-gated). Add a short demo GIF/screens of connect → review → log.
- **M:** Set up analytics baseline (Vercel Analytics already on) — define the launch funnel we'll watch: signup → connect calendar/upload → first log → trial→paid.

### Week 2 — Mon 4 Aug – Sun 10 Aug — "De-risk the money path" (highest stakes)
- **T:** **Stripe billing E2E in production** (backlog steps): start trial → upgrade → checkout with a real card → `subscription_tier` updates → AI limit → 5,000 → customer portal loads → annual toggle hits correct price IDs → promo code grants Pro. Confirm the webhook points at `https://www.timetranslator.com.au/api/stripe/webhook`.
- **T:** **Entitlement enforcement E2E**: 30-day trial + 200 limit; expired trial blocks; paid → 5,000; `invoice.payment_failed` → `past_due`; cancellation blocks after period end.
- **T (build, small):** **Beta consent + `FREETIME` flow** per `beta-tester-consent-plan.md` (migration `202607120001_marketing_consent.sql` **[FLAG MIGRATION TO JASMINE]**, consent checkbox, settings toggle, one-click unsubscribe route). Needed before any marketing email goes out (Spam Act 2003).
- **M:** Build the **beta-tester outreach list** (Facebook group + direct contacts). Draft the `FREETIME` invite copy (free month of Pro, consent required).
- **M:** Draft launch-announcement assets: short post, email, and a "how it works in 60 seconds" clip.

### Week 3 — Mon 11 Aug – Sun 17 Aug — "Verify the edges + first real users"
- **T:** **Mobile E2E** on a real device: Google + email sign-in, upload, review, log to Jira, Xero CSV export, Settings (esp. Jira connect).
- **T:** **Password reset E2E** in prod (forgot → email → `/reset-password` → new password works; confirm `/reset-password` in Supabase redirect allow-list).
- **T:** **Jira worklog history E2E** (log → `/history` shows correct key/date/duration/title; filters; CSV).
- **T:** **Xero CSV into real Xero** — run a produced CSV through Xero's actual import; fix any column/tax-type discrepancies in `src/lib/csv-export.ts`.
- **M:** **Soft beta**: invite the first cohort with `FREETIME`. Watch the funnel, collect friction reports, fix onboarding paper-cuts. This is real usage before the public date.

### Week 4 — Mon 18 Aug – Sun 24 Aug — "Harden + polish from beta feedback"
- **T:** Triage and fix beta-surfaced bugs (prioritise anything on the money path or core import). Re-run any verification a fix touches.
- **T:** Security + build gate sweep: `npm run security:check` + `npm run build` clean; confirm MFA on operator accounts; confirm Supabase/Anthropic spend caps in place (Vercel deferred per decision).
- **M:** Finalise all launch assets. Schedule announcement posts/emails. Prep the launch-day checklist. Line up any launch-day channels (communities, direct outreach).
- **M:** Landing page final pass — testimonials/quotes from beta if any; ensure pricing is clear and the trial CTA is obvious.

### Week 5 — Mon 25 Aug – Sat 30 Aug — "Freeze, soak, launch"
- **Feature freeze Monday.** No new features — verification and critical fixes only.
- **T (Mon–Wed):** Full dress-rehearsal run-through of the entire happy path as a brand-new user, on desktop and mobile, including a real paid upgrade. Fix only launch-blocking issues.
- **T (Thu–Fri):** Final `npm run build` + `security:check` clean. Confirm all prod env vars, webhook, redirect allow-list, spend caps. Confirm error digest emails are landing.
- **Sat 30 Aug — LAUNCH.** Publish announcement, open signups publicly, monitor Sentry + error digests + the funnel closely through the day. Keep a rollback/triage note handy.

---

## 4. Explicitly NOT in this launch (guardrails against scope creep)

- **Enterprise "operational visibility" reposition** (`Landing page repositioning brief.txt`, backlog Phase-2). Post-launch. Launch stays Phase-1 freelancer framing.
- **MYOB export** (P1 backlog) — Xero only at launch.
- **Async translation jobs / background worker** (deferred, P2).
- **AI-matching-speed root-cause** (partial; not launch-blocking — verify it's tolerable, don't rebuild).
- **External sub-daily error scheduler** (nice-to-have; daily digest is acceptable at launch volume).
- **DB migration automation** (decision item; explicitly deferred to post-launch so the crunch doesn't absorb it).
- **Vercel spend alerts** — deferred to the ~20-paying-user trigger (accepted risk; Hobby throttles rather than overspends).

Anything else surfacing mid-run is **scope-affecting** → flag it, don't silently absorb it (Project Model §1).

---

## 5. Launch-readiness checklist (the gate for 30 Aug)

Nothing here ships to public launch until every line is ✅ or a consciously-accepted risk.

**Money path**
- [ ] Stripe checkout completes with a real card; tier + AI limit update
- [ ] Customer portal loads; annual toggle → correct price IDs; promo grants Pro
- [ ] Webhook verified at prod URL; `past_due` + cancellation handled

**Core product**
- [ ] Import/matching E2E: rules, duplicates, override persistence, no dropped rows, error surfaces
- [ ] Google Calendar connect E2E for a non-test user; refresh + revoke work
- [ ] Jira worklog history correct; Xero CSV imports cleanly into real Xero

**Access + trust**
- [ ] Password reset E2E; `/reset-password` in redirect allow-list
- [ ] Mobile E2E on a real device
- [ ] `RESEND_API_KEY` live — contact form + digests + consent emails send
- [ ] MFA on operator accounts; Supabase + Anthropic spend caps set

**Build gate**
- [ ] `npm run security:check` + `npm run build` clean
- [ ] All prod env vars confirmed present

**Marketing**
- [ ] Landing page on Phase-1 messaging, Google-connect as hero CTA
- [ ] Beta consent + unsubscribe live (Spam Act compliant) before any email
- [ ] Launch announcement assets ready + scheduled

---

## 6. Change log for this plan

- 2026-07-24 — Plan created. Launch date 30 Aug, paid launch, balanced tracks. Corrected the earlier PRD-derived assumption that Google Calendar OAuth was unbuilt P2 work — it was built 2026-07-13 and only gated on the sensitive-scope approval that landed today.
