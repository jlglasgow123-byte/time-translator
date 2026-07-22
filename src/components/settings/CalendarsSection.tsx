'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'

interface LinkedCalendar {
  id: string
  calendar_name: string
  created_at: string
}

interface Props {
  tier: string
}

export function CalendarsSection({ tier }: Props) {
  const [calendars, setCalendars] = useState<LinkedCalendar[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ICS detect flow
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<string | null>(null)
  const [detectError, setDetectError] = useState<string | null>(null)

  // Pro warning modal
  const [showWarning, setShowWarning] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Add state
  const [adding, setAdding] = useState(false)

  const isTrial = tier === 'free_trial'
  const isPro = tier === 'paid_single_user'
  const isMaxPower = tier === 'max_power'
  const canLink = isTrial || isPro || isMaxPower
  const hasCalendar = calendars.length > 0
  const proLocked = isPro && hasCalendar

  useEffect(() => {
    fetch('/api/calendars')
      .then(r => r.json())
      .then(d => { setCalendars(d.calendars ?? []); setLoading(false) })
      .catch(() => { setError('Could not load linked calendars.'); setLoading(false) })
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!fileInputRef.current) return
    fileInputRef.current.value = ''
    if (!file) return

    setDetecting(true)
    setDetected(null)
    setDetectError(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/calendars/detect', { method: 'POST', body: formData })
    const data = await res.json()
    setDetecting(false)

    if (!res.ok) {
      setDetectError(data.error ?? 'Could not detect calendar name.')
      return
    }

    setDetected(data.calendar_name)

    // Pro: show warning modal before confirming
    if (isPro) {
      setShowWarning(true)
    }
  }

  async function confirmLink() {
    if (!detected) return
    setConfirming(true)
    setAdding(true)

    const res = await fetch('/api/calendars', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ calendar_name: detected }),
    })
    const data = await res.json()

    setConfirming(false)
    setAdding(false)
    setShowWarning(false)

    if (!res.ok) {
      setDetectError(data.error ?? 'Could not link calendar.')
      setDetected(null)
      return
    }

    setCalendars(prev => [...prev, data.calendar])
    setDetected(null)
  }

  async function handleRemove(id: string) {
    const res = await fetch(`/api/calendars/${id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Could not remove calendar.')
      return
    }
    setCalendars(prev => prev.filter(c => c.id !== id))
  }

  if (loading) return null

  return (
    <div className="rounded-lg bg-white border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Linked calendars</h2>
      <p className="text-xs text-gray-400 mb-4">
        {proLocked
          ? 'Pro accounts only allow one calendar to be linked. Upgrade to a Max Power account to link more calendars to your Time Translator account.'
          : isPro
            ? 'Upload a sample .ics file to connect and link your calendar.'
            : isTrial || isMaxPower
              ? 'Upload a sample .ics file to connect and link a calendar. You can link multiple.'
              : 'Calendar linking is available on Pro and Max Power plans.'}
      </p>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Linked calendars list */}
      {hasCalendar && (
        <ul className="mb-4 space-y-2">
          {calendars.map(cal => (
            <li key={cal.id} className="flex items-center justify-between rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-[#3f7c85]" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
                </svg>
                <span className="text-sm font-medium text-[#26333A]">{cal.calendar_name}</span>
              </div>
              {isPro ? null : ( // trial and Max Power can remove freely
                <button
                  onClick={() => handleRemove(cal.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200 transition-colors"
                >
                  <span aria-hidden="true">⚠️</span>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Link a new calendar */}
      {canLink && !proLocked && (
        <div>
          {detected && !showWarning ? (
            <div className="rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Detected calendar</p>
                <p className="text-sm font-semibold text-[#26333A]">{detected}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setDetected(null)}>Cancel</Button>
                <Button onClick={confirmLink} loading={adding}>Link this calendar</Button>
              </div>
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".ics"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                variant="secondary"
                loading={detecting}
                onClick={() => fileInputRef.current?.click()}
              >
                {detecting ? 'Connecting…' : '+ Upload .ics to connect calendar'}
              </Button>
              {detectError && (
                <p className="mt-2 text-xs text-red-600">{detectError}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pro warning modal */}
      {showWarning && detected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-center text-lg font-semibold text-gray-900">This is your one calendar</h2>
            <p className="mt-2 text-center text-sm text-gray-900">
              Pro accounts are permanently linked to a single calendar. Once linked, you cannot change it without contacting support.
            </p>
            <div className="mt-4 rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 text-center">
              <p className="text-xs text-gray-600 mb-0.5">You are linking</p>
              <p className="text-sm font-semibold text-gray-900">{detected}</p>
            </div>
            <p className="mt-3 text-center text-xs text-gray-600">
              Need multiple calendars?{' '}
              <a href="/settings#plan" className="underline text-[#3f7c85]">Upgrade to Max Power</a>.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowWarning(false); setDetected(null) }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmLink}
                disabled={confirming}
                className="flex-1 rounded-xl bg-[#3f7c85] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#2e5f67] disabled:opacity-60 transition-colors"
              >
                {confirming ? 'Linking…' : 'Yes, link this calendar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!canLink && (
        <p className="text-xs text-gray-400">
          Start a free trial or <a href="/settings#plan" className="underline text-[#3f7c85]">upgrade to Pro</a> to link a calendar.
        </p>
      )}
    </div>
  )
}
