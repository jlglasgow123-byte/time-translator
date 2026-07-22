import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { captureAppEvent, requestIdFromHeaders } from '@/lib/observability'

const ALLOWED_EVENT_TYPES = new Set([
  'magic_link_requested',
  'magic_link_request_failed',
  'oauth_started',
  'oauth_start_failed',
  'inactive_logout',
  'user_sign_out',
  'settings_saved',
  'settings_save_failed',
  'jira_connection_tested',
  'jira_connection_test_failed',
])

function cleanString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.slice(0, 120) : fallback
}

function cleanDetails(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/token|secret|password|cookie|authorization/i.test(key))
      .slice(0, 20)
      .map(([key, nested]) => [key.slice(0, 80), typeof nested === 'string' ? nested.slice(0, 250) : nested])
  )
}

export async function POST(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers)
  const body = await request.json().catch(() => null)
  const eventType = cleanString(body?.eventType)

  if (!ALLOWED_EVENT_TYPES.has(eventType)) {
    return NextResponse.json({ error: 'Unsupported event type' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const severity = body?.severity === 'warning' || body?.severity === 'error' ? body.severity : 'info'
  const route = cleanString(body?.route, '/api/events')
  const action = cleanString(body?.action, eventType)
  const status = cleanString(body?.status, 'recorded')
  const errorCode = cleanString(body?.errorCode)

  captureAppEvent(`Product event: ${eventType}`, severity, {
    eventType,
    userId: user?.id,
    requestId,
    route,
    action,
    status,
    errorCode: errorCode || undefined,
    details: cleanDetails(body?.details),
  })

  return NextResponse.json({ ok: true })
}
