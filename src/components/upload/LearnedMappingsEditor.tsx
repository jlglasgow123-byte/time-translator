'use client'

import { useState } from 'react'
import type { LearnedMapping } from '@/types'
import { Button } from '@/components/ui/Button'

interface Props {
  mappings: LearnedMapping[]
  onChange: (mappings: LearnedMapping[]) => void
}

function topKey(m: LearnedMapping): { key: string; count: number } {
  const entries = Object.entries(m.counts).sort((a, b) => b[1] - a[1])
  return entries[0] ? { key: entries[0][0], count: entries[0][1] } : { key: '—', count: 0 }
}

function allKeys(m: LearnedMapping): Array<{ key: string; count: number }> {
  return Object.entries(m.counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count }))
}

export function LearnedMappingsEditor({ mappings, onChange }: Props) {
  const [open, setOpen] = useState(false)

  function remove(eventTitle: string) {
    onChange(mappings.filter(m => m.eventTitle !== eventTitle))
  }

  if (mappings.length === 0) {
    return (
      <div className="rounded-[28px] border border-[#DCEEF5] bg-white px-4 py-5 text-center">
        <p className="text-sm text-[#66747A]">No learned mappings yet.</p>
        <p className="mt-1 text-xs text-[#66747A]">Each time you approve and log time, the system learns which events belong to which Jira tickets.</p>
      </div>
    )
  }

  return (
    <div className="rounded-[28px] border border-[#DCEEF5] bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-[#FBFBF8] transition-colors"
      >
        <svg className={`h-4 w-4 text-[#8FD5C3] transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#26333A]">Learned mappings</span>
            <span className="rounded-full bg-[#DCEEF5] px-2 py-0.5 text-xs font-bold text-[#3F7C85]">{mappings.length}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#66747A]">Built automatically from your approved time logs. Used at LOW confidence.</p>
        </div>
      </button>

      {open && (
        <ul className="divide-y divide-[#DCEEF5] border-t border-[#DCEEF5] text-sm">
          {mappings.map(m => {
            const best = topKey(m)
            const others = allKeys(m).slice(1)
            return (
              <li key={m.eventTitle} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-[#26333A] truncate">"{m.eventTitle}"</span>
                      <span className="text-[#66747A]">→</span>
                      <span className="font-mono text-[#3F7C85]">{best.key}</span>
                      <span className="text-xs text-[#66747A]">(×{best.count})</span>
                    </div>
                    {others.length > 0 && (
                      <p className="text-xs text-amber-600">
                        Also logged to: {others.map(o => `${o.key} ×${o.count}`).join(', ')}
                      </p>
                    )}
                    <p className="text-xs text-[#66747A]">Last used: {m.lastUsed}</p>
                  </div>
                  <Button variant="secondary" onClick={() => remove(m.eventTitle)} type="button">
                    Delete
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
