import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdminAccess } from '@/lib/admin'
import AdminUsersPanel from '@/components/admin/AdminUsersPanel'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams?: Promise<{ panel?: string }>
}

interface SystemEventRow {
  id: string
  event_type: string
  severity: string
  user_id: string | null
  request_id: string
  import_id: string | null
  route: string | null
  action: string | null
  status: string | null
  error_code: string | null
  message: string
  details: Record<string, unknown>
  created_at: string
}

interface ImportRunRow {
  id: string
  user_id: string
  status: string
  event_count: number
  skipped_count: number
  matched_count: number
  ai_matched_count: number
  failed_count: number
  error_code: string | null
  error_message: string | null
  created_at: string
}

interface ProfileRow {
  user_id: string
  tier: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  subscription_status: string | null
  access_blocked_at: string | null
}

interface ActivityItem {
  id: string
  time: string
  severity: 'info' | 'warning' | 'error'
  sentence: string
  sub?: string
  userId: string | null
  importId: string | null
  source: 'event' | 'run'
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function formatDateShort(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

async function userEmailMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>()
  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const wanted = new Set(userIds)
  return new Map(
    data.users
      .filter(u => wanted.has(u.id))
      .map(u => [u.id, u.email ?? u.id])
  )
}

async function allUserEmails() {
  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return new Map(data.users.map(u => [u.id, u.email ?? u.id]))
}

function displayUser(userId: string | null, emails: Map<string, string>) {
  if (!userId) return 'anonymous'
  return emails.get(userId) ?? `user-${userId.slice(0, 6)}`
}

function eventToSentence(event: SystemEventRow, emails: Map<string, string>): ActivityItem {
  const user = displayUser(event.user_id, emails)
  const d = event.details ?? {}
  let sentence = event.message
  let sub: string | undefined
  const t = event.event_type

  if (t === 'auth_callback_succeeded' || t.includes('auth_callback_succeeded')) {
    sentence = `${user} signed in`
  } else if (t.includes('auth_callback_failed')) {
    sentence = `Sign-in failed`
    sub = event.error_code ?? undefined
  } else if (t.includes('auth_callback_missing_code')) {
    sentence = `Sign-in attempt with missing OAuth code`
  } else if (t === 'import_started') {
    sentence = `${user} started an import`
  } else if (t === 'import_processed_successfully' || t === 'csv_import_processed_successfully') {
    const count = typeof d.eventCount === 'number' ? d.eventCount : '?'
    const matched = typeof d.matchedCount === 'number' ? d.matchedCount : '?'
    const ai = typeof d.aiMatchedCount === 'number' ? ` (${d.aiMatchedCount} by AI)` : ''
    sentence = `${user} completed an import — ${count} events, ${matched} matched${ai}`
    if (typeof d.skippedCount === 'number' && d.skippedCount > 0) sub = `${d.skippedCount} skipped`
  } else if (t === 'ai_match_skipped' || t.includes('ai_matching_skipped')) {
    sentence = `AI matching skipped — no Jira tickets available`
    sub = user
  } else if (t === 'ai_parse_failed') {
    const batch = typeof d.batchSize === 'number' ? `batch of ${d.batchSize}` : ''
    const preview = typeof d.rawPreview === 'string' ? ` — "${d.rawPreview.slice(0, 120)}"` : ''
    sentence = `AI failed to parse match response${batch ? ` (${batch})` : ''}${preview}`
    sub = user
  } else if (t === 'ai_response_truncated') {
    const batch = typeof d.batchSize === 'number' ? `batch of ${d.batchSize}` : ''
    const parsed = typeof d.parsedCount === 'number' ? `, ${d.parsedCount} recovered` : ''
    sentence = `AI response truncated (hit token limit)${batch ? ` — ${batch}` : ''}${parsed}`
    sub = user
  } else if (t === 'ai_api_error') {
    const err = typeof d.error === 'string' ? ` — ${d.error.slice(0, 80)}` : ''
    sentence = `Anthropic API error during AI matching${err}`
    sub = user
  } else if (t === 'ai_partial_match') {
    const dropped = typeof d.droppedCount === 'number' ? d.droppedCount : '?'
    const total = typeof d.batchSize === 'number' ? d.batchSize : '?'
    sentence = `AI matched partially — ${dropped} of ${total} events dropped`
    sub = user
  } else if (t === 'ai_match_succeeded') {
    const count = typeof d.parsedCount === 'number' ? d.parsedCount : '?'
    const batch = typeof d.batchIndex === 'number' && typeof d.totalBatches === 'number' ? ` (batch ${d.batchIndex}/${d.totalBatches})` : ''
    sentence = `AI matched ${count} events successfully${batch}`
    sub = user
  } else if (t.includes('ai_entitlement_blocked')) {
    sentence = `${user} blocked — AI not available on their plan`
  } else if (t.includes('ai_per_minute_rate_limit')) {
    sentence = `${user} hit the AI per-minute rate limit`
  } else if (t.includes('ai_monthly_usage_limit')) {
    sentence = `${user} hit their monthly AI usage limit`
  } else if (t === 'jira_settings_saved') {
    sentence = `${user} saved Jira credentials`
  } else if (t === 'jira_worklog_created') {
    const key = typeof d.issueKey === 'string' ? d.issueKey : ''
    sentence = `${user} logged time${key ? ` to ${key}` : ''}`
  } else if (t.includes('jira_modern_search_failed')) {
    sentence = `Jira modern search failed — fell back to legacy`
    sub = user
  } else if (t.includes('jira_connection_tested')) {
    sentence = `${user} tested Jira connection — ${event.status === 'success' ? 'passed' : 'failed'}`
  } else {
    sentence = event.message
    if (event.user_id) sub = user
  }

  return {
    id: event.id,
    time: event.created_at,
    severity: event.severity as 'info' | 'warning' | 'error',
    sentence,
    sub,
    userId: event.user_id,
    importId: event.import_id,
    source: 'event',
  }
}

function runToSentence(run: ImportRunRow, emails: Map<string, string>): ActivityItem {
  const user = displayUser(run.user_id, emails)
  const ai = run.ai_matched_count > 0 ? ` (${run.ai_matched_count} by AI)` : ''
  const failed = run.failed_count > 0 ? `, ${run.failed_count} failed` : ''
  let sentence: string
  let sub: string | undefined

  if (run.status === 'failed' || run.status === 'error') {
    sentence = `${user}'s import failed`
    sub = run.error_code ?? run.error_message ?? undefined
  } else {
    sentence = `${user} ran an import — ${run.event_count} events, ${run.matched_count} matched${ai}${failed}`
    if (run.skipped_count > 0) sub = `${run.skipped_count} skipped`
  }

  return {
    id: run.id,
    time: run.created_at,
    severity: run.status === 'failed' || run.status === 'error' ? 'error' : 'info',
    sentence,
    sub,
    userId: run.user_id,
    importId: run.id,
    source: 'run',
  }
}

function severityDot(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') return 'bg-red-500'
  if (severity === 'warning') return 'bg-amber-400'
  return 'bg-gray-300'
}

function severityRowBg(severity: 'info' | 'warning' | 'error') {
  if (severity === 'error') return 'bg-red-50'
  if (severity === 'warning') return 'bg-amber-50'
  return ''
}

function badgeClass(value: string | null | undefined) {
  if (value === 'active' || value === 'trialing' || value === 'success') return 'bg-green-50 text-green-700 border-green-200'
  if (value === 'past_due' || value === 'warning' || value === 'failed') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (value === 'canceled' || value === 'error' || value === 'blocked') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

export default async function AdminPage({ searchParams }: PageProps) {
  const { hasAdminAccess, isPlatformAdmin } = await requireAdminAccess()
  if (!hasAdminAccess) redirect('/upload')

  const params = await searchParams
  const panel = params?.panel ?? null

  const supabase = createServiceClient()

  const [{ data: eventsRaw }, { data: runsRaw }, { data: profilesRaw }, { data: reportLog }] = await Promise.all([
    supabase
      .from('app_system_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(150),
    supabase
      .from('import_runs')
      .select('id,user_id,status,event_count,skipped_count,matched_count,ai_matched_count,failed_count,error_code,error_message,created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('user_id,tier,trial_started_at,trial_ends_at,subscription_status,access_blocked_at')
      .order('trial_started_at', { ascending: false })
      .limit(1000),
    supabase
      .from('atlassian_reporting_log')
      .select('last_reported_at, last_status')
      .order('last_reported_at', { ascending: false })
      .limit(1),
  ])

  const events = (eventsRaw ?? []) as SystemEventRow[]
  const runs = (runsRaw ?? []) as ImportRunRow[]
  const profiles = (profilesRaw ?? []) as ProfileRow[]
  const totalUsers = profiles.length

  const allUserIds = [
    ...new Set([
      ...events.map(e => e.user_id).filter((v): v is string => Boolean(v)),
      ...runs.map(r => r.user_id),
      ...profiles.map(p => p.user_id),
    ]),
  ]
  const emails = panel === 'users' ? await allUserEmails() : await userEmailMap(allUserIds)

  const runIds = new Set(runs.map(r => r.id))
  const filteredEvents = events.filter(e => !(e.import_id && runIds.has(e.import_id)))

  const activityItems: ActivityItem[] = [
    ...filteredEvents.map(e => eventToSentence(e, emails)),
    ...runs.map(r => runToSentence(r, emails)),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 100)

  const errorCount = events.filter(e => e.severity === 'error').length
  const warningCount = events.filter(e => e.severity === 'warning').length
  const importCount = runs.length
  const failedImports = runs.filter(r => r.status === 'failed' || r.status === 'error').length

  const errorEvents = events.filter(e => e.severity === 'error')
  const warningEvents = events.filter(e => e.severity === 'warning')

  function cardHref(id: string) {
    return panel === id ? '/admin' : `/admin?panel=${id}`
  }

  function cardClass(id: string, extra = '') {
    const active = panel === id
    return `rounded-lg border px-4 py-3 cursor-pointer transition hover:shadow-sm ${active ? 'ring-2 ring-[#3F7C85]' : ''} ${extra}`
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-5xl px-4">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Admin</h1>
            <p className="mt-1 text-sm text-gray-500">Platform activity — last 150 events · click a card to expand</p>
          </div>
          <div className="flex gap-2">
            <a href="/admin/system-events" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Raw events
            </a>
            {isPlatformAdmin && (
              <a href="/admin/billing" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Billing
              </a>
            )}
          </div>
        </div>

        {/* Atlassian reporting status */}
        {(() => {
          const lastRun = reportLog?.[0]
          if (!lastRun?.last_reported_at) {
            return (
              <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
                <span className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
                Atlassian personal data report has never run. Scheduled weekly via Vercel cron (Mondays 04:00 UTC).
              </div>
            )
          }
          const msAgo = Date.now() - new Date(lastRun.last_reported_at).getTime()
          const daysAgo = Math.floor(msAgo / (1000 * 60 * 60 * 24))
          const hoursAgo = Math.floor(msAgo / (1000 * 60 * 60))
          const label = daysAgo === 0
            ? `${hoursAgo}h ago`
            : daysAgo === 1 ? '1 day ago' : `${daysAgo} days ago`
          const stale = daysAgo >= 8
          return (
            <div className={`mb-4 flex items-center gap-2 rounded-md border px-4 py-2 text-sm ${stale ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-600'}`}>
              <span className={`h-2 w-2 rounded-full flex-shrink-0 ${stale ? 'bg-red-500' : 'bg-green-400'}`} />
              Atlassian personal data report last ran: <strong className="ml-1">{label}</strong>
              {stale && <span className="ml-2 text-red-600 font-medium">— overdue, check cron job</span>}
            </div>
          )
        })()}

        {/* Stat tiles */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <a href={cardHref('users')} className={cardClass('users', 'border-gray-200 bg-white')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Users</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{totalUsers}</p>
            <p className="mt-0.5 text-xs text-gray-400">all time</p>
          </a>
          <a href={cardHref('imports')} className={cardClass('imports', 'border-gray-200 bg-white')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Imports</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{importCount}</p>
            {failedImports > 0
              ? <p className="mt-0.5 text-xs text-red-600">{failedImports} failed</p>
              : <p className="mt-0.5 text-xs text-gray-400">last 50</p>}
          </a>
          <a href={cardHref('errors')} className={cardClass('errors', errorCount > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Errors</p>
            <p className={`mt-1 text-2xl font-semibold ${errorCount > 0 ? 'text-red-700' : 'text-gray-900'}`}>{errorCount}</p>
            <p className="mt-0.5 text-xs text-gray-400">last 150 events</p>
          </a>
          <a href={cardHref('warnings')} className={cardClass('warnings', warningCount > 0 ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Warnings</p>
            <p className={`mt-1 text-2xl font-semibold ${warningCount > 0 ? 'text-amber-700' : 'text-gray-900'}`}>{warningCount}</p>
            <p className="mt-0.5 text-xs text-gray-400">last 150 events</p>
          </a>
          <a href={cardHref('all')} className={cardClass('all', 'border-gray-200 bg-white')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">All</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{activityItems.length}</p>
            <p className="mt-0.5 text-xs text-gray-400">recent events</p>
          </a>
        </div>

        {/* Expandable panels */}
        {panel === 'users' && (
          <AdminUsersPanel
            initialUsers={profiles.map(p => ({
              user_id: p.user_id,
              email: emails.get(p.user_id) ?? p.user_id.slice(0, 8),
              tier: p.tier,
              subscription_status: p.subscription_status,
              trial_started_at: p.trial_started_at,
              trial_ends_at: p.trial_ends_at,
              access_blocked_at: p.access_blocked_at,
            }))}
          />
        )}

        {panel === 'imports' && (
          <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Recent imports (last 50)</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Events</th>
                  <th className="px-4 py-2">Matched</th>
                  <th className="px-4 py-2">AI</th>
                  <th className="px-4 py-2">Skipped</th>
                  <th className="px-4 py-2">Failed</th>
                  <th className="px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(r => (
                  <tr key={r.id} className={r.status === 'failed' || r.status === 'error' ? 'bg-red-50' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-2 text-gray-800">{emails.get(r.user_id) ?? r.user_id.slice(0, 8)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{r.event_count}</td>
                    <td className="px-4 py-2 text-gray-600">{r.matched_count}</td>
                    <td className="px-4 py-2 text-gray-600">{r.ai_matched_count}</td>
                    <td className="px-4 py-2 text-gray-600">{r.skipped_count}</td>
                    <td className="px-4 py-2 text-gray-600">{r.failed_count}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.error_code ?? r.error_message ?? '—'}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No imports yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {panel === 'errors' && (
          <div className="mb-6 overflow-hidden rounded-lg border border-red-200 bg-white">
            <div className="border-b border-red-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-red-900">Errors ({errorCount})</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {errorEvents.map(e => (
                <li key={e.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.message}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{e.event_type}{e.error_code ? ` · ${e.error_code}` : ''}{e.route ? ` · ${e.route}` : ''}</p>
                      {e.user_id && <p className="mt-0.5 text-xs text-gray-400">{displayUser(e.user_id, emails)}</p>}
                    </div>
                    <p className="whitespace-nowrap text-xs text-gray-400">{formatDate(e.created_at)}</p>
                  </div>
                </li>
              ))}
              {errorEvents.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-gray-400">No errors — looking good.</li>
              )}
            </ul>
          </div>
        )}

        {panel === 'warnings' && (
          <div className="mb-6 overflow-hidden rounded-lg border border-amber-200 bg-white">
            <div className="border-b border-amber-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-amber-900">Warnings ({warningCount})</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {warningEvents.map(e => (
                <li key={e.id} className="px-4 py-3 bg-amber-50">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{e.message}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{e.event_type}{e.error_code ? ` · ${e.error_code}` : ''}{e.route ? ` · ${e.route}` : ''}</p>
                      {e.user_id && <p className="mt-0.5 text-xs text-gray-400">{displayUser(e.user_id, emails)}</p>}
                    </div>
                    <p className="whitespace-nowrap text-xs text-gray-400">{formatDate(e.created_at)}</p>
                  </div>
                </li>
              ))}
              {warningEvents.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-gray-400">No warnings.</li>
              )}
            </ul>
          </div>
        )}

        {panel === 'all' && (
          <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">All recent activity ({activityItems.length})</h2>
            </div>
            <ul className="divide-y divide-gray-100">
              {activityItems.map(item => (
                <li key={item.id} className={`flex items-start gap-3 px-4 py-3 ${severityRowBg(item.severity)}`}>
                  <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${severityDot(item.severity)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">{item.sentence}</p>
                    {item.sub && <p className="mt-0.5 text-xs text-gray-500">{item.sub}</p>}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="whitespace-nowrap text-xs text-gray-400">{formatDate(item.time)}</p>
                    {item.importId && item.source === 'run' && (
                      <a
                        href={`/admin/system-events?q=${encodeURIComponent(emails.get(item.userId ?? '') ?? '')}`}
                        className="mt-0.5 block text-xs text-[#3F7C85] hover:underline"
                      >
                        view events
                      </a>
                    )}
                  </div>
                </li>
              ))}
              {activityItems.length === 0 && (
                <li className="px-4 py-10 text-center text-sm text-gray-500">No activity yet.</li>
              )}
            </ul>
          </div>
        )}

        {/* Activity feed */}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent activity</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {activityItems.map(item => (
              <li key={item.id} className={`flex items-start gap-3 px-4 py-3 ${severityRowBg(item.severity)}`}>
                <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${severityDot(item.severity)}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-900">{item.sentence}</p>
                  {item.sub && <p className="mt-0.5 text-xs text-gray-500">{item.sub}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="whitespace-nowrap text-xs text-gray-400">{formatDate(item.time)}</p>
                  {item.importId && item.source === 'run' && (
                    <a
                      href={`/admin/system-events?q=${encodeURIComponent(emails.get(item.userId ?? '') ?? '')}`}
                      className="mt-0.5 block text-xs text-[#3F7C85] hover:underline"
                    >
                      view events
                    </a>
                  )}
                </div>
              </li>
            ))}
            {activityItems.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-gray-500">No activity yet.</li>
            )}
          </ul>
        </div>

      </div>
    </main>
  )
}
