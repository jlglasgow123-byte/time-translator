type ClientEventSeverity = 'info' | 'warning' | 'error'

interface ClientEventInput {
  eventType: string
  severity?: ClientEventSeverity
  route?: string
  action?: string
  status?: string
  errorCode?: string
  details?: Record<string, unknown>
}

export function trackClientEvent(input: ClientEventInput) {
  const body = JSON.stringify({
    severity: input.severity ?? 'info',
    eventType: input.eventType,
    route: input.route ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
    action: input.action,
    status: input.status,
    errorCode: input.errorCode,
    details: input.details,
  })

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
    return
  }

  fetch('/api/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // Observability must never break the user flow.
  })
}
