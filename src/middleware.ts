import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'
import { UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE } from '@/lib/security-limits'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = pathname === '/' || pathname.startsWith('/login') || pathname.startsWith('/help') || pathname.startsWith('/auth/') || pathname.startsWith('/reset-password') || pathname.startsWith('/api/events') || pathname.startsWith('/api/stripe/') || pathname.startsWith('/privacy') || pathname.startsWith('/terms') || pathname.startsWith('/api/admin/atlassian-app-auth/callback') || pathname.startsWith('/api/admin/atlassian-report') || pathname.startsWith('/api/admin/security-report')
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
    const limit = await checkRateLimit(`unauth:${ip}`, UNAUTHENTICATED_REQUESTS_PER_IP_PER_MINUTE, 60)

    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again soon.' },
        { status: 429 }
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
