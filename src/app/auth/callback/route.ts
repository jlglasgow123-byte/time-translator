import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { captureAppEvent, requestIdFromHeaders } from '@/lib/observability'

export async function GET(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers)
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/upload'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/upload'

  if (code) {
    const response = NextResponse.redirect(`${origin}${next}`)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      captureAppEvent('Auth callback succeeded', 'info', {
        eventType: 'auth_callback_success',
        requestId,
        route: '/auth/callback',
        action: 'auth_callback',
        status: 'success',
        details: { next },
      })
      return response
    }

    captureAppEvent('Auth callback failed', 'warning', {
      eventType: 'auth_callback_failure',
      requestId,
      route: '/auth/callback',
      action: 'auth_callback',
      status: 'failed',
      errorCode: 'auth_callback_failed',
      details: { reason: error.message, next },
    })
  } else {
    captureAppEvent('Auth callback missing code', 'warning', {
      eventType: 'auth_callback_missing_code',
      requestId,
      route: '/auth/callback',
      action: 'auth_callback',
      status: 'missing_code',
      errorCode: 'auth_callback_missing_code',
      details: { next },
    })
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
