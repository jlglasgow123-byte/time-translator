import { randomUUID } from 'crypto'
import { createServiceClient } from './supabase/service'

type Severity = 'info' | 'warning' | 'error'

interface ObservabilityContext {
  eventType?: string
  userId?: string
  requestId?: string
  importId?: string
  route?: string
  action?: string
  status?: string
  errorCode?: string
  details?: Record<string, unknown>
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'app_event'
}

function baseFields(message: string, severity: Severity, context: ObservabilityContext) {
  return {
    event_type: context.eventType ?? context.action ?? slugify(message),
    request_id: context.requestId ?? randomUUID(),
    import_id: context.importId ?? null,
    error_code: context.errorCode ?? null,
    timestamp: new Date().toISOString(),
    severity,
  }
}

function sanitizeDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !/token|secret|password|cookie|authorization|api[_-]?key/i.test(key))
      .slice(0, 40)
      .map(([key, nested]) => {
        if (typeof nested === 'string') return [key.slice(0, 80), nested.slice(0, 500)]
        if (typeof nested === 'number' || typeof nested === 'boolean' || nested === null) return [key.slice(0, 80), nested]
        return [key.slice(0, 80), '[object]']
      })
  )
}

async function persistSystemEvent(
  message: string,
  fields: ReturnType<typeof baseFields>,
  context: ObservabilityContext
) {
  if (typeof window !== 'undefined') return

  try {
    const supabase = createServiceClient()
    await supabase.from('app_system_events').insert({
      event_type: fields.event_type,
      severity: fields.severity,
      user_id: context.userId ?? null,
      request_id: fields.request_id,
      import_id: context.importId ?? null,
      route: context.route ?? null,
      action: context.action ?? null,
      status: context.status ?? null,
      error_code: fields.error_code,
      message: message.slice(0, 500),
      details: sanitizeDetails(context.details),
      created_at: fields.timestamp,
    })
  } catch {
    // Observability persistence should never break the user flow.
  }
}

export function captureAppEvent(message: string, severity: Severity, context: ObservabilityContext = {}) {
  const fields = baseFields(message, severity, context)
  void persistSystemEvent(message, fields, context)
}

export function captureAppError(error: unknown, context: ObservabilityContext = {}) {
  const fields = baseFields(
    error instanceof Error ? error.message : 'Application error',
    'error',
    {
      ...context,
      errorCode: context.errorCode ?? 'app_error',
    }
  )
  void persistSystemEvent(error instanceof Error ? error.message : 'Application error', fields, context)
}

export function requestIdFromHeaders(headers: Headers) {
  return headers.get('x-vercel-id') ?? headers.get('x-request-id') ?? randomUUID()
}
