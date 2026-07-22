'use client'

import Link from 'next/link'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { loadFormConfig, saveFormConfig } from '@/lib/storage'
import { TIMEZONE_GROUPS } from '@/lib/timezones'
import { COMMON_JIRA_ISSUE_TYPES, DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'
import { trackClientEvent } from '@/lib/client-events'
import { toUserMessage } from '@/lib/errors'
import { UpgradeButton, UpgradePrompt } from '@/components/billing/UpgradePrompt'
import { CalendarsSection } from '@/components/settings/CalendarsSection'
import { GoogleCalendarSection } from '@/components/settings/GoogleCalendarSection'
import { DisconnectConfirmModal } from '@/components/settings/DisconnectConfirmModal'

interface Creds {
  email: string | null
  connected: boolean
}

interface Entitlement {
  tier: string
  status: string
  monthlyAiLimit: number
  canUseAi: boolean
  trialEndsAt: string
  subscriptionCurrentPeriodEnd: string | null
  reason?: string
}

function displayStatus(status: string | undefined, tier?: string) {
  if (tier === 'max_power') return 'Max Power'
  if (tier === 'paid_single_user') return 'Pro'
  if (status === 'trialing') return 'Free Trial'
  if (!status) return 'Free Trial'
  return status.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
}

function SettingsInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const justUpgraded = searchParams.get('upgraded') === '1'
  const jiraJustConnected = searchParams.get('jira_connected') === '1'
  const jiraError = searchParams.get('jira_error')

  // Jira connection
  const [creds, setCreds] = useState<Creds>({ email: null, connected: false })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showJiraDisconnectConfirm, setShowJiraDisconnectConfirm] = useState(false)
  const [usage, setUsage] = useState<{ ai_calls: number; entitlement: Entitlement; hasStripeSubscription: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  // Preferences (localStorage)
  const [defaultProjectKey, setDefaultProjectKey] = useState('DOC')
  const [timezone, setTimezone] = useState('Australia/Sydney')
  const [includedIssueTypes, setIncludedIssueTypes] = useState<string[]>([...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES])
  const [prefsInitialized, setPrefsInitialized] = useState(false)

  // Account deletion
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  // Load preferences from localStorage
  useEffect(() => {
    const saved = loadFormConfig()
    if (saved) {
      if (saved.defaultProjectKey) setDefaultProjectKey(saved.defaultProjectKey)
      if (saved.timezone) setTimezone(saved.timezone)
      if (saved.includedIssueTypes?.length) setIncludedIssueTypes(saved.includedIssueTypes)
    }
    setPrefsInitialized(true)
  }, [])

  // Auto-save preferences whenever they change
  useEffect(() => {
    if (!prefsInitialized) return
    const existing = loadFormConfig()
    saveFormConfig({
      defaultProjectKey,
      timezone,
      catchAllMappings: existing?.catchAllMappings ?? [],
      skipRules: existing?.skipRules ?? [],
      includedIssueTypes,
      excludeWeekends: existing?.excludeWeekends ?? false,
    })
  }, [prefsInitialized, defaultProjectKey, timezone, includedIssueTypes])

  function toggleIssueType(issueType: string) {
    setIncludedIssueTypes(prev => {
      const next = prev.includes(issueType)
        ? prev.filter(value => value !== issueType)
        : [...prev, issueType]

      return next.length ? next : [issueType]
    })
  }

  // Load Jira credentials + usage from Supabase
  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      setUserEmail(user.email ?? null)

      const period = new Date().toISOString().slice(0, 7)
      const [credsRes, entitlementRes, usageRes] = await Promise.all([
        fetch('/api/jira/credentials'),
        fetch('/api/billing/entitlement'),
        supabase.from('usage').select('ai_calls').eq('user_id', user.id).eq('period', period).single(),
      ])

      if (credsRes.ok) {
        const data = await credsRes.json()
        setCreds({ email: data.email ?? null, connected: Boolean(data.connected) })
      }
      const entitlementData = entitlementRes.ok ? await entitlementRes.json() : null
      setUsage({
        entitlement: entitlementData?.entitlement ?? {
          tier: 'free_trial',
          status: 'trialing',
          monthlyAiLimit: 200,
          canUseAi: true,
          trialEndsAt: new Date().toISOString(),
          subscriptionCurrentPeriodEnd: null,
        },
        ai_calls: usageRes.data?.ai_calls ?? 0,
        hasStripeSubscription: Boolean(entitlementData?.hasStripeSubscription),
      })
      setLoading(false)
    }
    load()
  }, [])

  async function openPortal() {
    setPortalLoading(true)
    setPortalError(null)
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setPortalError(toUserMessage(data.error, 'Could not open billing portal. Please contact support.'))
        setPortalLoading(false)
      }
    } catch {
      setPortalError('Could not reach billing portal. Please try again.')
      setPortalLoading(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    setTestResult(null)
    const res = await fetch('/api/jira/oauth/disconnect', { method: 'POST' })
    if (res.ok) {
      setCreds({ email: null, connected: false })
      trackClientEvent({ eventType: 'jira_disconnected', route: '/settings', action: 'jira_disconnect', status: 'success' })
    }
    setDisconnecting(false)
    setShowJiraDisconnectConfirm(false)
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      if (data.jira?.ok) {
        trackClientEvent({
          eventType: 'jira_connection_tested',
          route: '/settings',
          action: 'jira_connection_tested',
          status: 'success',
        })
        setTestResult({ ok: true, message: `Connected as ${data.jira.email}` })
      } else {
        trackClientEvent({
          eventType: 'jira_connection_test_failed',
          severity: 'warning',
          route: '/settings',
          action: 'jira_connection_tested',
          status: 'failed',
          errorCode: 'jira_connection_test_failed',
          details: { reason: data.jira?.error ?? 'Connection failed' },
        })
        setTestResult({ ok: false, message: toUserMessage(data.jira?.error, 'Could not connect to Jira. Please check your connection in Settings.') })
      }
    } catch {
      trackClientEvent({
        eventType: 'jira_connection_test_failed',
        severity: 'warning',
        route: '/settings',
        action: 'jira_connection_tested',
        status: 'failed',
        errorCode: 'jira_connection_test_request_failed',
      })
      setTestResult({ ok: false, message: 'Request failed' })
    }
    setTesting(false)
  }

  async function handleSignOut() {
    const supabase = createClient()
    trackClientEvent({
      eventType: 'user_sign_out',
      route: '/settings',
      action: 'user_sign_out',
      status: 'success',
    })
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleDeleteAccount() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setDeleteError(toUserMessage(data.error, 'Could not delete your account. Please try again.'))
        setDeleting(false)
        return
      }
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/login?deleted=1'
    } catch {
      setDeleteError('Delete failed. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) return <div className="p-10 text-center text-sm text-gray-400">Loading…</div>

  const entitlement = usage?.entitlement
  const tier = entitlement?.tier ?? 'free_trial'
  const hasStripeSubscription = usage?.hasStripeSubscription ?? false
  const limit = entitlement?.monthlyAiLimit ?? 200
  const aiCalls = usage?.ai_calls ?? 0
  const pct = limit === Infinity ? 0 : Math.min(100, (aiCalls / limit) * 100)
  const aiLimitReached = limit !== Infinity && aiCalls >= limit
  const aiLimitApproaching = limit !== Infinity && !aiLimitReached && pct >= 80
  const usageBarColor = aiLimitReached ? 'bg-red-500' : aiLimitApproaching ? 'bg-amber-500' : 'bg-blue-500'
  const trialEndsLabel = entitlement?.trialEndsAt
    ? new Date(entitlement.trialEndsAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })
    : null
  const trialDaysRemaining = entitlement?.trialEndsAt
    ? Math.ceil((new Date(entitlement.trialEndsAt).getTime() - Date.now()) / 86_400_000)
    : null
  const trialEndingSoon = tier === 'free_trial' && entitlement?.status === 'trialing' &&
    trialDaysRemaining !== null && trialDaysRemaining <= 7 && trialDaysRemaining >= 0

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-2xl px-4 space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            {userEmail && <span>{userEmail}</span>}
            <button
              onClick={handleSignOut}
              className="rounded-lg bg-[#26333A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1a2428] transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Rule shortcuts */}
        <div className="rounded-lg bg-white border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Rules</h2>
          <p className="text-xs text-gray-400 mb-4">Jump to the rule tools that shape imported time.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/review#time-sheet-mapping-rules"
              className="rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 transition-colors hover:border-[#8FD5C3] hover:bg-[#DCEEF5]/60"
            >
              <span className="block text-sm font-semibold text-[#26333A]">Time Sheet Mapping Rules</span>
              <span className="mt-1 block text-xs text-[#66747A]">Match repeat calendar events to Jira work.</span>
            </Link>
            <Link
              href="/upload#ignore-rules"
              className="rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 transition-colors hover:border-[#8FD5C3] hover:bg-[#DCEEF5]/60"
            >
              <span className="block text-sm font-semibold text-[#26333A]">Ignore Rules</span>
              <span className="mt-1 block text-xs text-[#66747A]">Exclude weekends and skipped calendar events.</span>
            </Link>
          </div>
        </div>

        {/* Jira connection */}
        <div className="rounded-lg bg-white border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Jira connection</h2>
          {jiraJustConnected && (
            <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
              Jira connected successfully.
            </div>
          )}
          {jiraError && (
            <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              Could not connect to Jira. Please try again.
            </div>
          )}
          {creds.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-700">
                  Connected{creds.email ? ` as ${creds.email}` : ''}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" onClick={handleTest} loading={testing}>
                  Test connection
                </Button>
                <Button variant="secondary" onClick={() => setShowJiraDisconnectConfirm(true)}>
                  Disconnect
                </Button>
              </div>
              {testResult && (
                <p className={`text-xs font-medium ${testResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.message}
                </p>
              )}
              {showJiraDisconnectConfirm && (
                <DisconnectConfirmModal
                  serviceName="Jira"
                  confirming={disconnecting}
                  onCancel={() => setShowJiraDisconnectConfirm(false)}
                  onConfirm={handleDisconnect}
                />
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">Connect your Jira account to log time directly from Time Translator.</p>
              <a
                href="/api/jira/oauth/start"
                className="inline-flex items-center gap-2 rounded-md bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0047B3] transition-colors"
              >
                Connect to Jira
              </a>
            </div>
          )}
        </div>

        {/* Google Calendar connection */}
        <GoogleCalendarSection />

        {/* Linked calendars (.ics upload) */}
        <CalendarsSection tier={tier} />

        {/* Preferences */}
        <div className="rounded-lg bg-white border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Preferences</h2>
          <p className="text-xs text-gray-400 mb-4">Saved automatically.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Default Jira project key</label>
              <input
                type="text"
                value={defaultProjectKey}
                onChange={e => setDefaultProjectKey(e.target.value.toUpperCase())}
                className="w-32 rounded border border-gray-300 px-3 py-2 text-sm font-mono uppercase text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <select
                value={timezone}
                onChange={e => setTimezone(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONE_GROUPS.map(group => (
                  <optgroup key={group.group} label={group.group}>
                    {group.options.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Issue types to match</label>
              <div className="flex flex-wrap gap-2">
                {COMMON_JIRA_ISSUE_TYPES.map(issueType => {
                  const selected = includedIssueTypes.includes(issueType)
                  return (
                    <button
                      key={issueType}
                      type="button"
                      onClick={() => toggleIssueType(issueType)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-[#3F7C85] bg-[#DCEEF5] text-[#26333A]'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-[#8FD5C3] hover:text-[#26333A]'
                      }`}
                    >
                      {issueType}
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Only selected issue types will be considered when suggesting Jira matches. For example, leave Epics off if you only want task-level matches.
              </p>
            </div>
          </div>
        </div>

        {/* Plan and usage */}
        <div className="rounded-lg bg-white border border-gray-200 px-6 py-5">
          <div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Plan & usage</p>
              <h2 className="mt-2 text-lg font-semibold text-gray-900">{displayStatus(entitlement?.status, entitlement?.tier)}</h2>
              {tier === 'free_trial' && trialEndsLabel && (
                <p className="mt-1 text-sm text-gray-500">Trial ends {trialEndsLabel}</p>
              )}
            </div>
          </div>

          {justUpgraded && (
            <div className="mb-3 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
              You&apos;re now on the paid plan. Thanks for upgrading!
            </div>
          )}

          {(tier === 'paid_single_user' || tier === 'max_power') && hasStripeSubscription && (
            <div className="mt-3">
              <button
                onClick={openPortal}
                disabled={portalLoading}
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700 disabled:opacity-50"
              >
                {portalLoading ? 'Redirecting…' : 'Manage subscription'}
              </button>
              {portalError && (
                <p className="mt-1 text-xs text-red-600">{portalError}</p>
              )}
            </div>
          )}

          <div className="mt-5 rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#26333A]">AI matches</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">
                  {aiCalls}
                  <span className="text-sm font-normal text-gray-500 ml-1">
                    / {limit === Infinity ? '∞' : limit} used
                  </span>
                </p>
              </div>
              {tier === 'free_trial' && entitlement?.canUseAi && !aiLimitReached && (
                <UpgradeButton />
              )}
            </div>

          {limit !== Infinity && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-gray-100">
              <div className={`h-1.5 rounded-full transition-all ${usageBarColor}`} style={{ width: `${pct}%` }} />
            </div>
          )}

            <p className="mt-3 text-sm text-[#66747A]">
              You have used {aiCalls}/{limit === Infinity ? '∞' : limit} AI matches.
              {tier === 'free_trial' && ' If you hit the limit, you\'ll need to upgrade to Time Translator Pro.'}
            </p>

            {entitlement && !entitlement.canUseAi && entitlement.reason && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{entitlement.reason}</p>
            )}
            {aiLimitApproaching && (
              <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                You&apos;re approaching your monthly AI match limit ({aiCalls}/{limit} used). Upgrade to avoid running out mid-import.
              </p>
            )}
            </div>

          {trialEndingSoon && !aiLimitReached && entitlement?.canUseAi && (
            <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              {trialDaysRemaining === 0
                ? 'Your free trial ends today.'
                : `Your free trial ends in ${trialDaysRemaining} ${trialDaysRemaining === 1 ? 'day' : 'days'} (${trialEndsLabel}).`}
              {' '}Upgrade now to keep importing without interruption.
              <UpgradeButton className="mt-2" />
            </div>
          )}

          {tier === 'free_trial' && !justUpgraded && (!entitlement?.canUseAi || aiLimitReached) && (
            <div className="mt-4">
              <UpgradePrompt
                reason={entitlement && !entitlement.canUseAi && entitlement.status === 'trial_expired' ? 'trial_expired' : 'ai_limit'}
                inline
              />
            </div>
          )}
        </div>

        {/* Export data */}
        <div className="rounded-lg bg-white border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Export your data</h2>
          <p className="text-xs text-gray-400 mb-4">
            Download a copy of your account data — profile, plan, Jira connection, linked calendars, worklog history, and import history. Does not include authentication tokens.
          </p>
          <a
            href="/api/account/export"
            download="timetranslator-data-export.json"
            className="inline-block rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Download my data
          </a>
        </div>

        {/* Delete account */}
        <div className="rounded-lg bg-white border border-red-100 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-1">Delete account</h2>
          <p className="text-xs text-gray-400 mb-4">
            Permanently deletes your account and all associated data — Jira credentials, calendars, import history, and usage records. This cannot be undone.
          </p>
          <button
            onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(''); setDeleteError(null) }}
            className="inline-flex items-center gap-2 rounded-lg border border-red-600 bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
          >
            <span aria-hidden="true" className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 border-white text-white font-bold text-xs leading-none">!</span>
            Delete my account
          </button>
        </div>

        {/* Sign out */}
        <div className="rounded-lg bg-white border border-gray-200 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Sign out</h2>
            {userEmail && <p className="text-xs text-gray-400 mt-0.5">Signed in as {userEmail}</p>}
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-lg bg-[#26333A] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a2428] transition-colors"
          >
            Sign out
          </button>
        </div>

      </div>

      {/* Delete account confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">

            {/* Red header bar */}
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-base font-semibold text-white">Before you delete your account</h3>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* History download prompt */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm font-medium text-amber-900">Have you downloaded your history?</p>
                <p className="mt-1 text-sm text-amber-800">
                  Your import history will be deleted and cannot be recovered.{' '}
                  <a
                    href="/history"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium underline underline-offset-2 hover:text-amber-900"
                  >
                    Go to History
                  </a>{' '}
                  to review or export it before continuing.
                </p>
              </div>

              {/* What gets deleted */}
              <div>
                <p className="text-sm font-medium text-gray-900">What will be deleted</p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✕</span>Your account and login access</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✕</span>Jira credentials and connection</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✕</span>Linked calendars</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✕</span>All import history and time logs</li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 text-red-400">✕</span>Usage records and preferences</li>
                </ul>
              </div>

              {/* No rollback warning */}
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-900">Deletion is final</p>
                <p className="mt-1 text-sm text-red-800">
                  There is no grace period and no rollback. Once deleted, your data cannot be restored under any circumstances — not by you, and not by us.
                </p>
              </div>

              {/* Confirm input */}
              <div>
                <p className="text-sm text-gray-600">
                  Type <span className="font-mono font-semibold text-gray-900">delete my account</span> to confirm.
                </p>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={e => setDeleteConfirmText(e.target.value)}
                  placeholder="delete my account"
                  className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                />
                {deleteError && (
                  <p className="mt-2 text-xs text-red-600">{deleteError}</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== 'delete my account' || deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {deleting ? 'Deleting…' : 'Yes, delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-gray-400">Loading…</div>}>
      <SettingsInner />
    </Suspense>
  )
}
