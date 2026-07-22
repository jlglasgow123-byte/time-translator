import { NextRequest, NextResponse } from 'next/server'
import { matchEvents } from '@/lib/ai-matcher'
import { createClient } from '@/lib/supabase/server'
import { consumeAiUsage, refundAiUsage } from '@/lib/supabase/usage'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureAppError, captureAppEvent, requestIdFromHeaders } from '@/lib/observability'
import { getUserEntitlement } from '@/lib/billing/entitlements'
import { AI_CALLS_PER_MINUTE_PER_USER, MAX_EVENTS_PER_IMPORT } from '@/lib/security-limits'
import type { CalendarEvent, JiraTicket, CatchAllMapping } from '@/types'

export async function POST(req: NextRequest) {
  const requestId = requestIdFromHeaders(req.headers)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const period = new Date().toISOString().slice(0, 7)

  const entitlement = await getUserEntitlement(supabase, user.id)
  const tier = entitlement.tier
  const limit = entitlement.monthlyAiLimit

  try {
    const body = await req.json()
    const events: CalendarEvent[] = body.events ?? []
    const jiraTickets: JiraTicket[] = body.jiraTickets ?? []
    const defaultProjectKey: string = body.defaultProjectKey ?? 'DOC'
    const catchAllMappings: CatchAllMapping[] = body.catchAllMappings ?? []
    if (events.length > MAX_EVENTS_PER_IMPORT) {
      return NextResponse.json(
        { error: `Too many calendar events. Match up to ${MAX_EVENTS_PER_IMPORT} events at a time.` },
        { status: 413 }
      )
    }

    if (!entitlement.canUseAi && events.length > 0) {
      captureAppEvent('AI entitlement blocked', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        route: '/api/match-events',
        action: 'ai_entitlement',
        status: 'blocked',
        errorCode: 'ai_entitlement_blocked',
        details: { tier, entitlementStatus: entitlement.status, reason: entitlement.reason },
      })
      return NextResponse.json(
        { error: entitlement.reason ?? 'Your plan does not currently allow AI matching.' },
        { status: 402 }
      )
    }

    const minuteLimit = await checkRateLimit(`ai:${user.id}`, AI_CALLS_PER_MINUTE_PER_USER, 60, events.length)
    if (!minuteLimit.allowed) {
      captureAppEvent('AI per-minute rate limit hit', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        route: '/api/match-events',
        action: 'ai_rate_limit',
        status: 'limited',
        errorCode: 'ai_per_minute_limit_hit',
        details: { eventCount: events.length, limit: AI_CALLS_PER_MINUTE_PER_USER },
      })
      return NextResponse.json(
        { error: `AI rate limit reached. Try again in about ${Math.ceil((minuteLimit.resetAt - Date.now()) / 1000)} seconds.` },
        { status: 429 }
      )
    }

    const usageResult = await consumeAiUsage(user.id, period, events.length, limit)
    if (!usageResult.allowed) {
      captureAppEvent('AI monthly usage limit hit', 'warning', {
        eventType: 'usage_limit_hit',
        userId: user.id,
        requestId,
        route: '/api/match-events',
        action: 'ai_usage_limit',
        status: 'limited',
        errorCode: 'ai_monthly_limit_hit',
        details: { eventCount: events.length, monthlyLimit: limit, remaining: usageResult.remaining, tier, entitlementStatus: entitlement.status },
      })
      return NextResponse.json(
        { error: `AI match limit reached. ${usageResult.remaining} of ${limit} matches remaining this month on your ${tier.replaceAll('_', ' ')} plan.` },
        { status: 429 }
      )
    }

    let workEntries
    let jiraMatchesByWorkEntryId
    try {
      const result = await matchEvents(events, jiraTickets, catchAllMappings, defaultProjectKey)
      workEntries = result.workEntries
      jiraMatchesByWorkEntryId = result.jiraMatchesByWorkEntryId
    } catch (error) {
      await refundAiUsage(user.id, period, events.length)
      captureAppError(error, {
        eventType: 'match_failed',
        userId: user.id,
        requestId,
        route: '/api/match-events',
        action: 'match_events',
        status: 'failed',
        errorCode: 'match_failed',
        details: { eventCount: events.length, ticketCount: jiraTickets.length },
      })
      throw error
    }

    captureAppEvent('Events matched successfully', 'info', {
      eventType: 'match_succeeded',
      userId: user.id,
      requestId,
      route: '/api/match-events',
      action: 'match_events',
      status: 'success',
      details: { eventCount: events.length, ticketCount: jiraTickets.length },
    })

    return NextResponse.json({ workEntries, jiraMatchesByWorkEntryId })
  } catch (err) {
    captureAppError(err, {
      eventType: 'match_failed',
      userId: user.id,
      requestId,
      route: '/api/match-events',
      action: 'match_events',
      status: 'failed',
      errorCode: 'match_failed',
    })
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Match failed' }, { status: 500 })
  }
}
