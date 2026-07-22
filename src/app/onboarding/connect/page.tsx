'use client'

import { Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { GoogleCalendarSection } from '@/components/settings/GoogleCalendarSection'

function JiraCard() {
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4">Jira</h2>
      <p className="text-sm text-gray-500 mb-3">
        Connect Jira to log time directly against your issues from Time Translator.
      </p>
      <a
        href="/api/jira/oauth/start"
        className="inline-flex items-center gap-2 rounded-md bg-[#0052CC] px-4 py-2 text-sm font-medium text-white hover:bg-[#0047B3] transition-colors"
      >
        Connect to Jira
      </a>
    </div>
  )
}

function IcsInstructionsCard() {
  return (
    <div className="rounded-lg bg-white border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Prefer not to connect an account?</h2>
      <p className="text-xs text-gray-400 mb-4">
        You can upload a calendar file instead — no permissions granted to Time Translator.
      </p>
      <ol className="space-y-2 text-sm text-gray-600 list-decimal list-inside">
        <li>In Google Calendar, go to Settings → your calendar → &quot;Export calendar&quot;.</li>
        <li>This downloads a .ics file to your computer.</li>
        <li>Head to Settings in Time Translator and upload it under &quot;Linked calendars&quot;.</li>
      </ol>
    </div>
  )
}

function OnboardingConnectInner() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="mx-auto max-w-2xl px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Connect your sources</h1>
          <p className="mt-1 text-sm text-gray-500">
            Choose how you&apos;d like to bring your calendar and work items into Time Translator.
            All of these are optional and can be changed later in Settings.
          </p>
        </div>

        <GoogleCalendarSection />
        <JiraCard />
        <IcsInstructionsCard />

        <div className="flex justify-end">
          <button
            onClick={() => router.push('/upload')}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingConnectPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-sm text-gray-400">Loading…</div>}>
      <OnboardingConnectInner />
    </Suspense>
  )
}
