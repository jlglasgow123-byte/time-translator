'use client'

import { useState } from 'react'

export default function ContactPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, message }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong. Please try again.')
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-xl px-4">
        <div className="mb-8">
          <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">Contact</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">Tell us what you need.</h1>
          <p className="mt-3 text-base leading-7 text-[#66747A]">
            Missing an integration, found a bug, or just want to say hi — send us a message and we&apos;ll get back to you.
          </p>
        </div>

        <section className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-7 shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
          {sent ? (
            <p className="text-sm leading-7 text-[#26333A]">
              Thanks — your message has been sent. We&apos;ll reply to <span className="font-semibold">{email}</span>.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-[#26333A]">
                  Your email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 text-sm text-[#26333A] outline-none focus:border-[#3F7C85]"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-[#26333A]">
                  Message
                </label>
                <textarea
                  id="message"
                  required
                  rows={6}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-4 py-3 text-sm text-[#26333A] outline-none focus:border-[#3F7C85]"
                  placeholder="What integration or feature do you need?"
                />
              </div>
              {error && <p className="text-sm font-medium text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="rounded-full bg-[#3F7C85] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#33646c] disabled:opacity-60"
              >
                {loading ? 'Sending...' : 'Send message'}
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  )
}
