# Launch Plan — Time Translator

> **Target launch date: Saturday 30 August 2026.** Paid launch (Stripe billing live day one), balanced technical + marketing tracks.

**Owner:** Jasmine Glasgow
**Created:** 2026-07-24
**Last updated:** 2026-08-03 — merged in the two-audience go-to-market strategy, pricing/positioning, and the Google contingency from the earlier "5-Week Launch Runway" artifact.
**Status:** Active — this is the working source of truth for the run to launch.
**Related docs:** `PRD.md` (product), `Project_Model.md` (process/scope), `Logs/backlog.md` (task detail), `CHANGELOG.md` (dated history).

---

## 0. Where we actually are (honest baseline)

The engine is **built**. The risk before launch is not "we need to build features" — it is **"most features have never been verified end-to-end in production with real money and real emails."** This plan is therefore mostly a *verification-and-readiness* plan, not a build plan.

**Just unblocked (2026-07-24):** Google approved the `calendar.readonly` **sensitive scope**. Google Calendar OAuth was already built and shipped (backlog, DONE 2026-07-13) but gated to test-users-only pending this approval. It is now available to **all users** — the headline "connect your calendar, no file upload" flow is live pending one live end-to-end verification.

**Key structural fact (carried over from the runway plan):** the **beta cohort does not need Google at all.** The vibe-coder beta runs entirely on `.ics` upload + Jira — no `calendar.readonly`, no dependency on the approval that just landed. This is what let beta proceed independently while Google deliberated, and it remains the product's robust fallback path (see the Google contingency in §7). Google approval is what makes the *founder/finance* public launch friction-free; it was never a beta blocker.

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
>
> **Progress note (2026-08-03):** Weeks 0–1 have elapsed. Weeks 2–5 are the live runway. Verify against the checklist in §5 what actually got done in Weeks 0–1 rather than assuming — the AI-matching/analytics work shipped 1 Aug (see `CHANGELOG.md`) was real progress but sat outside this plan's Week 0–1 scope, so some verification items may still be open. If the schedule has slipped, **slip the whole grid together** rather than compressing the freeze/soak week.
>
> **Marketing is a slow-burn track from Week 1, not a Week-4 sprint.** Recruiting a beta cohort and warming the Facebook groups have their own lead time — the relationship-led founder audience does not respond to a launch-week push (see §6).

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
- **M:** Recruit the **vibe-coder beta (Audience 2, §6)** — post the "free month to break my app" call in dev/vibe-coder groups now, so testers are lined up before the beta week. Prep `FREETIME` promo codes (consent required). *In parallel, keep showing up in the female-founder groups (Audience 1) — presence and value, no pitch yet.*
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

## 6. Go-to-market: two audiences, two jobs

The soft-marketing traction already built in Facebook groups gives us **two distinct audiences**. They map cleanly onto our two output lanes — and onto two different jobs in the launch. **One hardens the product; the other pays for it.** Both tracks start warming in Week 1 — the relationship-led groups do not respond to a launch-week sprint.

### Audience 1 — the real market (revenue): female founders & solopreneurs

- **Output lane:** Finance — Xero / MYOB CSV.
- They don't care about Jira. The magic for them is **"your calendar becomes your invoices."**
- These are the **A$5–15/mo payers who stay** — the product is ultimately for them.
- Messaging leads with the **calendar → finance transformation** and the **review-before-anything** trust angle.
- They **need Google Calendar sync** (a non-technical user won't hand-export `.ics`) — which is exactly why the friction-free public launch benefits from the Google approval now in hand.
- **Reach:** the Facebook groups where there's already soft-marketing traction + warm network.

### Audience 2 — not the market, but the QA army: vibe coders + devs who love breaking things

- **Output lane:** Jira worklogs.
- **Not the revenue market** — but they understand Jira and will trial for a free month just to play.
- "Real devs who rip vibe-coded apps apart" are the **most robust beta testers — effectively free labour.**
- Hand them a **`FREETIME` promo code** (system already built), point them at the **Jira + `.ics`** path.
- They run on `.ics` + Jira — **no Google needed** — so this cohort ships during the beta regardless of Google status.
- Treat their bug reports as the **hardening pass before founders arrive.**

**The sequence that ties them together:**

> Audience 2 (vibe coders) → *breaks & hardens* → product proven → *Google clears* → Audience 1 (founders) public launch.
>
> **Audience 2 de-risks Audience 1.** The beta needs no Google; only the founder-facing public launch leans on it.

### Positioning — one story, the founder one

- **Park** the enterprise "operational visibility" narrative — that's Phase 2 (~2yr out).
- **Lead line:** *"Your calendar already knows what you worked on. Time Translator turns it into invoices and worklogs — you just review."*
- **Differentiator:** AI assists, **you approve** — never "AI does your books."

### Pricing (as drafted in the runway plan — confirm before launch)

- **A$5/mo — 50** · **A$15/mo — 150.** *(Cross-check against the entitlement tiers in `src/lib/billing/entitlements.ts`, which currently encode 200 trial / 5,000 paid AI-match limits — reconcile the marketing pricing copy with the actual enforced limits before publishing.)*
- Confirm **GST treatment on AUD pricing** is correct for a sole trader.

### Assets & channels — cheap, high-leverage, few

- **Repurpose the Google demo video** as a 60–90s landing hero — already recorded.
- Landing conversion pass: 3-step visual, honest pricing, one CTA.
- Pick **1–2 channels** (the Facebook groups + warm network), **not five.**
- The **referral loop is already built** — surface it at signup. Free growth already paid for.
- **Confirm signup attribution works** before spending channel effort.

---

## 7. Top risks & the Google contingency

1. **"Done in code" ≠ "works in prod."** Half the backlog is exactly this. The **Xero-CSV-into-real-Xero** check and **Stripe-in-prod** are the two most likely to bite — both scheduled early (Weeks 2–3) for that reason.
2. **Blind to errors until Resend is live.** Until `RESEND_API_KEY` is configured, a launch-day failure is invisible. Non-negotiable Week-0/1 item — verify it actually landed.
3. **No go-to-market motion yet.** Not a blocker to *launching*, but a blocker to launch *mattering*. Don't let verification eat the marketing track (§6).
4. **Google timeline was never fully ours.** Approval is now in hand, but the **contingency stays documented** in case a future scope/branding re-review ever regates the flow:

   > **Google contingency:** if Google Calendar sync is ever unavailable at a launch moment, fall back to an **`.ics`-first public launch with GCal flagged "beta."** The `.ics` path is supported end-to-end and is already the beta's backbone — so this is a graceful degrade, not a blocker.

---

## 8. Change log for this plan

- 2026-07-24 — Plan created. Launch date 30 Aug, paid launch, balanced tracks. Corrected the earlier PRD-derived assumption that Google Calendar OAuth was unbuilt P2 work — it was built 2026-07-13 and only gated on the sensitive-scope approval that landed that day.
- 2026-08-03 — Merged in the stronger material from the earlier "5-Week Launch Runway" artifact: the two-audience GTM strategy (§6), pricing/positioning line, the "beta decouples from Google" structural insight (§0), and the Google contingency (§7). Added a progress note to §3 marking Weeks 0–1 as elapsed.
