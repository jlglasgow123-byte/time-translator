import { createClient } from './supabase/server'

interface AdminIdentity {
  user: Awaited<ReturnType<Awaited<ReturnType<typeof createClient>>['auth']['getUser']>>['data']['user']
  isPlatformAdmin: boolean
  isDeveloper: boolean
  hasAdminAccess: boolean // true if either role
  isAdmin: boolean        // alias for isPlatformAdmin — kept for backwards compat
}

export async function getAdminIdentity(): Promise<AdminIdentity> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, isPlatformAdmin: false, isDeveloper: false, hasAdminAccess: false, isAdmin: false }

  const { data } = await supabase
    .from('profiles')
    .select('is_platform_admin,is_developer')
    .eq('user_id', user.id)
    .single()

  const isPlatformAdmin = Boolean(data?.is_platform_admin)
  const isDeveloper = Boolean(data?.is_developer)
  return { user, isPlatformAdmin, isDeveloper, hasAdminAccess: isPlatformAdmin || isDeveloper, isAdmin: isPlatformAdmin }
}

// Gates: platform admin OR developer
export async function requireAdminAccess() {
  return getAdminIdentity()
}

// Gates: platform admin only (billing, PII, user controls)
export async function requirePlatformAdmin() {
  return getAdminIdentity()
}

// Legacy alias — kept so any code still importing requireAdmin compiles.
export const requireAdmin = requirePlatformAdmin
