'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { loadFormConfig, setLocalDefaultProjectKey } from '@/lib/storage'

interface Props {
  // Called with the default project once it is known (account value, or the browser's
  // value that the next import will adopt). Lets a page keep its own copy in step.
  onResolvedKey?: (key: string) => void
  className?: string
}

// Big, hard-to-miss warning shown when Jira is connected but no default project is
// set. Without one, events with no Jira key in the title can't be AI-matched at all —
// imports still "work" but every such meeting comes back unmatched.
export function NoDefaultProjectWarning({ onResolvedKey, className = '' }: Props) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/jira/credentials').then(r => (r.ok ? r.json() : null)),
      fetch('/api/preferences').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([creds, prefs]) => {
        if (cancelled) return
        // If the account can't be read, stay quiet rather than raise a false alarm.
        if (!creds || !prefs) return
        let key = ''
        if (prefs.saved) {
          key = prefs.defaultProjectKey ?? ''
          setLocalDefaultProjectKey(key)
        } else {
          // Never saved to the account yet: the next import adopts the browser value.
          key = loadFormConfig()?.defaultProjectKey ?? ''
        }
        onResolvedKey?.(key)
        setShow(Boolean(creds.connected) && !key)
      })
      .catch(() => { /* stay quiet — see above */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!show) return null

  return (
    <div
      role="alert"
      className={`rounded-[28px] border-2 border-red-400 bg-red-50 p-5 sm:p-6 ${className}`}
    >
      <div className="flex items-start gap-4">
        <svg className="mt-0.5 h-7 w-7 shrink-0 text-red-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div className="min-w-0">
          <p className="text-lg font-extrabold text-red-900">No default Jira project set</p>
          <p className="mt-1 text-sm leading-6 text-red-900">
            Time Translator can&apos;t match your meetings to Jira tickets until you choose one. Only events with
            a ticket number in the title (like <span className="font-mono">ABC-123</span>) will be matched —
            everything else will come back unmatched.
          </p>
          <Link
            href="/settings?pick_project=1"
            className="mt-4 inline-flex items-center rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 transition-colors"
          >
            Choose your default project
          </Link>
        </div>
      </div>
    </div>
  )
}
