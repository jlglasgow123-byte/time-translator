import Link from 'next/link'
import Image from 'next/image'

export function Footer() {
  return (
    <footer className="border-t border-[#DCEEF5] bg-[#FBFBF8]">
      <div className="mx-auto max-w-5xl px-6 py-12">

        {/* Main row */}
        <div className="flex flex-col gap-10 sm:flex-row sm:items-start sm:justify-between">

          {/* Brand block */}
          <div className="flex flex-col gap-4 sm:max-w-xs">
            <Link href="/" className="inline-flex">
              <Image
                src="/brand/TRANSLATOR Clear background logo.png"
                alt="Time Translator"
                width={160}
                height={36}
                className="h-9 w-auto object-contain"
              />
            </Link>
            <p className="text-sm leading-relaxed text-[#66747A]">
              Calendar in. Billing done.
            </p>
          </div>

          {/* Nav columns */}
          <div className="flex flex-wrap gap-x-16 gap-y-8">
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#26333A]">Product</p>
              <div className="flex flex-col gap-2.5 text-sm text-[#66747A]">
                <Link href="/#pricing" className="hover:text-[#26333A] transition-colors">Pricing</Link>
                <Link href="/help" className="hover:text-[#26333A] transition-colors">Help</Link>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#26333A]">Legal</p>
              <div className="flex flex-col gap-2.5 text-sm text-[#66747A]">
                <Link href="/privacy" className="hover:text-[#26333A] transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="hover:text-[#26333A] transition-colors">Terms of Service</Link>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#26333A]">Contact</p>
              <div className="flex flex-col gap-2.5 text-sm text-[#66747A]">
                <a href="mailto:contact@timetranslator.com.au" className="hover:text-[#26333A] transition-colors">
                  contact@timetranslator.com.au
                </a>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom bar */}
        <div className="mt-10 border-t border-[#DCEEF5] pt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#8A989E]">© {new Date().getFullYear()} Time Translator. All rights reserved.</p>
          <p className="text-xs text-[#8A989E]">Google Workspace is a trademark of Google LLC. Not affiliated with Google.</p>
        </div>

      </div>
    </footer>
  )
}
