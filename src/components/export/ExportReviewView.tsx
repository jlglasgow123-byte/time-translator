'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CatchAllMapping, WorkEntry, CsvOverride, CsvOverridesByWorkEntryId } from '@/types'
import {
  loadFormConfig, loadSession, saveFormConfig, saveCsvOverrides, loadCsvOverrides,
} from '@/lib/storage'
import { exportCsv } from '@/lib/csv-export'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'
import { CsvReviewTable } from '@/components/export/CsvReviewTable'
import { CatchAllMappingsEditor, ExistingMappingRules } from '@/components/upload/CatchAllMappingsEditor'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-[#DCEEF5]" />
      <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">{children}</span>
      <div className="h-px flex-1 bg-[#DCEEF5]" />
    </div>
  )
}

function ReloadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M4.5 9.5A5.5 5.5 0 0114 5.7V4a1 1 0 112 0v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.57A3.5 3.5 0 106.5 9.5a1 1 0 11-2 0zm10 1a1 1 0 011 1A5.5 5.5 0 016 15.3V17a1 1 0 11-2 0v-4a1 1 0 011-1h4a1 1 0 110 2H7.43a3.5 3.5 0 006.07-2.5 1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  )
}

interface Props {
  eyebrow: string
  title: string
  description: string
}

// Shared implementation behind both /export-review and /invoices — same session
// data, same csv-export.ts logic, no divergent export code between the two routes.
export function ExportReviewView({ eyebrow, title, description }: Props) {
  const router = useRouter()
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([])
  const [overrides, setOverrides] = useState<CsvOverridesByWorkEntryId>({})
  const [contactSuggestions, setContactSuggestions] = useState<Record<string, string>>({})
  const [catchAllMappings, setCatchAllMappings] = useState<CatchAllMapping[]>([])
  const [mappingModalOpen, setMappingModalOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [suggestingContacts, setSuggestingContacts] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace('/login')
    })
    return () => subscription.unsubscribe()
  }, [router])

  useEffect(() => {
    const formConfig = loadFormConfig()
    setCatchAllMappings(formConfig?.catchAllMappings ?? [])

    const session = loadSession()
    if (!session) {
      setLoaded(true)
      return
    }

    const entries = session.workEntries
    setWorkEntries(entries)

    const savedOverrides = loadCsvOverrides()
    setOverrides(savedOverrides)
    setLoaded(true)

    // Auto-suggest contact names on load
    const visibleEntries = entries.filter(e => !e.autoSkipped)
    if (visibleEntries.length === 0) return

    setSuggestingContacts(true)
    fetch('/api/suggest-contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventTitles: visibleEntries.map(e => e.calendarEventTitle) }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.suggestions) return
        const map: Record<string, string> = {}
        visibleEntries.forEach((e, i) => {
          if (data.suggestions[i]) map[e.id] = data.suggestions[i]
        })
        setContactSuggestions(map)
      })
      .catch(() => { /* suggestions are best-effort */ })
      .finally(() => setSuggestingContacts(false))
  }, [])

  const handleOverrideChange = useCallback((id: string, field: keyof CsvOverride, value: string | boolean) => {
    setOverrides(prev => {
      const updated = { ...prev, [id]: { ...prev[id], [field]: value } }
      saveCsvOverrides(updated)
      return updated
    })
  }, [])

  const handleBulkChange = useCallback((ids: string[], field: keyof CsvOverride, value: string) => {
    setOverrides(prev => {
      const updated = { ...prev }
      for (const id of ids) {
        updated[id] = { ...updated[id], [field]: value }
      }
      saveCsvOverrides(updated)
      return updated
    })
  }, [])

  const handleMappingsChange = useCallback((mappings: CatchAllMapping[]) => {
    setCatchAllMappings(mappings)
    const existing = loadFormConfig()
    saveFormConfig({
      calendarName: existing?.calendarName ?? '',
      timezone: existing?.timezone ?? 'Australia/Sydney',
      defaultProjectKey: existing?.defaultProjectKey ?? '',
      skipRules: existing?.skipRules ?? DEFAULT_SKIP_RULES,
      includedIssueTypes: existing?.includedIssueTypes ?? [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES],
      excludeWeekends: existing?.excludeWeekends ?? false,
      catchAllMappings: mappings,
    })
  }, [])

  const includedCount = workEntries.filter(e => !e.autoSkipped && overrides[e.id]?.include !== false).length

  if (!loaded) return <div className="p-10 text-center text-sm text-gray-400">Loading...</div>

  return (
    <div className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-[1600px] px-4">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">{eyebrow}</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">{title}</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#66747A]">
              {description}
              {suggestingContacts && (
                <span className="ml-2 text-xs italic text-[#3F7C85]">Suggesting contact names…</span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-start gap-1 lg:items-end">
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => router.push('/upload')}>
                <span className="flex items-center gap-2">
                  <ReloadIcon />
                  Re-Import Time
                </span>
              </Button>
              <Button onClick={() => setMappingModalOpen(true)}>Edit and Create Rules</Button>
            </div>
            <p className="text-xs text-[#66747A]">{includedCount} rows will be exported.</p>
          </div>
        </div>

        <Modal
          open={mappingModalOpen}
          onClose={() => setMappingModalOpen(false)}
          title="Export Mapping Rules"
          maxWidthClassName="max-w-3xl"
        >
          <SectionHeading>Mapping</SectionHeading>
          <p className="text-sm text-[#66747A]">
            Create rules to automatically map repeat calendar events before import.
          </p>
          <CatchAllMappingsEditor mappings={catchAllMappings} onChange={handleMappingsChange} />
          <ExistingMappingRules mappings={catchAllMappings} onChange={handleMappingsChange} />
        </Modal>

        {workEntries.length ? (
          <div className="space-y-4">
            <CsvReviewTable
              workEntries={workEntries}
              overrides={overrides}
              contactSuggestions={contactSuggestions}
              onChange={handleOverrideChange}
              onBulkChange={handleBulkChange}
            />

            <div className="flex flex-wrap justify-end gap-3 rounded-[28px] border border-[#DCEEF5] bg-white px-5 py-4 shadow-sm">
              <Button
                onClick={() => exportCsv(workEntries, overrides)}
                disabled={includedCount === 0}
              >
                Export CSV ({includedCount} rows)
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-8 text-center shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
            <h2 className="text-xl font-extrabold tracking-[-0.025em] text-[#26333A]">No time imported yet</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#66747A]">
              Go back to import calendar time, then choose &ldquo;Review your export&rdquo; to build your CSV export.
            </p>
            <Button className="mt-5" onClick={() => router.push('/upload')}>
              <span className="flex items-center gap-2">
                <ReloadIcon />
                Import Time
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
