import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { captureAppError } from '@/lib/observability'

const MODEL = 'claude-haiku-4-5-20251001'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { eventTitles?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const eventTitles = body.eventTitles
  if (!Array.isArray(eventTitles) || eventTitles.length === 0) {
    return NextResponse.json({ error: 'eventTitles must be a non-empty array' }, { status: 400 })
  }

  const titles = eventTitles.filter((t): t is string => typeof t === 'string').slice(0, 200)

  const prompt = `You are helping generate invoice contact names from calendar event titles.

For each calendar event title, suggest the most likely client or contact name for an invoice.
- If the title mentions a company, person, or project name, use that.
- If the title is generic (e.g. "Team standup", "Planning meeting"), return an empty string "".
- Return ONLY a JSON array of strings, one per input title, in the same order.
- No explanation, no markdown, just the JSON array.

Event titles:
${JSON.stringify(titles)}

Return format example: ["Acme Corp", "Smith & Associates", "", "Global Dynamics"]`

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    let suggestions: string[]
    try {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('not an array')
      suggestions = parsed.map(s => (typeof s === 'string' ? s : ''))
    } catch {
      // If AI returns unparseable output, return empty suggestions rather than failing
      suggestions = titles.map(() => '')
    }

    // Pad/trim to match input length
    while (suggestions.length < titles.length) suggestions.push('')
    suggestions = suggestions.slice(0, titles.length)

    return NextResponse.json({ suggestions })
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined
    const creditsExhausted = status === 402
    const authFailed = status === 401
    captureAppError(err, {
      eventType: creditsExhausted ? 'ai_credits_exhausted' : authFailed ? 'ai_key_invalid' : 'suggest_contact_failed',
      userId: user.id,
      route: '/api/suggest-contact',
      action: 'suggest_contact',
      status: 'failed',
      errorCode: creditsExhausted ? 'ai_credits_exhausted' : authFailed ? 'ai_key_invalid' : 'suggest_contact_failed',
    })
    if (creditsExhausted || authFailed) {
      // Non-fatal: return empty suggestions so the review page still works without AI.
      return NextResponse.json({ suggestions: titles.map(() => '') })
    }
    return NextResponse.json({ error: 'Failed to generate contact suggestions' }, { status: 500 })
  }
}
