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

// Keys whose VALUE might carry a credential. Matching is on the key name only, so it is
// a blunt instrument: a harmless field like `clientSecretPresent` (a boolean) matches
// too. That is the intended trade-off — over-redacting is safe, under-redacting is not.
const CREDENTIAL_KEY_RE = /token|secret|password|cookie|authorization|api[_-]?key/i

// Deliberately REPLACES a matched value rather than dropping the key. Dropping it made
// redaction invisible: two separate bugs shipped where a diagnostic field was silently
// missing from every row — first metrics named `...Token`, later `clientSecretPresent` —
// and in both cases the absence looked identical to "the code never ran". A visible
// '[redacted]' marker means a mis-named field announces itself the first time it is read.
// See Project_Model.md §6.
const REDACTED = '[redacted]'

function sanitizeDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 40)
      .map(([key, nested]) => {
        const safeKey = key.slice(0, 80)
        if (CREDENTIAL_KEY_RE.test(key)) return [safeKey, REDACTED]
        if (typeof nested === 'string') return [safeKey, nested.slice(0, 500)]
        if (typeof nested === 'number' || typeof nested === 'boolean' || nested === null) return [safeKey, nested]
        return [safeKey, '[object]']
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
