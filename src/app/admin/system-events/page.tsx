import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { requireAdmin } from '@/lib/admin'

export const dynamic = 'force-dynamic'

type Severity = 'all' | 'info' | 'warning' | 'error' | 'failures'

interface PageProps {
  searchParams?: Promise<{
    severity?: string
    q?: string
    status?: string
    type?: string
  }>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : 'none'
}

function family(eventType: string) {
  if (eventType.includes('auth') || eventType.includes('oauth') || eventType.includes('magic_link') || eventType.includes('logout') || eventType.includes('sign_out')) return 'Auth'
  if (eventType.includes('jira')) return 'Jira'
  if (eventType.includes('ai') || eventType.includes('match')) return 'AI/Match'
  if (eventType.includes('import')) return 'Import'
  if (eventType.includes('usage')) return 'Usage'
  if (eventType.includes('settings')) return 'Settings'
  return 'Other'
}

function badgeClass(value: string | null | undefined) {
  if (value === 'error' || value === 'failed') return 'bg-red-50 text-red-700 border-red-200'
  if (value === 'warning' || value === 'limited') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (value === 'success') return 'bg-green-50 text-green-700 border-green-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

async function userEmailMap(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, string>()

  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const wanted = new Set(userIds)
  return new Map(
    data.users
      .filter(user => wanted.has(user.id))
      .map(user => [user.id, user.email ?? user.id])
  )
}

async function matchingUserIds(emailQuery: string) {
  if (!emailQuery) return null

  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return data.users
    .filter(user => (user.email ?? '').toLowerCase().includes(emailQuery.toLowerCase()))
    .map(user => user.id)
}

export default async function SystemEventsPage({ searchParams }: PageProps) {
  const { hasAdminAccess } = await requireAdmin()
  if (!hasAdminAccess) redirect('/upload')

  const params = await searchParams
  const severity = ((params?.severity as Severity) || 'failures') as Severity
  const q = (params?.q ?? '').trim()
  const status = (params?.status ?? '').trim()
  const type = (params?.type ?? '').trim()
  const filteredUserIds = await matchingUserIds(q)

  const supabase = createServiceClient()

  let eventsQuery = supabase
    .from('app_system_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (severity === 'failures') eventsQuery = eventsQuery.in('severity', ['warning', 'error'])
  else if (severity !== 'all') eventsQuery = eventsQuery.eq('severity', severity)
  if (status) eventsQuery = eventsQuery.eq('status', status)
  if (type) eventsQuery = eventsQuery.eq('event_type', type)
  if (filteredUserIds) {
    eventsQuery = filteredUserIds.length ? eventsQuery.in('user_id', filteredUserIds) : eventsQuery.eq('user_id', '00000000-0000-0000-0000-000000000000')
  }

  let runsQuery = supabase
    .from('import_runs')
    .select('id,user_id,status,event_count,skipped_count,matched_count,ai_matched_count,failed_count,error_code,error_message,created_at')
    .order('created_at', { ascending: false })
    .limit(25)

  if (filteredUserIds) {
    runsQuery = filteredUserIds.length ? runsQuery.in('user_id', filteredUserIds) : runsQuery.eq('user_id', '00000000-0000-0000-0000-000000000000')
  }

  const [{ data: eventsRaw, error: eventsError }, { data: runsRaw, error: runsError }] = await Promise.all([
    eventsQuery,
    runsQuery,
  ])

  const events = (eventsRaw ?? []) as SystemEventRow[]
  const runs = (runsRaw ?? []) as ImportRunRow[]
  const emails = await userEmailMap([
    ...new Set([
      ...events.map(event => event.user_id).filter((value): value is string => Boolean(value)),
      ...runs.map(run => run.user_id),
    ]),
  ])

  const summary = events.reduce<Record<string, number>>((acc, event) => {
    const key = family(event.event_type)
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const eventTypes = [...new Set(events.map(event => event.event_type))].sort()

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Recent System Events</h1>
            <p className="mt-1 text-sm text-gray-500">Admin-only diagnostics for failures, imports, Jira, AI, auth, and usage limits.</p>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Activity
            </a>
            <a href="/admin/billing" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Billing
            </a>
          </div>
        </div>

        {(eventsError || runsError) && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load all system data. {eventsError?.message || runsError?.message}
          </div>
        )}

        <form className="mb-6 grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-[1fr_160px_160px_220px_auto]">
          <input
            name="q"
            defaultValue={q}
            placeholder="Filter by user email"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <select name="severity" defaultValue={severity} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900">
            <option value="failures">Failures only</option>
            <option value="all">All severities</option>
            <option value="error">Errors</option>
            <option value="warning">Warnings</option>
            <option value="info">Info</option>
          </select>
          <input
            name="status"
            defaultValue={status}
            placeholder="Status"
            className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
          <select name="type" defaultValue={type} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900">
            <option value="">All event types</option>
            {eventTypes.map(eventType => <option key={eventType} value={eventType}>{eventType}</option>)}
          </select>
          <button className="rounded bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white hover:bg-[#356D75]">
            Apply
          </button>
        </form>

        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {['Auth', 'Import', 'AI/Match', 'Jira', 'Usage', 'Settings'].map(item => (
            <div key={item} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{item}</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">{summary[item] ?? 0}</p>
            </div>
          ))}
        </div>

        <section className="mb-8 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Last 100 matching events</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Route</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Request</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {events.map(event => (
                  <tr key={event.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(event.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{event.event_type}</div>
                      <div className="mt-1 text-xs text-gray-500">{event.message}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(event.severity)}`}>{event.severity}</span>
                      {event.status && <span className={`ml-2 inline-flex rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(event.status)}`}>{event.status}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{event.user_id ? emails.get(event.user_id) ?? shortId(event.user_id) : 'anonymous'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{event.route ?? 'none'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{event.error_code ?? 'none'}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">{shortId(event.request_id)}</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No matching events.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Recent import runs</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Events</th>
                  <th className="px-4 py-3">Matched</th>
                  <th className="px-4 py-3">Skipped</th>
                  <th className="px-4 py-3">AI</th>
                  <th className="px-4 py-3">Failed</th>
                  <th className="px-4 py-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runs.map(run => (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(run.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{emails.get(run.user_id) ?? shortId(run.user_id)}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(run.status)}`}>{run.status}</span></td>
                    <td className="px-4 py-3 text-gray-600">{run.event_count}</td>
                    <td className="px-4 py-3 text-gray-600">{run.matched_count}</td>
                    <td className="px-4 py-3 text-gray-600">{run.skipped_count}</td>
                    <td className="px-4 py-3 text-gray-600">{run.ai_matched_count}</td>
                    <td className="px-4 py-3 text-gray-600">{run.failed_count}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{run.error_code ?? run.error_message ?? 'none'}</td>
                  </tr>
                ))}
                {runs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No recent import runs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
