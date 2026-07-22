import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/admin'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

interface ProfileRow {
  user_id: string
  tier: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  subscription_tier: string | null
  subscription_status: string | null
  subscription_current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  access_blocked_at: string | null
  access_block_reason: string | null
}

function formatDate(value: string | null) {
  if (!value) return 'none'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Australia/Sydney',
  }).format(new Date(value))
}

function badgeClass(status: string | null) {
  if (status === 'active' || status === 'trialing') return 'bg-green-50 text-green-700 border-green-200'
  if (status === 'past_due') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (status === 'canceled' || status === 'blocked') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

async function userEmailMap(userIds: string[]) {
  const supabase = createServiceClient()
  const { data } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const wanted = new Set(userIds)
  return new Map(
    data.users
      .filter(user => wanted.has(user.id))
      .map(user => [user.id, user.email ?? user.id])
  )
}

export default async function AdminBillingPage() {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) redirect('/upload')

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id,tier,trial_started_at,trial_ends_at,subscription_tier,subscription_status,subscription_current_period_end,stripe_customer_id,stripe_subscription_id,access_blocked_at,access_block_reason')
    .order('trial_started_at', { ascending: false })
    .limit(100)

  const profiles = (data ?? []) as ProfileRow[]
  const emails = await userEmailMap(profiles.map(profile => profile.user_id))

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Billing Lifecycle</h1>
            <p className="mt-1 text-sm text-gray-500">Admin-only view of trial and subscription state. Stripe webhooks will update these fields later.</p>
          </div>
          <div className="flex gap-2">
            <a href="/admin" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Activity
            </a>
            <a href="/admin/system-events" className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Raw events
            </a>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Could not load billing lifecycle data. {error.message}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Trial Ends</th>
                  <th className="px-4 py-3">Period Ends</th>
                  <th className="px-4 py-3">Stripe</th>
                  <th className="px-4 py-3">Block</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map(profile => (
                  <tr key={profile.user_id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{emails.get(profile.user_id) ?? profile.user_id.slice(0, 8)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{profile.subscription_tier ?? profile.tier ?? 'free_trial'}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${badgeClass(profile.access_blocked_at ? 'blocked' : profile.subscription_status)}`}>
                        {profile.access_blocked_at ? 'blocked' : profile.subscription_status ?? 'trialing'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(profile.trial_ends_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDate(profile.subscription_current_period_end)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      <div>{profile.stripe_customer_id ? profile.stripe_customer_id.slice(0, 18) : 'no customer'}</div>
                      <div>{profile.stripe_subscription_id ? profile.stripe_subscription_id.slice(0, 18) : 'no subscription'}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{profile.access_block_reason ?? 'none'}</td>
                  </tr>
                ))}
                {profiles.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No profiles found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  )
}
