import { NextResponse } from 'next/server'

const NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'contact@timetranslator.com.au'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!email || !message) {
    return NextResponse.json({ error: 'Please provide your email and a message.' }, { status: 400 })
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message is too long.' }, { status: 400 })
  }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Contact form is not configured yet.' }, { status: 500 })
  }

  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Time Translator <noreply@timetranslator.com.au>',
      to: NOTIFY_EMAIL,
      reply_to: email,
      subject: 'New message from Time Translator contact form',
      html: `
        <p><strong>From:</strong> ${escape(email)}</p>
        <p><strong>Message:</strong></p>
        <p>${escape(message).replace(/\n/g, '<br />')}</p>
      `,
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Could not send your message. Please try again.' }, { status: 502 })
  }

  return NextResponse.json({ success: true })
}
