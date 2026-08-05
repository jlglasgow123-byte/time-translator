import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimitSafe } from '@/lib/rate-limit'
import { captureAppError } from '@/lib/observability'
import { UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE } from '@/lib/security-limits'

// Paths that must be reachable without a user session. Kept as a list rather
// than a single chained condition: as one long line, /api/admin/error-alerts was
// omitted when it was built, so Vercel cron got a 307 to /login every night for
// weeks and the daily error digest never sent once.
const PUBLIC_PREFIXES = [
  '/login',
  '/help',
  '/auth/',
  '/reset-password',
  '/privacy',
  '/terms',
  '/contact',
  '/api/contact',
  '/api/events',
  '/api/stripe/',
  // Cron/webhook endpoints. These are NOT unauthenticated — each verifies a
  // CRON_SECRET bearer token itself. They are listed here only so the session
  // middleware does not redirect the caller before that check can run.
  // ANY NEW CRON ROUTE MUST BE ADDED HERE OR IT WILL SILENTLY 307.
  '/api/admin/atlassian-app-auth/callback',
  '/api/admin/atlassian-report',
  '/api/admin/security-report',
  '/api/admin/error-alerts',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p))
  let supabaseResponse = NextResponse.next({ request })
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublic) return supabaseResponse

    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('error', 'auth_config')
    return NextResponse.redirect(url)
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    user = null
  }

  if (!user) {
    const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    const ip = forwardedFor || request.headers.get('x-real-ip') || 'unknown'
    const outcome = await checkRateLimitSafe(`unauth:${ip}`, UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE, 60)

    if (outcome.status === 'limited') {
      return NextResponse.json(
        { error: 'Too many requests. Please try again soon.' },
        { status: 429 }
      )
    }

    // Fail closed (Project_Model.md §6, 2026-08-05). This runs on every
    // unauthenticated request, so an unguarded throw here previously meant an
    // Upstash outage took down the whole site — including the login page — with
    // a bare 500 and no record of why.
    if (outcome.status === 'unavailable') {
      captureAppError(outcome.error, {
        eventType: 'rate_limit_unavailable',
        route: pathname,
        action: 'check_rate_limit',
        status: 'failed',
        errorCode: 'rate_limit_unavailable',
        details: { scope: 'unauthenticated' },
      })
      return NextResponse.json(
        { error: 'Service is temporarily unavailable. Please try again shortly.' },
        { status: 503 }
      )
    }
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Block suspended users from accessing protected routes
  // Uses the anon client (user session) — RLS allows users to read their own profile row
  if (user && !isPublic) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('access_blocked_at')
      .eq('user_id', user.id)
      .single()

    if (profile?.access_blocked_at) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('error', 'account_suspended')
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!monitoring|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
