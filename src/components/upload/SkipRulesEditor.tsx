'use client'

import { useState } from 'react'
import type { SkipRule } from '@/types'
import { Button } from '@/components/ui/Button'

interface Props {
  rules: SkipRule[]
  onChange: (rules: SkipRule[]) => void
}

function ruleLabel(rule: SkipRule): string {
  if (rule.type === 'TITLE_EQUALS') return `Title equals "${rule.value}"`
  return `Title contains "${rule.value}"`
}

export function SkipRulesEditor({ rules, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [newType, setNewType] = useState<'TITLE_CONTAINS' | 'TITLE_EQUALS'>('TITLE_CONTAINS')
  const [newValue, setNewValue] = useState('')

  function add() {
    if (!newValue.trim()) return
    onChange([...rules, { id: Date.now().toString(), type: newType, value: newValue.trim() }])
    setNewValue('')
  }

  function handleAddKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); add() }
  }

  return (
    <div id="create-ignore-rule" className="rounded-[28px] border border-[#DCEEF5] bg-white">
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse create ignore rule' : 'Expand create ignore rule'}
          className="rounded-full p-1 text-[#3f7c85] transition-colors hover:bg-[#DCEEF5]"
        >
          <svg className={`h-4 w-4 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-left">
          <span className="text-sm font-bold text-[#26333A]">Create an Ignore Rule</span>
          <p className="mt-0.5 text-xs text-[#66747A]">Events that match ignore rules are set to 'skip' by default. You can manually override this when you review your time.</p>
        </div>
        <Button variant="secondary" type="button" onClick={() => setOpen(o => !o)}>
          Create
        </Button>
      </div>
      {open && (
      <div className="border-t border-[#DCEEF5] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={newType}
            onChange={e => setNewType(e.target.value as 'TITLE_CONTAINS' | 'TITLE_EQUALS')}
            className="rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-2 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
          >
            <option value="TITLE_CONTAINS">Title contains</option>
            <option value="TITLE_EQUALS">Title equals</option>
          </select>
          <input
            type="text"
            placeholder="e.g. Lunch"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={handleAddKeyDown}
            className="flex-1 min-w-40 rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
          />
          <Button onClick={add} type="button" className="px-6">Add Rule</Button>
        </div>
      </div>
      )}
    </div>
  )
}

export function ExistingIgnoreRules({ rules, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState<'TITLE_CONTAINS' | 'TITLE_EQUALS'>('TITLE_CONTAINS')
  const [editValue, setEditValue] = useState('')

  function remove(id: string) {
    if (editingId === id) setEditingId(null)
    onChange(rules.filter(r => r.id !== id))
  }

  function startEdit(rule: SkipRule) {
    setEditingId(rule.id)
    setEditType(rule.type === 'TITLE_EQUALS' ? 'TITLE_EQUALS' : 'TITLE_CONTAINS')
    setEditValue(rule.value)
  }

  function saveEdit(id: string) {
    if (!editValue.trim()) return
    onChange(rules.map(r => r.id === id ? { ...r, type: editType, value: editValue.trim() } : r))
    setEditingId(null)
  }

  function handleEditKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(id) }
    if (e.key === 'Escape') setEditingId(null)
  }

  return (
    <div className="rounded-[28px] border border-[#DCEEF5] bg-white">
      <div className="flex w-full items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-label={open ? 'Collapse ignore rules' : 'Expand ignore rules'}
          className="rounded-full p-1 text-[#3f7c85] transition-colors hover:bg-[#DCEEF5]"
        >
          <svg className={`h-4 w-4 transition-transform shrink-0 ${open ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#26333A]">Edit Existing Ignore Rules</span>
            <span className="rounded-full bg-[#DCEEF5] px-2 py-0.5 text-xs font-bold text-[#3F7C85]">{rules.length}</span>
          </div>
          <p className="mt-0.5 text-xs text-[#66747A]">Expand to view, edit or delete your existing ignore rules.</p>
        </div>
        <Button variant="secondary" type="button" onClick={() => setOpen(o => !o)}>
          Edit/Delete
        </Button>
      </div>

      {open && (
        <ul className="divide-y divide-[#DCEEF5] border-t border-[#DCEEF5] text-sm">
          {rules.length === 0 ? (
            <li className="px-4 py-3 text-xs text-[#66747A] italic">No ignore rules yet.</li>
          ) : rules.map(rule => (
            <li key={rule.id} className="px-4 py-2.5">
              {editingId === rule.id ? (
                <div className="flex flex-wrap items-center gap-2">
                  <select value={editType} onChange={e => setEditType(e.target.value as 'TITLE_CONTAINS' | 'TITLE_EQUALS')} className="rounded border border-[#3F7C85] px-2 py-1 text-sm text-[#26333A]">
                    <option value="TITLE_CONTAINS">Title contains</option>
                    <option value="TITLE_EQUALS">Title equals</option>
                  </select>
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => handleEditKeyDown(e, rule.id)} className="flex-1 rounded border border-[#3F7C85] px-2 py-1 text-sm text-[#26333A]" />
                  <button onClick={() => saveEdit(rule.id)} className="text-xs font-medium text-[#3F7C85] hover:text-[#356D75]">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#26333A]">{ruleLabel(rule)}</span>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => startEdit(rule)} className="text-xs text-gray-400 hover:text-[#3F7C85]">Edit</button>
                    <button onClick={() => remove(rule.id)} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
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
