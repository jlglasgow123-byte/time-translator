'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

interface UpgradePromptProps {
  reason: 'trial_expired' | 'ai_limit'
  inline?: boolean
}

interface UpgradeButtonProps {
  className?: string
  navMode?: boolean
}

function PromoCodeField({ onSuccess }: { onSuccess: (endsAt: string) => void }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRedeem() {
    if (!code.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/promo/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        onSuccess(data.promoEndsAt)
      } else {
        setError(data.error ?? 'Invalid code. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-[#3F7C85] underline underline-offset-2 hover:text-[#2e5f67]"
      >
        Have a promo code?
      </button>
    )
  }

  return (
    <div className="mt-1 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleRedeem()}
          placeholder="Enter code"
          className="flex-1 rounded-md border border-[#DCEEF5] px-3 py-2 text-sm uppercase tracking-wider text-[#26333A] placeholder:normal-case placeholder:tracking-normal focus:border-[#3F7C85] focus:outline-none"
          disabled={loading}
          autoFocus
        />
        <button
          type="button"
          onClick={handleRedeem}
          disabled={loading || !code.trim()}
          className="rounded-md bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2e5f67] disabled:opacity-60 transition-colors"
        >
          {loading ? '…' : 'Apply'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function PromoSuccess({ endsAt }: { endsAt: string }) {
  const date = new Date(endsAt).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
      <p className="text-sm font-semibold text-green-800">Pro access activated!</p>
      <p className="mt-1 text-sm text-green-700">You have free Pro access until {date}.</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-3 rounded-md bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2e5f67] transition-colors"
      >
        Get started
      </button>
    </div>
  )
}

function PricingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [annual, setAnnual] = useState(false)
  const [proLoading, setProLoading] = useState(false)
  const [maxLoading, setMaxLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout(tier: 'pro' | 'max_power') {
    const setLoading = tier === 'pro' ? setProLoading : setMaxLoading
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, annual }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError('Could not start checkout. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Could not start checkout. Please try again.')
      setLoading(false)
    }
  }

  const checkIcon = (
    <svg className="h-4 w-4 shrink-0 text-[#3F7C85]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="#DCEEF5" strokeWidth="1.5" />
      <path d="M5 8l2 2 4-4" stroke="#3F7C85" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )

  const proPrice = annual ? 'A$50/yr' : 'A$5/mo'
  const maxPrice = annual ? 'A$150/yr' : 'A$15/mo'

  return (
    <Modal open={open} onClose={onClose} title="Choose your plan" maxWidthClassName="max-w-2xl">
      {/* Toggle */}
      <div className="mb-6 flex flex-col items-center gap-2">
        <div className="inline-flex items-center rounded-full border border-[#DCEEF5] bg-[#FBFBF8] p-1">
          <button
            type="button"
            onClick={() => setAnnual(false)}
            className={`rounded-full px-5 py-1.5 text-sm font-bold transition ${!annual ? 'bg-[#26333A] text-white' : 'text-[#66747A] hover:text-[#26333A]'}`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setAnnual(true)}
            className={`rounded-full px-5 py-1.5 text-sm font-bold transition ${annual ? 'bg-[#26333A] text-white' : 'text-[#66747A] hover:text-[#26333A]'}`}
          >
            Annual
          </button>
        </div>
        {!annual
          ? <p className="text-xs text-[#3F7C85] font-medium">Get two months on us when you switch to an annual plan</p>
          : <p className="text-xs text-[#3F7C85] font-medium">You&apos;re saving 2 months — great choice!</p>
        }
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Pro */}
        <div className="relative flex flex-col rounded-[20px] border-2 border-[#3F7C85] bg-white p-6 shadow-[0_8px_32px_rgba(63,124,133,0.14)]">
          <div className="absolute -top-3 left-5">
            <span className="rounded-full bg-[#3F7C85] px-3 py-0.5 text-xs font-extrabold uppercase tracking-[0.12em] text-white">
              Most popular
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#3F7C85]">Pro</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tracking-[-0.04em] text-[#26333A]">{annual ? 'A$50' : 'A$5'}</span>
            <span className="text-sm text-[#66747A]">{annual ? '/year' : '/month'}</span>
          </div>
          {annual && <p className="mt-0.5 text-xs font-semibold text-[#3F7C85]">Save A$10/yr</p>}
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-[#26333A]">
            <li className="flex items-center gap-2">{checkIcon}<span>5,000 AI matches / month</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>1 linked calendar</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>Jira timesheet export</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>CSV export</span></li>
          </ul>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => handleCheckout('pro')}
              disabled={proLoading || maxLoading}
              className="w-full rounded-full bg-[#3F7C85] px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_16px_rgba(63,124,133,0.24)] transition hover:bg-[#356D75] disabled:opacity-60"
            >
              {proLoading ? 'Redirecting…' : `Get Pro — ${proPrice}`}
            </button>
          </div>
        </div>

        {/* Max Power */}
        <div className="flex flex-col rounded-[20px] border border-[#DCEEF5] bg-[#FBFBF8] p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#66747A]">Max Power</p>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tracking-[-0.04em] text-[#26333A]">{annual ? 'A$150' : 'A$15'}</span>
            <span className="text-sm text-[#66747A]">{annual ? '/year' : '/month'}</span>
          </div>
          {annual && <p className="mt-0.5 text-xs font-semibold text-[#3F7C85]">Save A$30/yr</p>}
          <ul className="mt-4 flex flex-col gap-2.5 text-sm text-[#26333A]">
            <li className="flex items-center gap-2">{checkIcon}<span>50,000 AI matches / month</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>Unlimited linked calendars</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>Jira timesheet export</span></li>
            <li className="flex items-center gap-2">{checkIcon}<span>CSV export</span></li>
          </ul>
          <div className="mt-auto pt-6">
            <button
              type="button"
              onClick={() => handleCheckout('max_power')}
              disabled={proLoading || maxLoading}
              className="w-full rounded-full border border-[#26333A] bg-[#26333A] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#314149] disabled:opacity-60"
            >
              {maxLoading ? 'Redirecting…' : `Get Max Power — ${maxPrice}`}
            </button>
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-center text-xs text-red-600">{error}</p>}
      <p className="mt-4 text-center text-xs text-[#66747A]">Secure payment via Stripe. Upgrade, downgrade or cancel any time.</p>
    </Modal>
  )
}

export function UpgradeButton({ className = '', navMode = false }: UpgradeButtonProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null)

  if (promoSuccess) {
    return <PromoSuccess endsAt={promoSuccess} />
  }

  if (navMode) {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-full bg-[#3F7C85] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#356D75]"
        >
          Upgrade
        </button>
        <PricingModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    )
  }

  return (
    <div className={className}>
      <button
        onClick={() => setModalOpen(true)}
        className="rounded-md bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2e5f67]"
      >
        Upgrade
      </button>
      <div className="mt-2">
        <PromoCodeField onSuccess={setPromoSuccess} />
      </div>
      <PricingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}

export function UpgradePrompt({ reason, inline = false }: UpgradePromptProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null)

  const heading = reason === 'trial_expired'
    ? 'Your free trial has ended'
    : 'You\'ve used all your free AI matches'

  const body = reason === 'trial_expired'
    ? 'Upgrade to keep converting your calendar into timesheets and exports.'
    : 'You\'ve used your 200 free AI matches for this month. Upgrade to continue matching.'

  if (promoSuccess) {
    const content = <PromoSuccess endsAt={promoSuccess} />
    if (inline) return <div className="rounded-lg border border-green-200 bg-green-50 p-4">{content}</div>
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-md">{content}</div>
      </div>
    )
  }

  if (inline) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm font-semibold text-amber-900">{heading}</p>
        <p className="mt-1 text-sm text-amber-700">{body}</p>
        <UpgradeButton className="mt-3" />
      </div>
    )
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[28px] border border-[#DCEEF5] bg-white p-8 text-center shadow-[0_4px_24px_rgba(38,51,58,0.06)]">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-[#26333A]">{heading}</h2>
        <p className="mt-2 text-sm text-[#66747A]">{body}</p>
        <p className="mt-1 text-sm text-[#66747A]">Pro from <span className="font-semibold text-[#26333A]">A$5/month</span> — cancel any time.</p>
        <button
          onClick={() => setModalOpen(true)}
          className="mt-6 w-full rounded-full bg-[#3F7C85] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2e5f67]"
        >
          See plans
        </button>
        <div className="mt-4">
          <PromoCodeField onSuccess={setPromoSuccess} />
        </div>
        <p className="mt-4 text-xs text-[#66747A]">Secure payment via Stripe. Cancel any time from Settings.</p>
      </div>
      <PricingModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  )
}
