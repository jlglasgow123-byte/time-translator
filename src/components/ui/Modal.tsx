'use client'

import { useEffect } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  maxWidthClassName?: string
}

export function Modal({ open, onClose, title, children, maxWidthClassName = 'max-w-md' }: Props) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative z-10 w-full ${maxWidthClassName} max-h-[90vh] overflow-hidden rounded-[28px] bg-white shadow-xl border border-[#DCEEF5] mx-4`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-base font-semibold text-[#26333A]">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-[#3F7C85] text-xl leading-none">&times;</button>
        </div>
        <div className="max-h-[calc(90vh-122px)] overflow-y-auto px-5 py-5 space-y-4">
          {children}
        </div>
        <div className="border-t border-gray-100 px-5 py-3 flex justify-end">
          <button onClick={onClose} className="rounded-full bg-[#3F7C85] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#356D75]">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
