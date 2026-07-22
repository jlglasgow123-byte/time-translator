'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { UpgradeButton } from '@/components/billing/UpgradePrompt'

const privateLinks = [
  { href: '/upload', label: 'Import' },
  { href: '/invoices', label: 'Invoices' },
  { href: '/history', label: 'History' },
]

const publicLinks = [
  { href: '/help', label: 'Help' },
]

export function Nav() {
  const pathname = usePathname()
  const [signedIn, setSignedIn] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)

  function openSignup() {
    if (pathname === '/login') {
      window.dispatchEvent(new Event('open-signup'))
      window.history.replaceState(null, '', '/login#signup')
    }
  }

  useEffect(() => {
    const supabase = createClient()

    // Fast local check from cookie — eliminates sign-in flicker on protected pages
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setSignedIn(true)
    })

    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user
      setSignedIn(Boolean(user))
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_platform_admin')
          .eq('user_id', user.id)
          .single()
        setIsPlatformAdmin(Boolean(profile?.is_platform_admin))
      }
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.user))
      if (!session?.user) setIsPlatformAdmin(false)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const links = signedIn ? privateLinks : publicLinks

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="mx-auto max-w-7xl px-4 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center">
          <Image src="/brand/TRANSLATOR Clear background logo.png" alt="Time Translator" width={160} height={40} className="h-10 w-auto" />
        </Link>
        <div className="flex items-center gap-6">
          {links.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={link.label === 'Sign Up'
                ? `rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    pathname === link.href
                      ? 'bg-[#26333A] text-white'
                      : 'bg-[#3F7C85] text-white hover:bg-[#356D75]'
                  }`
                : `text-sm transition-colors ${
                    pathname === link.href
                      ? 'text-[#3F7C85] font-medium'
                      : 'text-gray-500 hover:text-[#3F7C85]'
                  }`}
            >
              {link.label}
            </Link>
          ))}
          {signedIn && (
            <Link
              href="/help"
              className={`text-sm transition-colors ${
                pathname === '/help'
                  ? 'text-[#3F7C85] font-medium'
                  : 'text-gray-500 hover:text-[#3F7C85]'
              }`}
            >
              Help
            </Link>
          )}
          {!signedIn && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (pathname === '/login') {
                    window.dispatchEvent(new CustomEvent('open-signin'))
                  } else {
                    window.location.href = '/login'
                  }
                }}
                className="text-sm font-semibold text-gray-500 hover:text-[#3F7C85] transition-colors"
              >
                Sign in
              </button>
              {pathname === '/login' ? (
                <button
                  type="button"
                  onClick={openSignup}
                  className="rounded-full bg-[#26333A] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#314149]"
                >
                  Sign Up
                </button>
              ) : (
                <Link
                  href="/login#signup"
                  className="rounded-full bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#356D75]"
                >
                  Sign Up
                </Link>
              )}
            </>
          )}
          {signedIn && (
            <UpgradeButton className="text-sm" navMode />
          )}
          {isPlatformAdmin && (
            <Link
              href="/admin"
              className={`text-sm transition-colors ${
                pathname.startsWith('/admin')
                  ? 'text-[#3F7C85] font-medium'
                  : 'text-gray-500 hover:text-[#3F7C85]'
              }`}
            >
              Admin
            </Link>
          )}
          {signedIn && (
            <Link
              href="/settings"
              title="Settings"
              className={`transition-colors ${
                pathname === '/settings' ? 'text-[#3F7C85]' : 'text-gray-400 hover:text-[#3F7C85]'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
            </Link>
          )}
        </div>
      </div>
    </nav>
  )
}
