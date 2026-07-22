'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { DisconnectConfirmModal } from '@/components/settings/DisconnectConfirmModal'
import { useGoogleCalendarImport, getToday, twoYearsAgo } from '@/hooks/useGoogleCalendarImport'

export function GoogleCalendarSection() {
  const searchParams = useSearchParams()
  const justConnected = searchParams.get('gcal_connected') === '1'
  const connectError = searchParams.get('gcal_error')

  const [connected, setConnected] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [checkingSwitch, setCheckingSwitch] = useState(false)
  const [switchWarning, setSwitchWarning] = useState<string[] | null>(null)

  const {
    startDate,
    endDate,
    syncing,
    syncError,
    dateRangeTooLong,
    handleStartDateChange,
    handleEndDateChange,
    handleImport,
  } = useGoogleCalendarImport()

  useEffect(() => {
    fetch('/api/google-calendar/credentials')
      .then(r => r.json())
      .then(d => { setConnected(!!d.connected); setEmail(d.email ?? null); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleDisconnect() {
    setDisconnecting(true)
    const res = await fetch('/api/google-calendar/oauth/disconnect', { method: 'POST' })
    setDisconnecting(false)
    setShowConfirm(false)
    if (res.ok) {
      setConnected(false)
      setEmail(null)
    }
  }

  // Before starting OAuth, warn ICS-mode users that connecting Google Calendar
  // replaces their linked .ics calendar. Nothing is destroyed until the OAuth
  // callback succeeds, so cancelling (or abandoning consent) is safe.
  async function handleConnectClick() {
    setCheckingSwitch(true)
    try {
      const res = await fetch('/api/calendars')
      const data = res.ok ? await res.json() : { calendars: [] }
      const names = (data.calendars ?? []).map((c: { calendar_name: string }) => c.calendar_name)
      if (names.length > 0) {
        setSwitchWarning(names)
        return
      }
    } catch { /* fall through to connect */ }
    finally { setCheckingSwitch(false) }
    window.location.href = '/api/google-calendar/oauth/start'
  }

  if (loading) return null

  return (
    <div id="google-calendar" className="rounded-lg bg-white border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Google Calendar</h2>

      {justConnected && (
        <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
          Google Calendar connected successfully.
        </div>
      )}
      {connectError && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          Could not connect Google Calendar. Please try again.
        </div>
      )}

      {connected ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm text-gray-700">Connected{email ? ` as ${email}` : ''}</span>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-md">
            <div>
              <label className="block text-sm font-medium text-gray-700">From</label>
              <input
                type="date"
                value={startDate}
                min={twoYearsAgo()}
                max={endDate || getToday()}
                onChange={e => handleStartDateChange(e.target.value)}
                className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-blue-500/30 ${dateRangeTooLong ? 'border-red-300 focus:border-red-400' : 'border-gray-300 focus:border-blue-500'}`}
              />
              {dateRangeTooLong && (
                <p className="mt-1 text-xs text-red-600">Date range cannot exceed 90 days.</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={getToday()}
                onChange={e => handleEndDateChange(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
          </div>
          {syncError && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{syncError}</div>
          )}
          <div className="flex gap-3">
            <Button onClick={handleImport} disabled={syncing || dateRangeTooLong}>
              {syncing ? 'Importing…' : 'Import Events'}
            </Button>
            <Button variant="secondary" onClick={() => setShowConfirm(true)}>
              Disconnect
            </Button>
          </div>
          <p className="text-xs text-gray-400">Import events from the selected date range. Time Translator will then suggest matches for your review prior to generating outputs.</p>
          <p className="text-xs text-gray-400">While Google Calendar is connected it is your one linked calendar. Disconnecting re-enables .ics file upload.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Connecting your Google Calendar allows Time Translator to see your calendar events and their details.
            We request &quot;read-only&quot; access. Time Translator never creates, edits, or deletes calendar events.
          </p>
          <button
            type="button"
            onClick={handleConnectClick}
            disabled={checkingSwitch}
            className="inline-flex items-center gap-2 rounded-md bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:bg-[#3367D6] transition-colors disabled:opacity-60"
          >
            Connect Google Calendar
          </button>
        </div>
      )}

      {switchWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900">Switching to Google Calendar sync</h3>
            <p className="mt-3 text-sm text-gray-600">
              Connecting Google Calendar means you&apos;ll import time straight from your calendar and will no
              longer upload .ics files. Your current linked calendar{' '}
              ({switchWarning.map(n => `"${n}"`).join(', ')}) will be replaced. You can switch back later by
              disconnecting Google Calendar.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSwitchWarning(null)}>Cancel</Button>
              <a
                href="/api/google-calendar/oauth/start"
                className="inline-flex items-center gap-2 rounded-md bg-[#4285F4] px-4 py-2 text-sm font-medium text-white hover:bg-[#3367D6] transition-colors"
              >
                Connect Google Calendar
              </a>
            </div>
          </div>
        </div>
      )}

      {showConfirm && (
        <DisconnectConfirmModal
          serviceName="Google Calendar"
          confirming={disconnecting}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleDisconnect}
        />
      )}
    </div>
  )
}
