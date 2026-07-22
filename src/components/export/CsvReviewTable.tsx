'use client'

import { useState, useMemo } from 'react'
import type { WorkEntry, CsvOverride, CsvOverridesByWorkEntryId } from '@/types'

type EditableField = 'contactName' | 'invoiceNumber' | 'dueDate' | 'description' | 'unitAmount'

const BULK_FIELDS: Array<{ value: EditableField; label: string; inputType: string }> = [
  { value: 'contactName', label: 'Contact Name', inputType: 'text' },
  { value: 'invoiceNumber', label: 'Invoice Number', inputType: 'text' },
  { value: 'dueDate', label: 'Due Date', inputType: 'date' },
  { value: 'unitAmount', label: 'Unit Amount ($)', inputType: 'number' },
  { value: 'description', label: 'Description', inputType: 'text' },
]

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultDue() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function toHours(seconds: number) {
  return (seconds / 3600).toFixed(2)
}

interface Props {
  workEntries: WorkEntry[]
  overrides: CsvOverridesByWorkEntryId
  contactSuggestions: Record<string, string>
  onChange: (id: string, field: keyof CsvOverride, value: string | boolean) => void
  onBulkChange: (ids: string[], field: EditableField, value: string) => void
}

export function CsvReviewTable({ workEntries, overrides, contactSuggestions, onChange, onBulkChange }: Props) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkField, setBulkField] = useState<EditableField>('contactName')
  const [bulkValue, setBulkValue] = useState('')

  const today = getToday()
  const defaultDue = getDefaultDue()

  const visibleEntries = useMemo(
    () => workEntries.filter(e => !e.autoSkipped),
    [workEntries]
  )

  const allSelected = visibleEntries.length > 0 && visibleEntries.every(e => selectedIds.has(e.id))
  const someSelected = selectedIds.size > 0

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(visibleEntries.map(e => e.id)))
    }
  }

  function toggleRow(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function applyBulk() {
    if (!bulkValue.trim() || selectedIds.size === 0) return
    onBulkChange(Array.from(selectedIds), bulkField, bulkValue.trim())
    setBulkValue('')
  }

  const cellBase = 'px-2 py-1.5 text-sm text-[#26333A]'
  const inputBase = 'w-full rounded-xl border border-[#DCEEF5] bg-[#FBFBF8] px-2 py-1 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-2 focus:ring-[#8FD5C3]/30'

  return (
    <div className="space-y-3">
      {/* Bulk-edit toolbar */}
      {someSelected && (
        <div className="flex flex-wrap items-center gap-3 rounded-[24px] border border-[#3F7C85] bg-[#DCEEF5] px-4 py-3 shadow-sm">
          <span className="text-sm font-bold text-[#26333A]">
            {selectedIds.size} row{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkField}
              onChange={e => { setBulkField(e.target.value as EditableField); setBulkValue('') }}
              className="rounded-xl border border-[#DCEEF5] bg-white px-2 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85]"
            >
              {BULK_FIELDS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <input
              type={BULK_FIELDS.find(f => f.value === bulkField)?.inputType ?? 'text'}
              value={bulkValue}
              onChange={e => setBulkValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') applyBulk() }}
              placeholder={`Set ${BULK_FIELDS.find(f => f.value === bulkField)?.label ?? ''} for selected`}
              className="w-52 rounded-xl border border-[#DCEEF5] bg-white px-2 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85]"
            />
            <button
              type="button"
              onClick={applyBulk}
              disabled={!bulkValue.trim()}
              className="rounded-xl bg-[#3F7C85] px-3 py-1.5 text-sm font-bold text-white transition-colors hover:bg-[#356D75] disabled:opacity-40"
            >
              Apply
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs font-medium text-[#66747A] hover:text-[#26333A]"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-[1400px] divide-y divide-gray-200 text-sm">
          <colgroup>
            <col className="w-[36px]" />
            <col className="w-[160px]" />
            <col className="w-[110px]" />
            <col className="w-[180px]" />
            <col className="w-[110px]" />
            <col className="w-[110px]" />
            <col />
            <col className="w-[80px]" />
            <col className="w-[90px]" />
            <col className="w-[80px]" />
            <col className="w-[80px]" />
            <col className="w-[128px]" />
          </colgroup>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-gray-300 accent-[#3F7C85]"
                  title="Select all"
                />
              </th>
              {[
                'Contact Name', 'Invoice No.', 'Reference', 'Invoice Date', 'Due Date',
                'Description', 'Qty (hrs)', 'Unit ($)', 'Tax', 'Status',
              ].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
              <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                Include
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {visibleEntries.map(entry => {
              const ov = overrides[entry.id] ?? {}
              const included = ov.include !== false
              const isSelected = selectedIds.has(entry.id)
              const rowBg = isSelected ? 'bg-[#DCEEF5]/60' : included ? 'bg-white' : 'bg-gray-50'

              return (
                <tr key={entry.id} className={rowBg}>
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(entry.id)}
                      className="h-4 w-4 rounded border-gray-300 accent-[#3F7C85]"
                    />
                  </td>

                  {/* ContactName — editable, pre-filled from AI suggestion */}
                  <td className={cellBase}>
                    <input
                      type="text"
                      value={ov.contactName ?? contactSuggestions[entry.id] ?? ''}
                      onChange={e => onChange(entry.id, 'contactName', e.target.value)}
                      placeholder="Contact name"
                      className={inputBase}
                    />
                  </td>

                  {/* InvoiceNumber */}
                  <td className={cellBase}>
                    <input
                      type="text"
                      value={ov.invoiceNumber ?? '000001'}
                      onChange={e => onChange(entry.id, 'invoiceNumber', e.target.value)}
                      className={inputBase}
                    />
                  </td>

                  {/* Reference — read-only, event title */}
                  <td className={`${cellBase} text-[#66747A]`}>
                    <div className="max-w-[180px] truncate" title={entry.calendarEventTitle}>
                      {entry.calendarEventTitle}
                    </div>
                  </td>

                  {/* InvoiceDate — read-only */}
                  <td className={`${cellBase} whitespace-nowrap text-[#66747A]`}>{today}</td>

                  {/* DueDate — editable */}
                  <td className={cellBase}>
                    <input
                      type="date"
                      value={ov.dueDate ?? defaultDue}
                      onChange={e => onChange(entry.id, 'dueDate', e.target.value)}
                      className={inputBase}
                    />
                  </td>

                  {/* Description — editable */}
                  <td className={cellBase}>
                    <input
                      type="text"
                      value={ov.description ?? entry.calendarEventTitle}
                      onChange={e => onChange(entry.id, 'description', e.target.value)}
                      className={inputBase}
                    />
                  </td>

                  {/* Quantity — read-only */}
                  <td className={`${cellBase} whitespace-nowrap text-right text-[#66747A]`}>
                    {toHours(entry.durationSeconds)}
                  </td>

                  {/* UnitAmount — editable */}
                  <td className={cellBase}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={ov.unitAmount ?? '100'}
                      onChange={e => onChange(entry.id, 'unitAmount', e.target.value)}
                      className={`${inputBase} w-20 text-right`}
                    />
                  </td>

                  {/* TaxType — read-only */}
                  <td className={`${cellBase} whitespace-nowrap text-[#66747A]`}>200</td>

                  {/* Status — read-only */}
                  <td className={`${cellBase} whitespace-nowrap`}>
                    <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700">
                      DRAFT
                    </span>
                  </td>

                  {/* Include toggle */}
                  <td className="px-2 py-1.5 whitespace-nowrap">
                    {/* w-[104px] removed */}
                    <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => onChange(entry.id, 'include', true)}
                        className={`min-w-0 flex-1 px-3 py-1 ${included ? 'bg-green-100 text-green-700' : 'bg-white text-[#6E6E6E]'}`}
                      >
                        Include
                      </button>
                      <button
                        type="button"
                        onClick={() => onChange(entry.id, 'include', false)}
                        className={`min-w-0 flex-1 px-3 py-1 border-l border-gray-200 ${!included ? 'bg-[#3B3B3B] text-white' : 'bg-white text-[#6E6E6E]'}`}
                      >
                        Skip
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
