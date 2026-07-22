'use client'

import { useEffect, useState } from 'react'

interface Props {
  /** Optional label override */
  label?: string
}

type Status = 'loading' | 'eligible' | 'done'

export function ReferralField({ label = 'Were you referred by someone?' }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/referral/status')
      .then(r => r.json())
      .then(d => setStatus(d.hasReferral ? 'done' : 'eligible'))
      .catch(() => setStatus('done')) // fail silently — hide the field
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/referral/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referrerEmail: trimmed }),
    })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) {
      setError(data.error ?? 'Could not save referral.')
      return
    }
    setSaved(true)
    setStatus('done')
  }

  if (status === 'loading' || status === 'done' || saved) return null

  return (
    <div className="rounded-lg border border-[#DCEEF5] bg-[#FBFBF8] p-4">
      <p className="text-sm font-medium text-[#26333A] mb-3">{label}</p>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="their@email.com"
          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-[#26333A] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#3F7C85]/40"
        />
        <button
          type="submit"
          disabled={saving || !email.trim()}
          className="rounded-lg bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white hover:bg-[#356D75] disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <p className="mt-2 text-xs text-gray-400">Enter the email address of the person who referred you. This can only be set once.</p>
    </div>
  )
}

export function ReferralSettingsSection() {
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    fetch('/api/referral/status')
      .then(r => r.json())
      .then(d => setStatus(d.hasReferral ? 'done' : 'eligible'))
      .catch(() => setStatus('done'))
  }, [])

  if (status !== 'eligible') return null

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Referral</h2>
      <p className="text-xs text-gray-400 mb-4">
        If someone referred you to Time Translator, enter their email and they&apos;ll get a reward when you upgrade.
      </p>
      <ReferralField label="Referred by" />
    </div>
  )
}
