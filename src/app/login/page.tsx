'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { trackClientEvent } from '@/lib/client-events'


type ModalMode = 'signin' | 'signin_password' | 'signup' | 'signup_password' | 'magic_sent' | 'reset_sent'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referredBy, setReferredBy] = useState('')
  const [signupOpen, setSignupOpen] = useState(false)
  const [mode, setMode] = useState<ModalMode>('signin')

  useEffect(() => {
    const supabase = createClient()
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')
    const requestedNext = searchParams.get('next') ?? '/upload'
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/upload'

    if (window.location.hash === '#signup') {
      setSignupOpen(true)
      setMode('signup')
    }

    async function exchangeLoginCode() {
      if (!code) return false
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        setError(error.message)
        setSignupOpen(true)
        return true
      }
      router.replace(next)
      return true
    }

    function openSignupFromHash() {
      if (window.location.hash === '#signup') {
        setSignupOpen(true)
        setMode('signup')
      }
    }

    function openSignupFromNav() {
      setMode('signup')
      setSignupOpen(true)
    }

    function openSigninFromNav() {
      setError(null)
      setMode('signin')
      setSignupOpen(true)
    }

    function resetOauthOnFocus() {
      setOauthLoading(false)
    }

    window.addEventListener('hashchange', openSignupFromHash)
    window.addEventListener('open-signup', openSignupFromNav)
    window.addEventListener('open-signin', openSigninFromNav)
    window.addEventListener('focus', resetOauthOnFocus)

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.replace(next)
    })

    exchangeLoginCode()

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) router.replace(next)
    })

    return () => {
      listener.subscription.unsubscribe()
      window.removeEventListener('hashchange', openSignupFromHash)
      window.removeEventListener('open-signup', openSignupFromNav)
      window.removeEventListener('open-signin', openSigninFromNav)
      window.removeEventListener('focus', resetOauthOnFocus)
    }
  }, [router])

  function openModal(initialMode: ModalMode = 'signin') {
    setError(null)
    setMode(initialMode)
    setSignupOpen(true)
  }

  function handleSigninEmailContinue(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPassword('')
    setShowPassword(false)
    setMode('signin_password')
  }

  function handleSignupDetailsContinue(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setPassword('')
    setShowPassword(false)
    setMode('signup_password')
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()

    if (mode === 'signup_password') {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding/connect`,
          data: { first_name: firstName, last_name: lastName },
        },
      })
      if (error) {
        trackClientEvent({ eventType: 'signup_failed', severity: 'warning', route: '/login', action: 'signup', status: 'failed', errorCode: 'signup_failed', details: { reason: error.message } })
        setError(error.message)
      } else {
        trackClientEvent({ eventType: 'signup_success', route: '/login', action: 'signup', status: 'success' })
        if (referredBy.trim()) {
          fetch('/api/referral/record', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ referrerEmail: referredBy.trim() }),
          }).catch(() => {/* non-critical, silently ignore */})
        }
        setMode('magic_sent')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        trackClientEvent({ eventType: 'password_signin_failed', severity: 'warning', route: '/login', action: 'signin', status: 'failed', errorCode: 'password_signin_failed', details: { reason: error.message } })
        setError(error.message)
      } else {
        trackClientEvent({ eventType: 'password_signin_success', route: '/login', action: 'signin', status: 'success' })
      }
    }
    setLoading(false)
  }

  async function handleForgotPassword() {
    if (!email) {
      setError('Enter your email address first, then click Forgot password.')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setError(error.message)
    } else {
      setMode('reset_sent')
    }
    setLoading(false)
  }

  async function handleMagicLink() {
    if (!email) {
      setError('Enter your email address first.')
      return
    }
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/upload` },
    })
    if (error) {
      trackClientEvent({ eventType: 'magic_link_request_failed', severity: 'warning', route: '/login', action: 'magic_link_requested', status: 'failed', errorCode: 'magic_link_request_failed', details: { reason: error.message } })
      setError(error.message)
    } else {
      trackClientEvent({ eventType: 'magic_link_requested', route: '/login', action: 'magic_link_requested', status: 'success' })
      setMode('magic_sent')
    }
    setLoading(false)
  }

  async function handleGoogleSignIn() {
    setOauthLoading(true)
    setError(null)
    trackClientEvent({ eventType: 'oauth_started', route: '/login', action: 'oauth_started', status: 'started', details: { provider: 'google' } })
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/upload` },
    })
    if (error) {
      trackClientEvent({ eventType: 'oauth_start_failed', severity: 'warning', route: '/login', action: 'oauth_started', status: 'failed', errorCode: 'oauth_start_failed', details: { provider: 'google', reason: error.message } })
      setError(error.message)
      setOauthLoading(false)
    }
  }

  return (
    <main
      className="relative bg-[#FBFBF8] text-[#26333A]"
      style={{ fontFamily: 'var(--font-plus-jakarta), system-ui, sans-serif' }}
    >
      <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 lg:py-24">
        <div>
          <h1 className="text-4xl font-extrabold leading-[0.96] tracking-[-0.055em] text-[#26333A] sm:text-6xl lg:text-7xl">
            <span className="block">Connect your calendar once.</span>
            <span className="mt-2 block bg-gradient-to-r from-[#3F7C85] to-[#8FD5C3] bg-clip-text text-transparent sm:mt-3">
              Get timesheets, invoices,<br className="hidden sm:block" /> and exports — automatically.
            </span>
          </h1>
          <p className="mt-6 text-base leading-7 text-[#66747A] sm:text-xl sm:leading-8 sm:mt-7">
            Your Google Calendar already has everything. Time Translator turns it into the billing documents you need.
          </p>
          <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-start">
            <button
              type="button"
              onClick={() => openModal('signup')}
              className="inline-flex items-center justify-center rounded-full bg-[#3F7C85] px-7 py-4 text-base font-extrabold text-white transition hover:-translate-y-0.5 hover:bg-[#356D75]"
            >
              Create an account for free
            </button>
            <button
              type="button"
              onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-[#26333A] px-7 py-4 text-base font-semibold text-[#26333A] transition hover:border-[#3F7C85] hover:text-[#3F7C85]"
            >
              See how it works →
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#8A989E]">
            <span className="flex items-center gap-1.5">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="#8A989E" strokeWidth="1.5"/>
                <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="#8A989E" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Read-only access
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 2l1.5 3 3.5.5-2.5 2.5.5 3.5L8 10l-3 1.5.5-3.5L3 5.5 6.5 5z" stroke="#8A989E" strokeWidth="1.3" strokeLinejoin="round"/>
              </svg>
              No manual entry
            </span>
            <span className="flex items-center gap-1.5">
              <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="#8A989E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Export to Jira or Xero
            </span>
          </div>
        </div>
      </div>

      <HowItWorksSection />
      <PricingSection onStartFree={() => openModal('signup')} />
      <PainSection />
      <ShiftSection />
      <FeaturesSection />
      <IntegrationsSection />
      <FinalCtaSection onSignUp={() => openModal('signup')} />

      {signupOpen && (
        <AuthModal
          email={email}
          firstName={firstName}
          lastName={lastName}
          password={password}
          referredBy={referredBy}
          showPassword={showPassword}
          mode={mode}
          loading={loading}
          oauthLoading={oauthLoading}
          error={error}
          onEmailChange={setEmail}
          onFirstNameChange={setFirstName}
          onLastNameChange={setLastName}
          onPasswordChange={setPassword}
          onReferredByChange={setReferredBy}
          onToggleShowPassword={() => setShowPassword(v => !v)}
          onGoogleSignIn={handleGoogleSignIn}
          onSigninEmailContinue={handleSigninEmailContinue}
          onSignupDetailsContinue={handleSignupDetailsContinue}
          onSubmit={handlePasswordSubmit}
          onForgotPassword={handleForgotPassword}
          onSwitchMode={(m) => { setError(null); setMode(m) }}
          onClose={() => setSignupOpen(false)}
        />
      )}
    </main>
  )
}

function AuthModal({
  email,
  firstName,
  lastName,
  password,
  referredBy,
  showPassword,
  mode,
  loading,
  oauthLoading,
  error,
  onEmailChange,
  onFirstNameChange,
  onLastNameChange,
  onPasswordChange,
  onReferredByChange,
  onToggleShowPassword,
  onGoogleSignIn,
  onSigninEmailContinue,
  onSignupDetailsContinue,
  onSubmit,
  onForgotPassword,
  onSwitchMode,
  onClose,
}: {
  email: string
  firstName: string
  lastName: string
  password: string
  referredBy: string
  showPassword: boolean
  mode: ModalMode
  loading: boolean
  oauthLoading: boolean
  error: string | null
  onEmailChange: (v: string) => void
  onFirstNameChange: (v: string) => void
  onLastNameChange: (v: string) => void
  onPasswordChange: (v: string) => void
  onReferredByChange: (v: string) => void
  onToggleShowPassword: () => void
  onGoogleSignIn: () => void
  onSigninEmailContinue: (e: React.FormEvent) => void
  onSignupDetailsContinue: (e: React.FormEvent) => void
  onSubmit: (e: React.FormEvent) => void
  onForgotPassword: () => void
  onSwitchMode: (m: ModalMode) => void
  onClose: () => void
}) {
  const overlayClass = "fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 py-8"
  const cardClass = "relative w-full max-w-sm rounded-2xl bg-[#1a1a1a] px-8 py-10 shadow-2xl"
  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute right-4 top-4 text-[#666] transition hover:text-white"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  )

  if (mode === 'magic_sent') {
    return (
      <div className={overlayClass} onClick={onClose}>
        <div className={cardClass} onClick={e => e.stopPropagation()}>
          {closeButton}
          <div className="mb-6 flex justify-center">
            <LogoMark compact />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Check your email</h2>
          <p className="mb-6 text-center text-sm text-[#999]">
            We sent a confirmation link to <strong className="text-white">{email}</strong>.
          </p>
          <button
            type="button"
            onClick={() => onSwitchMode('signin')}
            className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0]"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'reset_sent') {
    return (
      <div className={overlayClass} onClick={onClose}>
        <div className={cardClass} onClick={e => e.stopPropagation()}>
          {closeButton}
          <div className="mb-6 flex justify-center">
            <LogoMark compact />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Check your email</h2>
          <p className="mb-6 text-center text-sm text-[#999]">
            We sent a reset link to <strong className="text-white">{email}</strong>. Follow the link to set a new password.
          </p>
          <button
            type="button"
            onClick={() => onSwitchMode('signin')}
            className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0]"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  // Sign in — email step
  if (mode === 'signin') {
    return (
      <div className={overlayClass} onClick={onClose}>
        <div className={cardClass} onClick={e => e.stopPropagation()}>
          {closeButton}
          <div className="mb-6 flex justify-center">
            <LogoMark compact />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Sign in</h2>
          <form onSubmit={onSigninEmailContinue} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
              />
            </div>
            {error && <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading || oauthLoading}
              className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0] disabled:opacity-60"
            >
              Continue
            </button>
          </form>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#333]" />
            <span className="text-xs text-[#666]">OR</span>
            <div className="h-px flex-1 bg-[#333]" />
          </div>
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={oauthLoading || loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#444] bg-transparent py-3.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            <GoogleMark />
            {oauthLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
          <p className="mt-2 text-center text-xs text-[#666]">
            This only signs you in. Time Translator doesn't access your Google Calendar unless you decide to connect it later.
          </p>
          <p className="mt-5 text-center text-sm text-[#888]">
            {"Don't have an account? "}
            <button
              type="button"
              onClick={() => onSwitchMode('signup')}
              className="font-semibold text-[#7ec8d4] hover:underline"
            >
              Sign up
            </button>
          </p>
        </div>
      </div>
    )
  }

  // Sign in — password step
  if (mode === 'signin_password') {
    return (
      <div className={overlayClass} onClick={onClose}>
        <div className={cardClass} onClick={e => e.stopPropagation()}>
          {closeButton}
          <div className="mb-6 flex justify-center">
            <LogoMark compact />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Sign in</h2>
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => onPasswordChange(e.target.value)}
                  required
                  autoFocus
                  placeholder="Your password"
                  className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 pr-11 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
                />
                <button
                  type="button"
                  onClick={onToggleShowPassword}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#aaa]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <div className="mt-1.5 flex justify-end">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={loading}
                  className="text-xs text-[#7ec8d4] hover:underline disabled:opacity-50"
                >
                  Forgot password?
                </button>
              </div>
            </div>
            {error && <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading || oauthLoading}
              className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0] disabled:opacity-60"
            >
              {loading ? 'Signing in...' : 'Continue'}
            </button>
          </form>
          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => onSwitchMode('signin')}
              className="text-sm text-[#888] hover:text-white"
            >
              ‹ Go back
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Sign up — details step
  if (mode === 'signup') {
    return (
      <div className={overlayClass} onClick={onClose}>
        <div className={cardClass} onClick={e => e.stopPropagation()}>
          {closeButton}
          <div className="mb-6 flex justify-center">
            <LogoMark compact />
          </div>
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Sign up</h2>
          <form onSubmit={onSignupDetailsContinue} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-white">First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => onFirstNameChange(e.target.value)}
                  required
                  autoFocus
                  placeholder="Jenny"
                  className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-white">Last name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => onLastNameChange(e.target.value)}
                  required
                  placeholder="Smith"
                  className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => onEmailChange(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">
                Referred by <span className="font-normal text-[#888]">(optional)</span>
              </label>
              <input
                type="email"
                value={referredBy}
                onChange={e => onReferredByChange(e.target.value)}
                placeholder="friend@example.com"
                className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
              />
              <Link href="/help#referral-program" className="mt-1.5 inline-block text-xs text-[#8FD5C3] hover:underline">
                How does Time Translator reward me and my friends?
              </Link>
            </div>
            {error && <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading || oauthLoading}
              className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0] disabled:opacity-60"
            >
              Continue
            </button>
          </form>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#333]" />
            <span className="text-xs text-[#666]">OR</span>
            <div className="h-px flex-1 bg-[#333]" />
          </div>
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={oauthLoading || loading}
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#444] bg-transparent py-3.5 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            <GoogleMark />
            {oauthLoading ? 'Connecting...' : 'Continue with Google'}
          </button>
          <p className="mt-2 text-center text-xs text-[#666]">
            This only signs you in. Time Translator doesn't access your Google Calendar unless you decide to connect it later.
          </p>
          <p className="mt-5 text-center text-sm text-[#888]">
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => onSwitchMode('signin')}
              className="font-semibold text-[#7ec8d4] hover:underline"
            >
              Sign in
            </button>
          </p>
        </div>
      </div>
    )
  }

  // Sign up — password step
  return (
    <div className={overlayClass} onClick={onClose}>
      <div className={cardClass} onClick={e => e.stopPropagation()}>
        {closeButton}
        <div className="mb-6 flex justify-center">
          <LogoMark />
        </div>
        <h2 className="mb-6 text-center text-2xl font-bold text-white">Sign up</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => onPasswordChange(e.target.value)}
                required
                autoFocus
                placeholder="Create a password"
                minLength={8}
                className="w-full rounded-lg border border-[#333] bg-[#2a2a2a] px-4 py-3 pr-11 text-sm text-white outline-none placeholder:text-[#666] focus:border-[#555]"
              />
              <button
                type="button"
                onClick={onToggleShowPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] hover:text-[#aaa]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={loading || oauthLoading}
            className="w-full rounded-lg bg-[#f5f0e8] py-3.5 text-sm font-semibold text-black transition hover:bg-[#ede8e0] disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Continue'}
          </button>
        </form>
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={() => onSwitchMode('signup')}
            className="text-sm text-[#888] hover:text-white"
          >
            ‹ Go back
          </button>
        </div>
      </div>
    </div>
  )
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.2-1.9 2.9l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.4-.2-2.1H12z" />
      <path fill="#34A853" d="M12 21c2.6 0 4.8-.9 6.4-2.5l-3.1-2.4c-.9.6-2 .9-3.3.9-2.5 0-4.6-1.7-5.4-4H3.4v2.5A9.7 9.7 0 0012 21z" />
      <path fill="#4A90E2" d="M6.6 13c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V6.5H3.4A9.7 9.7 0 002.3 11c0 1.6.4 3.1 1.1 4.5L6.6 13z" />
      <path fill="#FBBC05" d="M12 5c1.4 0 2.7.5 3.7 1.4l2.8-2.8C16.8 2 14.6 1 12 1a9.7 9.7 0 00-8.6 5.5L6.6 9c.8-2.3 2.9-4 5.4-4z" />
    </svg>
  )
}

function OutputPreview({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div className="w-full max-w-md rounded-[36px] border border-[rgba(38,51,58,0.08)] bg-white/90 p-7 shadow-[0_26px_80px_rgba(38,51,58,0.10)] backdrop-blur">
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold tracking-[-0.04em] text-[#26333A]">Admin that finishes itself.</h2>
      </div>
      <button
        type="button"
        onClick={onSignUp}
        className="mb-3 w-full rounded-full bg-[#3F7C85] px-5 py-3.5 text-sm font-extrabold text-white shadow-[0_16px_38px_rgba(63,124,133,0.22)] transition hover:-translate-y-0.5 hover:bg-[#356D75]"
      >
        Create an account — free
      </button>
      <div className="mb-5 flex items-center justify-center gap-1.5 text-xs text-[#8A989E]">
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="7" width="10" height="8" rx="1.5" stroke="#8A989E" strokeWidth="1.5"/>
          <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="#8A989E" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span>Read-only access</span>
        <span className="text-[#DCEEF5]">·</span>
        <span>No manual entry</span>
        <span className="text-[#DCEEF5]">·</span>
        <span>Jira or Xero export</span>
      </div>
      <div className="space-y-3">
        <PreviewRow title="Calendar time" value="Imported" />
        <PreviewRow title="Review status" value="Ready" />
        <PreviewRow title="Next output" value="Choose" />
      </div>
      <div className="mt-6 rounded-[28px] bg-[#FBFBF8] p-5">
        <p className="text-sm font-bold text-[#26333A]">Never rebuild a timesheet or invoice from scratch again.</p>
        <p className="mt-2 text-sm leading-6 text-[#66747A]">The work is already in your calendar. Time Translator turns it into the output you need.</p>
      </div>
    </div>
  )
}

function PreviewRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-[#DCEEF5] px-4 py-3">
      <span className="text-sm font-bold text-[#26333A]">{title}</span>
      <span className="rounded-full bg-[#8FD5C3]/35 px-3 py-1 text-xs font-extrabold text-[#3F7C85]">{value}</span>
    </div>
  )
}


function PainSection() {
  return (
    <section className="border-t border-[#DCEEF5] bg-white px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">Sound familiar?</p>
          <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
            We all know this feeling.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <PainCard
            quote='"What did I even do this week?"'
            body="You invoice less than you earned because you can't remember the details."
          />
          <PainCard
            quote='"I know what I worked on. I just have to manually re-enter it. Again."'
            body="Every week. Same tedious process. Different app to paste into."
          />
          <PainCard
            quote='"I have to open four apps just to write one invoice."'
            body="Calendar. Notes. Email. Slack. All to recreate one billing document."
          />
        </div>
        <p className="mt-10 text-center text-lg font-medium text-[#26333A]">
          Whether you&apos;re losing revenue or losing time — the fix is the same.{' '}
          <span className="text-[#3F7C85]">Your calendar already contains the answer.</span>
        </p>
      </div>
    </section>
  )
}

function PainCard({ quote, body }: { quote: string; body: string }) {
  return (
    <div className="rounded-[24px] border border-[#DCEEF5] bg-[#FBFBF8] p-7 shadow-[0_4px_24px_rgba(38,51,58,0.04)]">
      <p className="text-base font-bold italic leading-snug text-[#26333A]">{quote}</p>
      <p className="mt-4 text-sm leading-6 text-[#66747A]">{body}</p>
    </div>
  )
}

function ShiftSection() {
  return (
    <section className="border-t border-[#DCEEF5] bg-[#FBFBF8] px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">The shift</p>
            <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
              Your calendar is already a solid source of truth.{' '}
              <span className="text-[#3F7C85]">The problem is, you're still copying it into other systems by hand.</span>
            </h2>
            <p className="mt-6 text-lg leading-8 text-[#66747A]">
              Every meeting, call, working block, and client session is sitting in your Google Calendar right now. Time Translator reads it, organises it, and writes it straight into Jira and the exports you need — no re-typing required.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex-1 rounded-[20px] border border-[#DCEEF5] bg-white p-5 shadow-[0_4px_20px_rgba(38,51,58,0.06)]">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#8A989E]">Google Calendar</p>
              <div className="space-y-2">
                {[
                  { label: 'Marcus', time: '9am' },
                  { label: 'Workshop prep', time: '11am' },
                  { label: 'Update change log for v5.2 release', time: '2pm' },
                ].map((row) => (
                  <div key={row.label} className="flex h-11 items-center justify-between rounded-lg bg-[#E8F4F7] px-3 py-2">
                    <span className="text-xs font-medium text-[#3F7C85]">{row.label}</span>
                    <span className="text-xs font-medium text-[#3F7C85]">{row.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center sm:flex-col">
              <svg className="h-6 w-6 rotate-90 sm:rotate-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" stroke="#3F7C85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="flex-1 rounded-[20px] border-2 border-[#3F7C85] bg-white p-5 shadow-[0_8px_32px_rgba(63,124,133,0.12)]">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-[#3F7C85]">Time Translator</p>
              <div className="space-y-2">
                {[
                  { label: 'PMT-102 — Client Meetings (Panther Project)', time: '1h' },
                  { label: 'PPJ-277 — Panther Project Workshop', time: '2h' },
                  { label: 'WEB-759 — Version 5.2.0 Release', time: '1.5h' },
                ].map((row) => (
                  <div key={row.label} className="flex h-11 items-center justify-between rounded-lg border border-[#DCEEF5] px-3 py-2">
                    <span className="text-xs font-medium text-[#26333A]">{row.label}</span>
                    <span className="rounded-full bg-[#8FD5C3]/30 px-2 py-0.5 text-xs font-bold text-[#3F7C85]">{row.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t border-[#DCEEF5] bg-white px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">How it works</p>
          <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
            From calendar to export in three steps.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <StepCard
            number="1"
            title="Import"
            body="Import your data yourself, or connect Google Calendar and let Time Translator fetch your events automatically. We request read-only access — we never write to your calendar, modify events, or share your data with anyone."
          />
          <StepCard
            number="2"
            title="Review"
            body="Time Translator matches your calendar events your selected outputs (Jira, CSV) — you check the entries. Everything goes through your approval."
          />
          <StepCard
            number="3"
            title="Export"
            body="Write your timesheets to Jira, export for Xero, or grab a CSV. Your time is translated."
          />
        </div>
        <p className="mt-10 text-center text-sm text-[#66747A]">
          Average time from calendar connection to exported output:{' '}
          <span className="font-bold text-[#26333A]">under 10 minutes.</span>
        </p>
      </div>
    </section>
  )
}

function StepCard({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <div className="relative rounded-[24px] border border-[#DCEEF5] bg-[#FBFBF8] p-7 shadow-[0_4px_24px_rgba(38,51,58,0.04)]">
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-[#3F7C85] text-base font-extrabold text-white">
        {number}
      </span>
      <h3 className="mb-3 text-lg font-extrabold text-[#26333A]">{title}</h3>
      <p className="text-sm leading-6 text-[#66747A]">{body}</p>
    </div>
  )
}

function FeaturesSection() {
  return (
    <section className="border-t border-[#DCEEF5] bg-[#FBFBF8] px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">Features</p>
          <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
            Why people like you love Time Translator.
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <FeatureCard
            title="Recover forgotten hours"
            body="Time Translator surfaces activity you didn't record — including short calls, prep time, and back-to-back sessions that blur together."
          />
          <FeatureCard
            title="Stop doing admin twice"
            body="Map calendar events once. It remembers your patterns and pre-fills future exports for you."
          />
          <FeatureCard
            title="Export in your format"
            body="Timesheet, invoice, Jira export, Xero, or CSV. No reformatting. No copy-paste. No items left behind."
          />
          <FeatureCard
            title="Works with how you already work"
            body="No new habits. No new apps to remember. Use Google Calendar exactly as you always have."
          />
        </div>
      </div>
    </section>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  const checkIcon = (
    <svg className="mt-0.5 h-5 w-5 shrink-0 text-[#3F7C85]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="#DCEEF5" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="#3F7C85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  return (
    <div className="rounded-[24px] border border-[#DCEEF5] bg-white p-7 shadow-[0_4px_24px_rgba(38,51,58,0.06)]">
      <div className="flex gap-3">
        {checkIcon}
        <div>
          <h3 className="mb-2 text-base font-extrabold text-[#26333A]">{title}</h3>
          <p className="text-sm leading-6 text-[#66747A]">{body}</p>
        </div>
      </div>
    </div>
  )
}

function IntegrationsSection() {
  return (
    <section className="border-t border-[#DCEEF5] bg-white px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl text-center">
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">Integrations</p>
        <h2 className="mb-4 text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
          Works with the tools you already use.
        </h2>
        <div className="mx-auto mt-10 flex flex-wrap items-center justify-center gap-4">
          {[
            { label: 'Google Calendar', primary: true },
            { label: 'Xero' },
            { label: 'Jira' },
            { label: 'CSV' },
            { label: 'PDF' },
          ].map(({ label, primary }) => (
            <div
              key={label}
              className={`rounded-2xl border px-6 py-4 text-sm font-bold shadow-[0_2px_12px_rgba(38,51,58,0.06)] ${
                primary
                  ? 'border-[#3F7C85] bg-[#3F7C85]/5 text-[#3F7C85]'
                  : 'border-[#DCEEF5] bg-[#FBFBF8] text-[#26333A]'
              }`}
            >
              {label}
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm text-[#66747A]">
          More integrations on the roadmap.{' '}
          <Link href="/contact" className="font-semibold text-[#3F7C85] hover:underline">
            Tell us what you need.
          </Link>
        </p>
        <p className="mt-3 text-xs text-[#8A989E]">
          Google Calendar access is read-only. We never modify your events or share your data with third parties.
        </p>
      </div>
    </section>
  )
}

function FinalCtaSection({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section className="bg-[#26333A] px-5 py-24 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-white sm:text-5xl">
          Start with last week.
        </h2>
        <p className="mt-5 text-lg leading-8 text-[#8FD5C3]">
          Create a free account and let Time Translator show you what you <em>actually</em> worked on.
        </p>
        <p className="mt-2 text-base text-[#66747A]">No complex setup process. No data entry. No credit card.</p>
        <button
          type="button"
          onClick={onSignUp}
          className="mt-8 rounded-full bg-[#3F7C85] px-8 py-4 text-base font-extrabold text-white shadow-[0_16px_48px_rgba(63,124,133,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4A8D97]"
        >
          Create an account for free
        </button>
        <p className="mt-4 text-sm text-[#66747A]">60 second set up. Cancel any time.</p>
      </div>
    </section>
  )
}

async function startCheckout(tier: 'pro' | 'max_power', annual: boolean, onNeedsAuth?: () => void): Promise<boolean> {
  try {
    const res = await fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, annual }),
    })
    if (res.status === 401) {
      if (onNeedsAuth) {
        onNeedsAuth()
      } else {
        window.location.href = '/login#signup'
      }
      return false
    }
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
      return true
    }
    console.error('Stripe checkout: no URL returned', data)
    alert('Something went wrong starting checkout. Please try again.')
    return false
  } catch (err) {
    console.error('Stripe checkout error', err)
    alert('Something went wrong starting checkout. Please try again.')
    return false
  }
}

function PricingSection({ onStartFree }: { onStartFree: () => void }) {
  const [annual, setAnnual] = useState(false)
  const [proLoading, setProLoading] = useState(false)
  const [maxLoading, setMaxLoading] = useState(false)

  async function handlePro() {
    setProLoading(true)
    const redirecting = await startCheckout('pro', annual, () => { setProLoading(false); onStartFree() })
    if (!redirecting) setProLoading(false)
  }

  async function handleMax() {
    setMaxLoading(true)
    const redirecting = await startCheckout('max_power', annual, () => { setMaxLoading(false); onStartFree() })
    if (!redirecting) setMaxLoading(false)
  }

  const checkIcon = (
    <svg className="h-4 w-4 shrink-0 text-[#3F7C85]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="#DCEEF5" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="#3F7C85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const proPrice = annual ? 'A$50' : 'A$5'
  const maxPrice = annual ? 'A$150' : 'A$15'
  const priceSuffix = annual ? '/year' : '/month'
  const proSaving = annual ? 'Save A$10/yr' : null
  const maxSaving = annual ? 'Save A$30/yr' : null

  return (
    <section className="border-t border-[#DCEEF5] bg-[#FBFBF8] px-5 py-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 text-center">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-[#3F7C85]">Pricing</p>
          <h2 className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A] sm:text-5xl">
            Simple, honest pricing.
          </h2>
        </div>

        {/* Sticky Monthly / Annual toggle */}
        <div className="sticky top-14 z-20 flex flex-col items-center pb-6 pt-2">
          <div className="inline-flex items-center gap-3 rounded-full border border-[#DCEEF5] bg-white p-1 shadow-md">
            <button
              type="button"
              onClick={() => setAnnual(false)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${!annual ? 'bg-[#26333A] text-white' : 'text-[#66747A] hover:text-[#26333A]'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setAnnual(true)}
              className={`rounded-full px-5 py-2 text-sm font-bold transition ${annual ? 'bg-[#26333A] text-white' : 'text-[#66747A] hover:text-[#26333A]'}`}
            >
              Annual
            </button>
          </div>
          {annual && (
            <p className="mt-2 text-sm font-semibold text-[#3F7C85]">2 months free with annual billing</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-3 sm:items-stretch">
          {/* Free Trial */}
          <div className="flex flex-col rounded-[28px] border border-[#DCEEF5] bg-white p-7 shadow-[0_4px_24px_rgba(38,51,58,0.06)]">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#66747A]">Free Trial (30 days)</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A]">A$0</span>
            </div>
            <p className="mt-1 text-sm text-[#66747A]">No card required</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-[#26333A]">
              <li className="flex items-center gap-2">{checkIcon}<span>200 AI matches / month</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>Unlimited linked calendars</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>Jira timesheet export</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>CSV export</span></li>
            </ul>
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={onStartFree}
                className="w-full rounded-full border border-[#DCEEF5] bg-[#FBFBF8] px-5 py-3 text-sm font-bold text-[#26333A] transition hover:border-[#3F7C85] hover:text-[#3F7C85]"
              >
                Start free
              </button>
            </div>
          </div>

          {/* Pro — elevated */}
          <div className="relative flex flex-col rounded-[28px] border-2 border-[#3F7C85] bg-white p-7 shadow-[0_18px_56px_rgba(63,124,133,0.18)] sm:-mx-1 sm:-my-2">
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
              <span className="rounded-full bg-[#3F7C85] px-4 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-white shadow-sm">
                Most popular
              </span>
            </div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#3F7C85]">Pro</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A]">{proPrice}</span>
              <span className="text-sm text-[#66747A]">{priceSuffix}</span>
            </div>
            <p className="mt-1 text-sm text-[#66747A]">{proSaving ?? 'Cancel any time'}</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-[#26333A]">
              <li className="flex items-center gap-2">{checkIcon}<span>5,000 AI matches / month</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>1 linked calendar</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>Jira timesheet export</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>CSV export</span></li>
            </ul>
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={handlePro}
                disabled={proLoading}
                className="w-full rounded-full bg-[#3F7C85] px-5 py-3 text-sm font-bold text-white shadow-[0_8px_24px_rgba(63,124,133,0.28)] transition hover:bg-[#356D75] disabled:opacity-60"
              >
                {proLoading ? 'Redirecting…' : 'Get Pro'}
              </button>
            </div>
          </div>

          {/* Max Power */}
          <div className="flex flex-col rounded-[28px] border border-[#DCEEF5] bg-white p-7 shadow-[0_4px_24px_rgba(38,51,58,0.06)]">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-[#66747A]">Max Power</p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-[-0.04em] text-[#26333A]">{maxPrice}</span>
              <span className="text-sm text-[#66747A]">{priceSuffix}</span>
            </div>
            <p className="mt-1 text-sm text-[#66747A]">{maxSaving ?? 'Cancel any time'}</p>
            <ul className="mt-6 flex flex-col gap-3 text-sm text-[#26333A]">
              <li className="flex items-center gap-2">{checkIcon}<span>50,000 AI matches / month</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>Unlimited linked calendars</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>Jira timesheet export</span></li>
              <li className="flex items-center gap-2">{checkIcon}<span>CSV export</span></li>
            </ul>
            <div className="mt-auto pt-8">
              <button
                type="button"
                onClick={handleMax}
                disabled={maxLoading}
                className="w-full rounded-full border border-[#26333A] bg-[#26333A] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#314149] disabled:opacity-60"
              >
                {maxLoading ? 'Redirecting…' : 'Get Max Power'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function LogoMark({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Image src="/brand/TT Icon.png" alt="Time Translator" width={48} height={48} className="rounded-2xl" />
    )
  }
  return (
    <Image src="/brand/TRANSLATOR Clear background logo.png" alt="Time Translator" width={400} height={107} className="h-auto w-auto max-h-28" />
  )
}
