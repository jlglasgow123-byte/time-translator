'use client'

import { useState } from 'react'

interface UserRow {
  user_id: string
  email: string
  tier: string | null
  subscription_status: string | null
  trial_started_at: string | null
  trial_ends_at: string | null
  access_blocked_at: string | null
}

function formatDateShort(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-AU', { dateStyle: 'short', timeZone: 'Australia/Sydney' }).format(new Date(value))
}

function badgeClass(value: string | null | undefined) {
  if (value === 'active' || value === 'trialing' || value === 'success') return 'bg-green-50 text-green-700 border-green-200'
  if (value === 'past_due' || value === 'warning' || value === 'failed') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (value === 'canceled' || value === 'error' || value === 'blocked' || value === 'suspended') return 'bg-red-50 text-red-700 border-red-200'
  return 'bg-gray-50 text-gray-600 border-gray-200'
}

export default function AdminUsersPanel({ initialUsers }: { initialUsers: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null)

  async function handleSuspend(user: UserRow) {
    const suspend = !user.access_blocked_at
    setLoadingId(user.user_id)
    try {
      const res = await fetch(`/api/admin/users/${user.user_id}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend, reason: 'Suspended by admin' }),
      })
      if (!res.ok) throw new Error('Failed')
      setUsers(prev =>
        prev.map(u =>
          u.user_id === user.user_id
            ? { ...u, access_blocked_at: suspend ? new Date().toISOString() : null }
            : u
        )
      )
    } catch {
      alert('Action failed. Please try again.')
    } finally {
      setLoadingId(null)
    }
  }

  async function handleDelete(user: UserRow) {
    setConfirmDelete(null)
    setLoadingId(user.user_id)
    try {
      const res = await fetch(`/api/admin/users/${user.user_id}/delete`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed')
      setUsers(prev => prev.filter(u => u.user_id !== user.user_id))
    } catch {
      alert('Delete failed. Please try again.')
    } finally {
      setLoadingId(null)
    }
  }

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">All users ({users.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Trial started</th>
                <th className="px-4 py-2">Trial ends</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => {
                const isSuspended = Boolean(u.access_blocked_at)
                const isLoading = loadingId === u.user_id
                return (
                  <tr key={u.user_id} className={isSuspended ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2 text-gray-800">
                      {u.email}
                      {isSuspended && (
                        <span className="ml-2 inline-flex rounded-full border px-1.5 py-0.5 text-xs font-medium bg-red-50 text-red-700 border-red-200">suspended</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{u.tier ?? 'free_trial'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass(u.subscription_status ?? 'trialing')}`}>
                        {u.subscription_status ?? 'trialing'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{formatDateShort(u.trial_started_at)}</td>
                    <td className="px-4 py-2 text-gray-500">{formatDateShort(u.trial_ends_at)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSuspend(u)}
                          disabled={isLoading}
                          className={`rounded px-2 py-1 text-xs font-medium border transition disabled:opacity-50 ${
                            isSuspended
                              ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100'
                              : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          }`}
                        >
                          {isLoading ? '…' : isSuspended ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          onClick={() => setConfirmDelete(u)}
                          disabled={isLoading}
                          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Delete user?</h3>
            <p className="mt-2 text-sm text-gray-600">
              This will permanently delete <span className="font-medium">{confirmDelete.email}</span> and all their data. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Yes, delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
