'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trackClientEvent } from '@/lib/client-events'

const WARNING_AFTER_MS = 25 * 60 * 1000
const SIGN_OUT_AFTER_MS = 30 * 60 * 1000

const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart']

export function InactivityTimer() {
  const pathname = usePathname()
  const warningTimer = useRef<number | null>(null)
  const signOutTimer = useRef<number | null>(null)
  const [signedIn, setSignedIn] = useState(false)
  const [showWarning, setShowWarning] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user))
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!signedIn || pathname.startsWith('/login') || pathname.startsWith('/auth')) return

    const supabase = createClient()

    function clearTimers() {
      if (warningTimer.current) window.clearTimeout(warningTimer.current)
      if (signOutTimer.current) window.clearTimeout(signOutTimer.current)
    }

    async function signOut() {
      clearTimers()
      trackClientEvent({
        eventType: 'inactive_logout',
        route: pathname,
        action: 'inactive_logout',
        status: 'success',
      })
      await supabase.auth.signOut()
      window.location.href = '/login?reason=inactive'
    }

    function resetTimers() {
      setShowWarning(false)
      clearTimers()
      warningTimer.current = window.setTimeout(() => setShowWarning(true), WARNING_AFTER_MS)
      signOutTimer.current = window.setTimeout(signOut, SIGN_OUT_AFTER_MS)
    }

    resetTimers()
    ACTIVITY_EVENTS.forEach(event => window.addEventListener(event, resetTimers, { passive: true }))

    return () => {
      clearTimers()
      ACTIVITY_EVENTS.forEach(event => window.removeEventListener(event, resetTimers))
    }
  }, [pathname, signedIn])

  if (!showWarning || !signedIn) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#26333A]/45 px-5 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] border border-[#DCEEF5] bg-white p-6 shadow-[0_26px_80px_rgba(38,51,58,0.22)]">
        <h2 className="text-xl font-extrabold tracking-[-0.035em] text-[#26333A]">Still there?</h2>
        <p className="mt-3 text-sm leading-6 text-[#66747A]">
          For your security, Time Translator will sign you out after 30 minutes of inactivity.
        </p>
        <button
          type="button"
          onClick={() => setShowWarning(false)}
          className="mt-5 w-full rounded-full bg-[#3F7C85] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-[#356D75]"
        >
          Keep me signed in
        </button>
      </div>
    </div>
  )
}
