'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { JiraTicket } from '@/types'

interface Props {
  value: string
  disabled?: boolean
  defaultProjectKey?: string
  onChange: (key: string) => void
  onBlur: (key: string) => void
  onSelect: (key: string, summary: string) => void
}

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

export function JiraKeyInput({ value, disabled, defaultProjectKey, onChange, onBlur, onSelect }: Props) {
  const [query, setQuery] = useState(value)
  const [results, setResults] = useState<JiraTicket[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [focused, setFocused] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debouncedQuery = useDebounce(query, 300)

  // Keep local query in sync when value changes externally
  useEffect(() => { setQuery(value) }, [value])

  // Search only when focused and user is actively typing
  useEffect(() => {
    if (!focused || debouncedQuery.length < 2 || disabled) {
      setResults([])
      setOpen(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const url = `/api/jira/search?q=${encodeURIComponent(debouncedQuery)}${defaultProjectKey ? `&project=${encodeURIComponent(defaultProjectKey)}` : ''}`
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        setResults(data.results ?? [])
        setOpen((data.results ?? []).length > 0)
        setActiveIndex(-1)
      })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debouncedQuery, disabled])

  // Close on outside click
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const select = useCallback((ticket: JiraTicket) => {
    setQuery(ticket.key)
    setOpen(false)
    setResults([])
    onChange(ticket.key)
    onSelect(ticket.key, ticket.summary)
  }, [onChange, onSelect])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') { setOpen(false); return }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault()
      select(results[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          onChange={e => {
            const v = e.target.value.toUpperCase()
            setQuery(v)
            onChange(v)
          }}
          onFocus={() => setFocused(true)}
          onBlur={e => {
            setFocused(false)
            // Delay so click on dropdown item fires first
            setTimeout(() => onBlur(e.target.value.toUpperCase()), 150)
          }}
          onKeyDown={handleKeyDown}
          placeholder="PROJ-123 or search…"
          className={`w-28 rounded border border-gray-300 px-2 py-1 text-sm font-mono uppercase disabled:bg-transparent disabled:border-transparent text-gray-900 pr-6 outline-none focus:border-[#3F7C85] focus:ring-2 focus:ring-[#3F7C85]/20`}
        />
        {loading && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <svg className="h-3 w-3 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </span>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {results.map((ticket, i) => (
              <li key={ticket.key}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); select(ticket) }}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${i === activeIndex ? 'bg-[#F0F7F9]' : 'hover:bg-[#F0F7F9]'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs font-semibold text-[#3F7C85]">{ticket.key}</span>
                    {ticket.status && (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500">{ticket.status}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-700 line-clamp-2">{ticket.summary}</p>
                </button>
              </li>
            ))}
          </ul>
          <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100">
            <p className="text-[10px] text-gray-400">↑↓ navigate · Enter select · Esc close</p>
          </div>
        </div>
      )}
    </div>
  )
}
