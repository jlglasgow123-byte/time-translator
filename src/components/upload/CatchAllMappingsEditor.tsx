'use client'

import { useState, useEffect, useRef } from 'react'
import type { CatchAllMapping, MatchType } from '@/types'
import { Button } from '@/components/ui/Button'

interface Props {
  mappings: CatchAllMapping[]
  onChange: (mappings: CatchAllMapping[]) => void
}

const MATCH_LABELS: Record<MatchType, string> = {
  equals: 'Equals',
  contains: 'Contains',
  not_contains: 'Does not contain',
}

const inputClass = 'rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30'
const selectClass = 'rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-2 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30'

export function CatchAllMappingsEditor({ mappings, onChange }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const [newKey, setNewKey] = useState('')
  const [newMatchType, setNewMatchType] = useState<MatchType>('contains')
  const fetchedKeys = useRef(new Set<string>())

  async function fetchDescription(key: string) {
    if (fetchedKeys.current.has(key)) return
    fetchedKeys.current.add(key)
    try {
      await fetch(`/api/jira/issue?key=${encodeURIComponent(key)}`)
    } catch { /* ignore */ }
  }

  async function add() {
    if (!newTitle.trim() || !newKey.trim()) return
    const key = newKey.trim().toUpperCase()
    onChange([...mappings, { eventTitle: newTitle.trim(), jiraKey: key, matchType: newMatchType }])
    setNewTitle('')
    setNewKey('')
    setNewMatchType('contains')
    fetchDescription(key)
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  return (
    <div id="create-mapping-rule" className="rounded-[28px] border border-[#DCEEF5] bg-white">
      <div className="px-4 pt-3 pb-1">
        <span className="text-sm font-bold text-[#26333A]">Map calendar events to Jira</span>
        <p className="mt-1 text-xs text-[#66747A]">Map events directly to a Jira key to bypass AI matching.</p>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#66747A] whitespace-nowrap">If calendar event</span>
          <select value={newMatchType} onChange={e => setNewMatchType(e.target.value as MatchType)} className={selectClass}>
            <option value="equals">Equals</option>
            <option value="contains">Contains</option>
            <option value="not_contains">Does not contain</option>
          </select>
          <input
            type="text"
            placeholder="Event title"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={handleAddKeyDown}
            className={`flex-1 min-w-40 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[#66747A] whitespace-nowrap">Then log time to</span>
          <input
            type="text"
            placeholder="PROJ-123"
            value={newKey}
            onChange={e => setNewKey(e.target.value.toUpperCase())}
            onKeyDown={handleAddKeyDown}
            className={`w-28 font-mono uppercase ${inputClass}`}
          />
          <Button variant="secondary" onClick={add} type="button">Add</Button>
        </div>
      </div>
    </div>
  )
}

export function ExistingMappingRules({ mappings, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editKey, setEditKey] = useState('')
  const [editMatchType, setEditMatchType] = useState<MatchType>('contains')
  const [descriptions, setDescriptions] = useState<Record<string, string>>({})
  const fetchedKeys = useRef(new Set<string>())

  async function fetchDescription(key: string) {
    if (fetchedKeys.current.has(key)) return
    fetchedKeys.current.add(key)
    try {
      const res = await fetch(`/api/jira/issue?key=${encodeURIComponent(key)}`)
      if (res.ok) {
        const data = await res.json()
        setDescriptions(prev => ({ ...prev, [key]: data.summary ?? '' }))
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    mappings.forEach(m => fetchDescription(m.jiraKey))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function remove(i: number) {
    if (editingIndex === i) setEditingIndex(null)
    onChange(mappings.filter((_, idx) => idx !== i))
  }

  function startEdit(i: number) {
    setEditingIndex(i)
    setEditTitle(mappings[i].eventTitle)
    setEditKey(mappings[i].jiraKey)
    setEditMatchType(mappings[i].matchType ?? 'contains')
  }

  function saveEdit(i: number) {
    if (!editTitle.trim() || !editKey.trim()) return
    const key = editKey.trim().toUpperCase()
    onChange(mappings.map((m, idx) =>
      idx === i ? { eventTitle: editTitle.trim(), jiraKey: key, matchType: editMatchType } : m
    ))
    fetchDescription(key)
    setEditingIndex(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(i) }
    if (e.key === 'Escape') setEditingIndex(null)
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
            <span className="text-sm font-bold text-[#26333A]">Existing mapping rules</span>
            <span className="rounded-full bg-[#DCEEF5] px-2 py-0.5 text-xs font-bold text-[#3F7C85]">{mappings.length}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#66747A]">Expand to view, edit or delete your existing mapping rules.</p>
        </div>
      </button>

      {open && (
        <ul className="divide-y divide-[#DCEEF5] border-t border-[#DCEEF5] text-sm">
          {mappings.length === 0 ? (
            <li className="px-4 py-3 text-xs text-[#66747A] italic">No mapping rules yet.</li>
          ) : mappings.map((m, i) => ( // eslint-disable-line
            <li key={i} className="px-4 py-2.5">
              {editingIndex === i ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-[#66747A]">If calendar event</span>
                    <select value={editMatchType} onChange={e => setEditMatchType(e.target.value as MatchType)} className="rounded border border-[#3F7C85] px-2 py-1 text-sm text-[#26333A]">
                      <option value="equals">Equals</option>
                      <option value="contains">Contains</option>
                      <option value="not_contains">Does not contain</option>
                    </select>
                    <input autoFocus value={editTitle} onChange={e => setEditTitle(e.target.value)} onKeyDown={e => handleEditKeyDown(e, i)} className="flex-1 min-w-32 rounded border border-[#3F7C85] px-2 py-1 text-sm text-[#26333A]" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#66747A]">Then log time to</span>
                    <input value={editKey} onChange={e => setEditKey(e.target.value.toUpperCase())} onKeyDown={e => handleEditKeyDown(e, i)} className="w-28 rounded border border-[#3F7C85] px-2 py-1 text-sm font-mono uppercase text-[#26333A]" />
                    <button onClick={() => saveEdit(i)} className="text-xs font-medium text-[#3F7C85] hover:text-[#356D75]">Save</button>
                    <button onClick={() => setEditingIndex(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[#26333A]">
                      <span className="text-[#66747A] text-xs">{MATCH_LABELS[m.matchType ?? 'contains']}:</span>
                      <span className="mx-1 font-medium">"{m.eventTitle}"</span>
                      <span className="text-[#66747A] mx-1">-&gt;</span>
                      <span className="font-mono text-[#3F7C85]">{m.jiraKey}</span>
                    </div>
                    {descriptions[m.jiraKey] && (
                      <p className="mt-0.5 text-xs text-gray-400 truncate">{descriptions[m.jiraKey]}</p>
                    )}
                  </div>
                  <div className="flex gap-3 shrink-0 pt-0.5">
                    <button onClick={() => startEdit(i)} className="text-xs text-gray-400 hover:text-[#3F7C85]">Edit</button>
                    <button onClick={() => remove(i)} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
