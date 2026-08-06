#!/usr/bin/env node
/**
 * Billing / pricing / limits test script.
 *
 *   node scripts/billing-check.mjs            # offline: entitlement matrix + config checks
 *   node scripts/billing-check.mjs --stripe   # also hit the Stripe API (needs STRIPE_SECRET_KEY)
 *
 * Section 1 checks the whole tier/status matrix (trial, expired, pro, max power,
 * past_due, canceled, blocked, admin) without needing a database.
 * Section 2 checks the monthly AI quota arithmetic (caps, atomic batches, refunds).
 * Section 3 checks the env/price configuration the Stripe routes depend on.
 * Section 4 (--stripe) verifies every configured price ID exists, is active, is
 * recurring, and CHARGES THE ADVERTISED PRICE — see PRICE_VARS below.
 * Section 5 prints the live-mode manual checklist that cannot be automated.
 *
 * Exit code is non-zero if any check fails, so this is CI-safe. Note that piping the
 * output (e.g. `| tail`) masks the exit code unless you `set -o pipefail`.
 *
 * KNOWN LIMITATION: this is plain JavaScript and the billing rules are TypeScript, so
 * the entitlement logic below is a hand-copied MIRROR of getUserEntitlement(). It has
 * drifted once already and produced a passing test that asserted the opposite of real
 * behaviour. Re-check the mirror whenever billing logic changes — section 3's guards
 * only compare the limit constants and watch for a duplicate limits table; neither can
 * catch a control-flow change, which is what the drift actually was.
 * See Project_Model.md §6, decision of 2026-08-05.
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STRIPE_MODE = process.argv.includes('--stripe')

// ---------------------------------------------------------------- env loading
// Load .env.local the way Next does, so the script sees the same config as the app.
for (const file of ['.env.local', '.env']) {
  const path = join(ROOT, file)
  if (!existsSync(path)) continue
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1)
    if (!(key in process.env)) process.env[key] = value
  }
}

// ------------------------------------------------------------------ reporting
let passed = 0
const failures = []
const skipped = []
function ok(name, detail) {
  passed++
  console.log(`  [32mPASS[0m ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name, detail) {
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
  console.log(`  [31mFAIL[0m ${name}${detail ? ` — ${detail}` : ''}`)
}
function skip(name, why) {
  skipped.push(`${name} (${why})`)
  console.log(`  [33mSKIP[0m ${name} — ${why}`)
}
function check(name, actual, expected) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) ok(name)
  else fail(name, `expected ${e}, got ${a}`)
}
function section(title) {
  console.log(`\n[1m${title}[0m`)
}

// -------------------------------------------------- entitlement logic (mirror)
// Mirror of src/lib/billing/entitlements.ts. The real module is TypeScript with
// `@/` path aliases, so it cannot be imported by plain node; keeping a mirror
// here means the expectations below are asserted against explicit rules.
// If entitlements.ts changes, this mirror must change with it — the drift guard
// in section 3 compares the limit constants to catch the common case.
const FREE_TRIAL_AI_MONTHLY_LIMIT = 200
const PAID_SINGLE_USER_AI_MONTHLY_LIMIT = 5000
const MAX_POWER_AI_MONTHLY_LIMIT = 50000

const inFuture = v => Boolean(v && new Date(v).getTime() > Date.now())

// entitlements.ts:108 does `profile.trial_ends_at ?? fallbackTrialEnd()`, i.e. a null
// trial date would be replaced by "now + 30 days" and grant a fresh active trial.
// That state is unreachable: profiles.trial_ends_at is `not null` with a 30-day default
// (202605150003_subscription_lifecycle.sql:3), the signup trigger sets it explicitly
// (same file, :56-63), and the backfill filled every pre-existing row (:15). The only
// two writers in the codebase (that trigger and createDefaultProfile in entitlements.ts)
// both set it explicitly; the admin screens are read-only and there is no import path.
// The mirror reproduces the fallback so it stays faithful to the source, but there is
// deliberately NO test case for a null date — asserting behaviour for a state the schema
// forbids would be testing fiction. NOTE: this holds only while the `not null` constraint
// stands. Migrations here are applied by hand in Supabase, so dropping it would silently
// reopen the state (benign — a fresh 30-day trial — but then untested).
const fallbackTrialEnd = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

function normalizeTier(value) {
  if (value === 'max_power') return 'max_power'
  if (['paid', 'single_user', 'pro', 'paid_single_user'].includes(value)) return 'paid_single_user'
  return 'free_trial'
}

function entitlementFor(profile) {
  if (profile.is_admin) {
    return { tier: 'max_power', status: 'active', monthlyAiLimit: MAX_POWER_AI_MONTHLY_LIMIT, canUseAi: true }
  }
  if (profile.access_blocked_at) {
    return {
      tier: normalizeTier(profile.subscription_tier ?? profile.tier),
      status: 'blocked',
      monthlyAiLimit: 0,
      canUseAi: false,
    }
  }
  const tier = normalizeTier(profile.subscription_tier ?? profile.tier)
  const status = profile.subscription_status ?? 'trialing'
  const periodEnd = profile.subscription_current_period_end ?? null

  if (tier === 'paid_single_user' || tier === 'max_power') {
    const paidActive = status === 'active' || status === 'trialing'
    const pastDueButCurrent = status === 'past_due' && inFuture(periodEnd)
    return {
      tier,
      status: paidActive ? 'active' : status === 'past_due' ? 'past_due' : status === 'canceled' ? 'canceled' : 'blocked',
      monthlyAiLimit: tier === 'max_power' ? MAX_POWER_AI_MONTHLY_LIMIT : PAID_SINGLE_USER_AI_MONTHLY_LIMIT,
      canUseAi: paidActive || pastDueButCurrent,
    }
  }
  const trialActive = status === 'trialing' && inFuture(profile.trial_ends_at ?? fallbackTrialEnd())
  return {
    tier: 'free_trial',
    status: trialActive ? 'trialing' : 'trial_expired',
    monthlyAiLimit: FREE_TRIAL_AI_MONTHLY_LIMIT,
    canUseAi: trialActive,
  }
}

const DAY = 86_400_000
const future = new Date(Date.now() + 10 * DAY).toISOString()
const past = new Date(Date.now() - 10 * DAY).toISOString()

section('1. Entitlement matrix (tier × status → limit / AI access)')

const CASES = [
  ['new user on trial',
    { tier: 'free_trial', subscription_status: 'trialing', trial_ends_at: future },
    { tier: 'free_trial', status: 'trialing', monthlyAiLimit: 200, canUseAi: true }],
  ['trial expired by date',
    { tier: 'free_trial', subscription_status: 'trialing', trial_ends_at: past },
    { tier: 'free_trial', status: 'trial_expired', monthlyAiLimit: 200, canUseAi: false }],
  ['trial expiring within the hour is still active',
    { tier: 'free_trial', subscription_status: 'trialing', trial_ends_at: new Date(Date.now() + 3_600_000).toISOString() },
    { tier: 'free_trial', status: 'trialing', monthlyAiLimit: 200, canUseAi: true }],
  ['trial that ended one minute ago is expired',
    { tier: 'free_trial', subscription_status: 'trialing', trial_ends_at: new Date(Date.now() - 60_000).toISOString() },
    { tier: 'free_trial', status: 'trial_expired', monthlyAiLimit: 200, canUseAi: false }],
  ['Pro active',
    { subscription_tier: 'paid_single_user', subscription_status: 'active', subscription_current_period_end: future },
    { tier: 'paid_single_user', status: 'active', monthlyAiLimit: 5000, canUseAi: true }],
  ['Pro via legacy tier name "pro"',
    { subscription_tier: 'pro', subscription_status: 'active' },
    { tier: 'paid_single_user', status: 'active', monthlyAiLimit: 5000, canUseAi: true }],
  ['Pro past_due but period still current (grace)',
    { subscription_tier: 'pro', subscription_status: 'past_due', subscription_current_period_end: future },
    { tier: 'paid_single_user', status: 'past_due', monthlyAiLimit: 5000, canUseAi: true }],
  ['Pro past_due and period ended (cut off)',
    { subscription_tier: 'pro', subscription_status: 'past_due', subscription_current_period_end: past },
    { tier: 'paid_single_user', status: 'past_due', monthlyAiLimit: 5000, canUseAi: false }],
  ['Pro canceled',
    { subscription_tier: 'pro', subscription_status: 'canceled', subscription_current_period_end: past },
    { tier: 'paid_single_user', status: 'canceled', monthlyAiLimit: 5000, canUseAi: false }],
  ['Max Power active',
    { subscription_tier: 'max_power', subscription_status: 'active', subscription_current_period_end: future },
    { tier: 'max_power', status: 'active', monthlyAiLimit: 50000, canUseAi: true }],
  ['Max Power in Stripe trial',
    { subscription_tier: 'max_power', subscription_status: 'trialing' },
    { tier: 'max_power', status: 'active', monthlyAiLimit: 50000, canUseAi: true }],
  ['blocked account keeps tier but loses all quota',
    { subscription_tier: 'max_power', subscription_status: 'active', access_blocked_at: past },
    { tier: 'max_power', status: 'blocked', monthlyAiLimit: 0, canUseAi: false }],
  ['admin always Max Power',
    { subscription_tier: 'free_trial', subscription_status: 'trialing', trial_ends_at: past, is_admin: true },
    { tier: 'max_power', status: 'active', monthlyAiLimit: 50000, canUseAi: true }],
  ['unknown tier string falls back to free trial',
    { subscription_tier: 'platinum_deluxe', subscription_status: 'active', trial_ends_at: past },
    { tier: 'free_trial', status: 'trial_expired', monthlyAiLimit: 200, canUseAi: false }],
]

for (const [name, profile, expected] of CASES) {
  check(name, entitlementFor(profile), expected)
}

section('2. Quota arithmetic (consume_ai_usage semantics)')

// Mirror of supabase/migrations/202605140001_atomic_ai_usage.sql.
function consume(current, amount, limit) {
  if (limit >= 0 && current + amount > limit) {
    return { allowed: false, ai_calls: current, remaining: Math.max(0, limit - current) }
  }
  return { allowed: true, ai_calls: current + amount, remaining: Math.max(0, limit - current - amount) }
}

check('trial: 1 call at 0/200', consume(0, 1, 200), { allowed: true, ai_calls: 1, remaining: 199 })
check('trial: exactly hitting the cap is allowed', consume(199, 1, 200), { allowed: true, ai_calls: 200, remaining: 0 })
check('trial: one over the cap is rejected, counter untouched', consume(200, 1, 200), { allowed: false, ai_calls: 200, remaining: 0 })
check('batch larger than remaining is rejected atomically', consume(195, 10, 200), { allowed: false, ai_calls: 195, remaining: 5 })
check('pro: mid-month batch', consume(4900, 50, 5000), { allowed: true, ai_calls: 4950, remaining: 50 })
check('blocked user (limit 0) cannot consume', consume(0, 1, 0), { allowed: false, ai_calls: 0, remaining: 0 })
check('limit -1 means unlimited', consume(999999, 100, -1), { allowed: true, ai_calls: 1000099, remaining: 0 })

// Refunds must return quota without going negative.
const refund = (current, amount) => Math.max(0, current - amount)
check('refund of failed batch', refund(50, 10), 40)
check('refund cannot drive usage negative', refund(3, 10), 0)

section('3. Configuration — limits, env vars, price IDs')

// Drift guard: the tier limits live in two places and must agree.
const entitlementsSrc = readFileSync(join(ROOT, 'src/lib/billing/entitlements.ts'), 'utf8')
const limitsSrc = readFileSync(join(ROOT, 'src/lib/security-limits.ts'), 'utf8')
const srcNum = (src, name) => {
  const m = src.match(new RegExp(`${name}\\s*=\\s*(\\d+)`))
  return m ? Number(m[1]) : null
}
for (const [name, expected] of [
  ['FREE_TRIAL_AI_MONTHLY_LIMIT', FREE_TRIAL_AI_MONTHLY_LIMIT],
  ['PAID_SINGLE_USER_AI_MONTHLY_LIMIT', PAID_SINGLE_USER_AI_MONTHLY_LIMIT],
  ['MAX_POWER_AI_MONTHLY_LIMIT', MAX_POWER_AI_MONTHLY_LIMIT],
]) {
  const actual = srcNum(entitlementsSrc, name)
  if (actual === expected) ok(`entitlements.ts ${name} = ${expected}`)
  else fail(`entitlements.ts ${name}`, `this script expects ${expected}, source says ${actual} — update scripts/billing-check.mjs`)
}
// The tier limits must live in exactly ONE place. A second table of them existed in
// security-limits.ts until 2026-08-05 and had already drifted (no max_power row), so
// this guards against a duplicate reappearing rather than against it disagreeing.
//
// Matches the SHAPE of a tier-limit table — a tier name mapped to a number — rather
// than the two deleted identifiers, because the likely way this recurs is somebody
// re-adding the same table under a different name, which a name-matched guard misses.
// Block comments are stripped as well as line comments: security-limits.ts documents
// why the table was removed, and matching that prose would fire the guard on its own
// explanation.
const limitsCode = limitsSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter(l => !l.trim().startsWith('//'))
  .join('\n')
const TIER_KEYS = ['free_trial', 'max_power', 'paid_single_user', 'single_user', 'trial']
const tierLimitRow = new RegExp(`(?:${TIER_KEYS.join('|')})\\s*:\\s*(?:\\d+|Infinity)`)
const duplicateShape = limitsCode.match(tierLimitRow)
const duplicateByName = limitsCode.match(/TIER_AI_MONTHLY_LIMITS|tierAiMonthlyLimit/)
if (!duplicateShape && !duplicateByName) {
  ok('security-limits.ts contains no tier-name-to-number mapping (tier limits live only in entitlements.ts)')
} else {
  fail('a second copy of the tier AI limits appears to have reappeared in security-limits.ts',
    `matched ${JSON.stringify((duplicateShape ?? duplicateByName)[0])}. The removed ` +
    'TIER_AI_MONTHLY_LIMITS table had drifted from entitlements.ts and would have given ' +
    'Max Power users the 200 free-tier limit. Tier limits belong in entitlements.ts only.')
}

// The advertised prices, from src/components/billing/UpgradePrompt.tsx:138-139 (and
// repeated in the plan cards around :174 and :200). Section 4 asserts Stripe charges
// exactly these — the only check anywhere that compares the pricing page to what is
// actually billed. Deliberately hardcoded
// rather than scraped out of the component: if the pricing copy is reworded a scraper
// silently stops checking, whereas a hardcoded figure fails loudly and tells you to
// update it. IF YOU CHANGE A PRICE, change it in three places — Stripe, UpgradePrompt,
// and here — and this check is what catches you forgetting one.
const EXPECTED_CURRENCY = 'aud'
const PRICE_VARS = [
  { env: 'STRIPE_PRO_MONTHLY_PRICE_ID', label: 'Pro monthly', dollars: 5, interval: 'month' },
  { env: 'STRIPE_PRO_ANNUAL_PRICE_ID', label: 'Pro annual', dollars: 50, interval: 'year' },
  { env: 'STRIPE_MAX_POWER_PRICE_ID', label: 'Max Power monthly', dollars: 15, interval: 'month' },
  { env: 'STRIPE_MAX_POWER_ANNUAL_PRICE_ID', label: 'Max Power annual', dollars: 150, interval: 'year' },
]
for (const v of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_APP_URL', ...PRICE_VARS.map(p => p.env)]) {
  if (process.env[v]) ok(`${v} is set`)
  else fail(`${v} is not set`, 'the route that needs it returns 500')
}
for (const { env } of PRICE_VARS) {
  const id = process.env[env]
  if (!id) continue
  if (id.startsWith('price_')) ok(`${env} looks like a price ID`)
  else fail(`${env} is not a price ID`, `got "${id}" — a prod_/plan_ ID here makes checkout fail`)
}

// The annual plans advertise a saving. Read the ACTUAL claim out of UpgradePrompt.tsx
// rather than restating it here — a hardcoded copy of the claim could only ever agree
// with itself, which is how the first version of this check ended up unable to fail.
// Wrong maths in a public discount claim is a consumer-law problem, not a typo.
const upgradeSrc = readFileSync(join(ROOT, 'src/components/billing/UpgradePrompt.tsx'), 'utf8')
const savingClaims = [...upgradeSrc.matchAll(/Save A\$(\d+)\/yr/g)].map(m => Number(m[1]))
const claimsTwoMonths = /two months on us/i.test(upgradeSrc)

// One "Save A$N/yr" claim per annual plan. NOTE the pairing is POSITIONAL: the Nth
// claim in the source is matched to the Nth annual plan in PRICE_VARS. Reordering the
// plan cards in the JSX would mis-pair them — today that fails loudly because the two
// savings differ (A$10 vs A$30), but it would go silent if both plans ever saved the
// same amount. Match on plan name here if that changes.
const annualPlans = PRICE_VARS.filter(p => p.interval === 'year')
if (savingClaims.length !== annualPlans.length) {
  fail('could not read the advertised annual savings from UpgradePrompt.tsx',
    `expected ${annualPlans.length} "Save A$N/yr" claims, found ${savingClaims.length} — if the pricing copy was reworded, update this check`)
} else {
  annualPlans.forEach((annualPlan, i) => {
    const planName = annualPlan.label.replace(' annual', '')
    const monthlyPlan = PRICE_VARS.find(p => p.label === `${planName} monthly`)
    if (!monthlyPlan) {
      fail(`no monthly plan found to compare against ${annualPlan.label}`)
      return
    }
    const advertised = savingClaims[i]
    const actual = monthlyPlan.dollars * 12 - annualPlan.dollars
    if (actual !== advertised) {
      fail(`${planName} advertised annual saving is wrong`,
        `UpgradePrompt.tsx says "Save A$${advertised}/yr", but A$${monthlyPlan.dollars}/mo vs A$${annualPlan.dollars}/yr saves A$${actual}`)
    } else {
      ok(`${planName} advertised saving of A$${advertised}/yr matches the real A$${actual}`)
    }
    // The page also promises "two months on us" — check the annual plan delivers that.
    if (claimsTwoMonths && actual !== monthlyPlan.dollars * 2) {
      fail(`${planName} does not deliver the advertised "two months on us"`,
        `two months of A$${monthlyPlan.dollars}/mo is A$${monthlyPlan.dollars * 2}, but the annual plan saves A$${actual}`)
    }
  })
}

section('4. Live Stripe price verification')

if (!STRIPE_MODE) {
  skip('Stripe API checks', 're-run with --stripe to verify prices live')
} else if (!process.env.STRIPE_SECRET_KEY) {
  skip('Stripe API checks', 'STRIPE_SECRET_KEY is not set')
} else {
  const { default: Stripe } = await import('stripe')
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // Which Stripe mode is this key in? Test mode and live mode have SEPARATE price IDs,
  // so a PASS here only tells you the mode you actually pointed at is correct.
  const mode = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_') ? 'LIVE' : 'TEST'
  console.log(`  Checking Stripe ${mode} mode. Test and live have separate price IDs —`)
  console.log(`  a pass here only covers ${mode} mode.`)

  for (const { env, label: planLabel, dollars, interval: wantInterval } of PRICE_VARS) {
    const id = process.env[env]
    if (!id) continue
    try {
      const price = await stripe.prices.retrieve(id, { expand: ['product'] })
      const wantCents = dollars * 100
      const gotAmount = price.unit_amount == null
        ? 'no fixed amount'
        : `${(price.unit_amount / 100).toFixed(2)} ${price.currency.toUpperCase()}`
      const gotInterval = price.recurring ? `per ${price.recurring.interval}` : 'ONE-OFF'
      const shown = `${gotAmount} ${gotInterval}`

      if (!price.active) {
        fail(`${planLabel} price is archived in Stripe`, `${shown} — checkout will fail`)
        continue
      }
      if (!price.recurring) {
        fail(`${planLabel} is not a recurring price`, `${shown} — subscription checkout will fail`)
        continue
      }
      // The check that matters: does Stripe charge what the pricing page advertises?
      if (price.unit_amount !== wantCents) {
        fail(`${planLabel} PRICE MISMATCH`,
          `pricing page advertises A$${dollars}, Stripe charges ${gotAmount}`)
      } else if (price.currency !== EXPECTED_CURRENCY) {
        fail(`${planLabel} wrong currency`,
          `expected ${EXPECTED_CURRENCY.toUpperCase()}, Stripe uses ${price.currency.toUpperCase()}`)
      } else if (price.recurring.interval !== wantInterval) {
        fail(`${planLabel} wrong billing interval`,
          `expected per ${wantInterval}, Stripe bills ${gotInterval}`)
      } else {
        ok(`${planLabel} charges A$${dollars} per ${wantInterval} in AUD, as advertised`)
      }
      // A deleted product still leaves the price retrievable, but checkout shows no name.
      // Assert the expansion actually landed first: without it `price.product` is a plain
      // string ID, and `'price_x'.deleted` is undefined — so a missing expand would make
      // this check silently pass rather than error.
      if (typeof price.product !== 'object' || price.product === null) {
        fail(`${planLabel} product was not expanded`,
          `expected an object, got ${typeof price.product} — cannot tell whether the product is deleted`)
      } else if (price.product.deleted) {
        fail(`${planLabel} product has been deleted in Stripe`, 'checkout will show no product name')
      }
    } catch (err) {
      fail(`${planLabel} (${env}) could not be retrieved from Stripe`, err.message)
    }
  }
  // A webhook endpoint must exist, or paid users never get their tier upgraded.
  try {
    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
    const enabled = endpoints.data.filter(e => e.status === 'enabled')
    if (!enabled.length) fail('no enabled Stripe webhook endpoint', 'checkouts will never upgrade a profile')
    else {
      ok(`${enabled.length} enabled webhook endpoint(s)`, enabled.map(e => e.url).join(', '))
      const REQUIRED = ['checkout.session.completed', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed']
      for (const evt of REQUIRED) {
        const covered = enabled.some(e => e.enabled_events.includes(evt) || e.enabled_events.includes('*'))
        if (covered) ok(`webhook subscribes to ${evt}`)
        else fail(`no webhook subscribes to ${evt}`, 'that lifecycle transition will be missed')
      }
    }
  } catch (err) {
    fail('webhook endpoint list failed', err.message)
  }
}

section('5. Manual checklist — LIVE MODE, real card, production')
console.log(`
  This is the LIVE-MODE checklist: real card, real money, production app.
  Per the Key Decision of 2026-08-05 in Project_Model.md.

  DO NOT turn on Stripe test mode, and DO NOT change any Vercel environment
  variable. Test-mode card numbers (4242..., 4000...) are DECLINED in live mode —
  if you use one you will get a decline that tells you nothing about your code.
  Leave production configuration exactly as it is and pay with a real card.

  Before you start:
    Run this script with --stripe. It reads the real prices out of Stripe and
    fails if any of them charges the wrong amount, currency or interval. Fix any
    failure before spending money — a wrong price is cheaper to find here.
    Decide which email to sign up with. A "+" alias such as
    you+tt-billing-1@yourdomain keeps the test account obviously a test account
    and lets you repeat this later without reusing a row.

  Test the MONTHLY plans only. Annual runs the same code for ten times the money;
  the annual prices are already asserted above without spending anything.

  1. Pro monthly (A$5) — sign up, upgrade, pay with your real card.
     Then check the profiles row for that user:
       stripe_customer_id        set
       stripe_subscription_id    set
       subscription_tier         paid_single_user
       tier                      paid_single_user
       subscription_status       active
     If those did not change, the webhook is not reaching the app. That is the
     single most likely failure and the whole reason for doing this.

  2. Confirm the entitlement actually followed the payment:
       GET /api/billing/entitlement  -> tier paid_single_user, monthly limit 5000
       Settings should show the same. A payment that does not raise the limit is
       the bug this step exists to catch.

  3. Pro calendar limit. READ BOTH PARTS BEFORE YOU CLICK — the order matters and
     the first calendar cannot be undone on Pro.
     3a. Link your FIRST calendar. This should SUCCEED. The limit is "one linked
         calendar", not "none", so there is nothing to test until one exists.
         Be aware: a Pro account CANNOT unlink a calendar afterwards (403,
         support-only). Pick the one you actually want, or do this on an account
         you are happy to throw away.
     3b. Now try to link a SECOND calendar.
         -> 403 "limited to one linked calendar"
     3c. Import an .ics whose calendar name is not the linked one. (Needs an .ics
         that carries a calendar name; a file without one skips this check.)
         -> 400 "upgrade to Max Power"

  4. Max Power monthly (A$15) — upgrade again from the same account.
       subscription_tier and tier -> max_power, limit -> 50000
     Linking a second calendar should now be allowed, and unlinking works again.

  5. Cancel through the billing portal. This is the path most likely to be broken,
     because it is the one nobody clicks while building. After cancelling:
       subscription_status       canceled
       subscription_tier         free_trial
       tier                      free_trial
       stripe_subscription_id    null
     AI matching stops IMMEDIATELY, not at the end of the paid period. The cancel
     handler sets tier back to free_trial, and a free_trial tier with a canceled
     status reads as trial_expired — so do not sit waiting for
     subscription_current_period_end to pass. (That field is not written by the
     cancel handler at all. It only governs the past_due grace period, which this
     checklist cannot reach with a real card.)

  6. Clean up: refund the charges in the Stripe dashboard (Stripe keeps the
     processing fee, roughly A$0.39 per charge — that is expected and not
     recoverable), and delete or mark the test account in Supabase.

  What this checklist deliberately does NOT cover, per the accepted decision:
    past_due, declined cards, 3D Secure, and failed renewals. You cannot make a
    real card fail on demand, so those branches stay unverified. They are the
    least-covered paths in entitlements.ts, including the past_due-within-grace
    logic. Covering them needs Stripe test mode against a preview deployment.

  Quota and limits — these need no payment and can be checked any time.
  THREE routes are tier-limited; two of them consume AI quota:
    /api/process               .ics file import                (consumes AI quota)
    /api/google-calendar/sync  Google Calendar sync            (consumes AI quota)
    /api/calendars             calendar linking (tier-limited, no AI)

    Expired trial, either AI route (process, gcal sync) -> 402, blocked before any AI call
    Blocked account (access_blocked_at set)   -> 402 on every AI route
    Set usage.ai_calls just under the monthly cap, then import a bigger batch
      -> 429, and usage.ai_calls is UNCHANGED (the batch is all-or-nothing)
    Over 200 AI calls inside one minute -> 429 rate limit. The monthly counter is
      untouched, because the rate limit is checked BEFORE any quota is consumed,
      so there is nothing to refund on this path.
    If Anthropic fails mid-import, events that never reached the model are
      refunded and usage.ai_calls goes back down. Verify on /api/process and
      /api/google-calendar/sync — both refund on a soft AI failure (matching
      resolving with AI unavailable), not only when the call throws.

  Webhook signature rejection (safe to run against production — both are rejected
  before anything is read):
    curl -i -X POST <app>/api/stripe/webhook -d "{}"
      -> 400 Missing signature
    curl -i -X POST <app>/api/stripe/webhook -H "stripe-signature: bad" -d "{}"
      -> 400 Invalid signature

  Billing portal:
    POST /api/stripe/portal with no stripe_customer_id -> 400 "No billing account found"
    Use a DIFFERENT account that has never paid — by step 5 the test account has a
    stripe_customer_id, so it cannot exercise this branch.
`)

section('Summary')
console.log(`  ${passed} passed, ${failures.length} failed, ${skipped.length} skipped`)
if (failures.length) {
  console.log('\n  Failures:')
  for (const f of failures) console.log(`   - ${f}`)
  process.exit(1)
}
