'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash — exchangeCodeForSession
    // handles both ?code= (PKCE) and the hash-based recovery flow.
    const supabase = createClient()
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError('This reset link has expired or is invalid. Please request a new one.')
        } else {
          setReady(true)
        }
      })
    } else {
      // Hash-based recovery (older Supabase flow)
      const { data: listener } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') setReady(true)
      })
      return () => listener.subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
    } else {
      router.replace('/upload')
    }
    setLoading(false)
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[#FBFBF8] px-5"
      style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
    >
      <div className="w-full max-w-md rounded-[36px] border border-[rgba(38,51,58,0.08)] bg-white shadow-[0_26px_80px_rgba(38,51,58,0.12)]">
        <div className="border-b border-[#DCEEF5] px-7 py-6">
          <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.045em] text-[#26333A]">
            Set a new password
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#66747A]">
            Choose a strong password for your Time Translator account.
          </p>
        </div>

        {!ready && !error && (
          <div className="px-7 py-7">
            <p className="text-sm text-[#66747A]">Verifying your reset link…</p>
          </div>
        )}

        {error && (
          <div className="px-7 py-7 space-y-5">
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            <a
              href="/login"
              className="block w-full rounded-full bg-[#26333A] px-5 py-3.5 text-center text-sm font-extrabold text-white transition-colors hover:bg-[#314149]"
            >
              Back to sign in
            </a>
          </div>
        )}

        {ready && (
          <form onSubmit={handleSubmit} className="space-y-4 px-7 py-7">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#26333A]">New password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
                placeholder="At least 8 characters"
                className="w-full rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3.5 text-base text-[#26333A] outline-none transition placeholder:text-[#8A989E] focus:border-[#3F7C85] focus:bg-white focus:ring-4 focus:ring-[#8FD5C3]/30"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-bold text-[#26333A]">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                placeholder="Repeat your new password"
                className="w-full rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3.5 text-base text-[#26333A] outline-none transition placeholder:text-[#8A989E] focus:border-[#3F7C85] focus:bg-white focus:ring-4 focus:ring-[#8FD5C3]/30"
              />
            </div>
            {error && (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-[#3F7C85] px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(63,124,133,0.22)] transition hover:-translate-y-0.5 hover:bg-[#356D75] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Saving…' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
