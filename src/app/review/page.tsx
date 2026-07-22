'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { CatchAllMapping, SkipRule, LearnedMapping, WorkEntry, JiraMatchesByWorkEntryId, AiUnavailableReason } from '@/types'
import { loadFormConfig, loadSession, saveFormConfig, saveSession, loadLearnedMappings, saveLearnedMappings } from '@/lib/storage'
import { DEFAULT_SKIP_RULES } from '@/lib/skip-rules'
import { exportTimeReviewCsv } from '@/lib/csv-export'
import { ReviewTable } from '@/components/review/ReviewTable'
import type { StatusFilter, StatusOption } from '@/components/review/ReviewTable'
import { SummaryStatsBar } from '@/components/review/SummaryStatsBar'
import { CatchAllMappingsEditor, ExistingMappingRules } from '@/components/upload/CatchAllMappingsEditor'
import { SkipRulesEditor, ExistingIgnoreRules } from '@/components/upload/SkipRulesEditor'
import { LearnedMappingsEditor } from '@/components/upload/LearnedMappingsEditor'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from '@/lib/jira-issue-types'

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

const STATUS_OPTIONS: StatusOption[] = ['MATCHED', 'HIGH', 'MEDIUM', 'LOW', 'SKIPPED', 'IGNORED', 'DUPLICATE']

function StatusMultiSelect({ value, onChange, open, setOpen }: {
  value: StatusFilter
  onChange: (v: StatusFilter) => void
  open: boolean
  setOpen: (v: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [setOpen])

  function toggle(opt: StatusOption) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const label = value.length === 0 ? 'ALL' : value.join(', ')

  return (
    <div className="flex items-center gap-2" ref={ref}>
      <label className="text-sm text-[#66747A]">Filter by status:</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30 min-w-[120px]"
        >
          <span className="flex-1 text-left truncate">{label}</span>
          <svg className="h-3.5 w-3.5 shrink-0 text-[#66747A]" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-40 rounded-2xl border border-[#DCEEF5] bg-white shadow-lg py-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-[#FBFBF8] ${value.length === 0 ? 'font-semibold text-[#3F7C85]' : 'text-[#26333A]'}`}
            >
              ALL
            </button>
            <div className="my-1 border-t border-[#DCEEF5]" />
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-[#26333A] transition-colors hover:bg-[#FBFBF8]"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${value.includes(opt) ? 'border-[#3F7C85] bg-[#3F7C85]' : 'border-[#DCEEF5] bg-white'}`}>
                  {value.includes(opt) && (
                    <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M10 3L5 8.5 2 5.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </span>
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ReviewPage() {
  const router = useRouter()
  const [workEntries, setWorkEntries] = useState<WorkEntry[]>([])
  const [jiraMatchesByWorkEntryId, setJiraMatchesByWorkEntryId] = useState<JiraMatchesByWorkEntryId>({})
  const [catchAllMappings, setCatchAllMappings] = useState<CatchAllMapping[]>([])
  const [skipRules, setSkipRules] = useState<SkipRule[]>([])
  const [learnedMappings, setLearnedMappings] = useState<LearnedMapping[]>([])
  const [mappingModalOpen, setMappingModalOpen] = useState(false)
  const [modalTab, setModalTab] = useState<'mapping' | 'ignore' | 'learned'>('mapping')
  const [loaded, setLoaded] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>([])
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [defaultProjectKey, setDefaultProjectKey] = useState<string | undefined>(undefined)
  const [ticketsTruncated, setTicketsTruncated] = useState(false)
  const [aiUnavailable, setAiUnavailable] = useState(false)
  const [aiUnavailableReason, setAiUnavailableReason] = useState<AiUnavailableReason | undefined>(undefined)

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
    setSkipRules(formConfig?.skipRules ?? DEFAULT_SKIP_RULES)
    setLearnedMappings(loadLearnedMappings())
    // Server is the source of truth; localStorage is a fast first paint + pre-migration fallback.
    fetch('/api/learned-mappings')
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data?.mappings) setLearnedMappings(data.mappings) })
      .catch(() => { /* fall back to localStorage snapshot already set above */ })
    if (formConfig?.defaultProjectKey) setDefaultProjectKey(formConfig.defaultProjectKey)

    const session = loadSession()
    if (!session) {
      setLoaded(true)
      return
    }
    setWorkEntries(session.workEntries)
    setJiraMatchesByWorkEntryId(session.jiraMatchesByWorkEntryId)
    setTicketsTruncated(session.ticketsTruncated ?? false)
    setAiUnavailable(session.aiUnavailable ?? false)
    setAiUnavailableReason(session.aiUnavailableReason)
    setStartDate('')
    setEndDate('')
    setLoaded(true)
  }, [router])

  const handleMappingsChange = useCallback((mappings: CatchAllMapping[]) => {
    setCatchAllMappings(mappings)
    const existing = loadFormConfig()
    saveFormConfig({
      calendarName: existing?.calendarName ?? 'Jasmine: Cordel',
      timezone: existing?.timezone ?? 'Australia/Sydney',
      defaultProjectKey: existing?.defaultProjectKey ?? 'DOC',
      skipRules: existing?.skipRules ?? DEFAULT_SKIP_RULES,
      includedIssueTypes: existing?.includedIssueTypes ?? [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES],
      excludeWeekends: existing?.excludeWeekends ?? false,
      catchAllMappings: mappings,
    })
  }, [])

  const handleSkipRulesChange = useCallback((rules: SkipRule[]) => {
    setSkipRules(rules)
    const existing = loadFormConfig()
    saveFormConfig({
      calendarName: existing?.calendarName ?? 'Jasmine: Cordel',
      timezone: existing?.timezone ?? 'Australia/Sydney',
      defaultProjectKey: existing?.defaultProjectKey ?? 'DOC',
      skipRules: rules,
      includedIssueTypes: existing?.includedIssueTypes ?? [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES],
      excludeWeekends: existing?.excludeWeekends ?? false,
      catchAllMappings: existing?.catchAllMappings ?? [],
    })
  }, [])

  const handleJiraKeyChange = useCallback((id: string, key: string) => {
    setJiraMatchesByWorkEntryId(prev => {
      const updated = {
        ...prev,
        [id]: {
          suggestedJiraKey: key,
          jiraTaskDescription: prev[id]?.jiraTaskDescription ?? '',
          confidence: prev[id]?.confidence ?? 'LOW',
          matchReason: prev[id]?.matchReason ?? '',
        },
      }
      const session = loadSession()
      if (session) saveSession(session.workEntries, updated, session.config)
      return updated
    })
  }, [])

  const handleJiraKeyBlur = useCallback(async (id: string, key: string) => {
    const trimmed = key.trim()
    if (!/^[A-Z]{2,6}-\d+$/.test(trimmed)) return
    try {
      const res = await fetch(`/api/jira/issue?key=${encodeURIComponent(trimmed)}`)
      if (!res.ok) return
      const data = await res.json()
      setJiraMatchesByWorkEntryId(prev => {
        const updated = {
          ...prev,
          [id]: {
            suggestedJiraKey: prev[id]?.suggestedJiraKey ?? trimmed,
            jiraTaskDescription: data.summary ?? '',
            confidence: prev[id]?.confidence ?? 'LOW',
            matchReason: prev[id]?.matchReason ?? '',
          },
        }
        const session = loadSession()
        if (session) saveSession(session.workEntries, updated, session.config)
        return updated
      })
    } catch {
      // silently fail — description stays as-is
    }
  }, [])

  const handleJiraSelect = useCallback((id: string, key: string, summary: string) => {
    setJiraMatchesByWorkEntryId(prev => {
      const updated = {
        ...prev,
        [id]: {
          suggestedJiraKey: key,
          jiraTaskDescription: summary,
          confidence: prev[id]?.confidence ?? 'LOW',
          matchReason: prev[id]?.matchReason ?? '',
          matchSource: prev[id]?.matchSource,
        },
      }
      const session = loadSession()
      if (session) saveSession(session.workEntries, updated, session.config)
      return updated
    })
  }, [])

  const handleToggleChange = useCallback((id: string, toggle: 'log' | 'skip') => {
    setWorkEntries(prev => {
      const updated = prev.map(e => e.id === id ? { ...e, logToggle: toggle } : e)
      const session = loadSession()
      if (session) saveSession(updated, session.jiraMatchesByWorkEntryId, session.config)
      return updated
    })
  }, [])

  if (!loaded) return <div className="p-10 text-center text-sm text-gray-400">Loading...</div>

  return (
    <div className="min-h-screen bg-[#FBFBF8] py-10 text-[#26333A]">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.14em] text-[#3F7C85]">Outputs</p>
            <h1 className="mt-2 text-4xl font-extrabold tracking-[-0.045em] text-[#26333A]">Time Sheets</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-[#66747A]">
              Review imported calendar time, adjust suggested Jira matches, and prepare approved entries for export.
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
              <Button id="time-sheet-mapping-rules" onClick={() => setMappingModalOpen(true)}>Edit and Create Rules</Button>
            </div>
            <p className="text-xs text-[#66747A]">You'll see a summary before anything is sent to Jira.</p>
          </div>
        </div>

        <Modal
          open={mappingModalOpen}
          onClose={() => { setMappingModalOpen(false); setModalTab('mapping') }}
          title="Time Sheet Mapping Rules"
          maxWidthClassName="max-w-3xl"
        >
          <div className="flex border-b border-[#DCEEF5] mb-4">
            {(['mapping', 'ignore', 'learned'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setModalTab(tab)}
                className={`px-5 py-2.5 text-sm font-semibold capitalize transition-colors border-b-2 -mb-px ${modalTab === tab ? 'border-[#3F7C85] text-[#3F7C85]' : 'border-transparent text-[#66747A] hover:text-[#26333A]'}`}
              >
                {tab === 'learned' ? `Learned${learnedMappings.length > 0 ? ` (${learnedMappings.length})` : ''}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {modalTab === 'mapping' && (
            <div className="space-y-3">
              <p className="text-sm text-[#66747A]">
                Create, edit, and delete rules for repeat calendar events before you import time.
              </p>
              <CatchAllMappingsEditor mappings={catchAllMappings} onChange={handleMappingsChange} />
              <ExistingMappingRules mappings={catchAllMappings} onChange={handleMappingsChange} />
            </div>
          )}

          {modalTab === 'ignore' && (
            <div className="space-y-3">
              <p className="text-sm text-[#66747A]">
                Events that match ignore rules are set to &apos;skip&apos; by default. You can override this when reviewing.
              </p>
              <SkipRulesEditor rules={skipRules} onChange={handleSkipRulesChange} />
              <ExistingIgnoreRules rules={skipRules} onChange={handleSkipRulesChange} />
            </div>
          )}

          {modalTab === 'learned' && (
            <div className="space-y-3">
              <p className="text-sm text-[#66747A]">
                The system learns from every approved time log. Learned mappings are applied at LOW confidence and shown in the match reason. You can delete any you no longer want.
              </p>
              <LearnedMappingsEditor
                mappings={learnedMappings}
                onChange={updated => {
                  const removed = learnedMappings.find(m => !updated.some(u => u.eventTitle === m.eventTitle))
                  setLearnedMappings(updated)
                  saveLearnedMappings(updated)
                  if (removed) {
                    fetch('/api/learned-mappings', {
                      method: 'DELETE',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ eventTitle: removed.eventTitle }),
                    }).catch(() => { /* best-effort; local state already updated */ })
                  }
                }}
              />
            </div>
          )}
        </Modal>

        {workEntries.length ? (
          <div className="space-y-4">
            {aiUnavailable && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p>
                  {aiUnavailableReason === 'auth_failed' ? (
                    <>
                      <strong>Sorry, our AI Agent is unavailable to assist you match your events.</strong>{' '}
                      There is a configuration problem on our end (not something you can fix). Showing rule-based matches only — some events below may need manual review. We&apos;ve been notified.
                    </>
                  ) : (
                    <>
                      <strong>Sorry, our AI matching is temporarily unavailable.</strong>{' '}
                      Showing rule-based matches only — some events below may need manual review.
                    </>
                  )}
                </p>
              </div>
            )}
            {ticketsTruncated && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <p>
                  <strong>Ticket list was capped at 500.</strong>{' '}
                  Your project has more than 500 open tickets — only the 500 most recently viewed were loaded. If a match looks wrong, use the Jira Key search to find the right ticket manually.
                </p>
              </div>
            )}
            <div className="mb-4">
              <SummaryStatsBar
                workEntries={workEntries}
                jiraMatchesByWorkEntryId={jiraMatchesByWorkEntryId}
                onFilterNeedsReview={() => setStatusFilter(['LOW', 'MEDIUM'])}
              />
            </div>

            {/* Filters */}
            <div className="mb-4 flex flex-wrap items-center gap-4 rounded-[28px] border border-[#DCEEF5] bg-white/90 px-5 py-4 shadow-sm">
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#66747A]">From:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#66747A]">To:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="rounded-2xl border border-[#DCEEF5] bg-[#FBFBF8] px-3 py-1.5 text-sm text-[#26333A] outline-none focus:border-[#3F7C85] focus:ring-4 focus:ring-[#8FD5C3]/30"
                />
              </div>
              <StatusMultiSelect value={statusFilter} onChange={setStatusFilter} open={statusDropdownOpen} setOpen={setStatusDropdownOpen} />
            </div>

            <ReviewTable
              workEntries={workEntries}
              jiraMatchesByWorkEntryId={jiraMatchesByWorkEntryId}
              startDate={startDate}
              endDate={endDate}
              statusFilter={statusFilter}
              defaultProjectKey={defaultProjectKey}
              onJiraKeyChange={handleJiraKeyChange}
              onJiraKeyBlur={handleJiraKeyBlur}
              onJiraSelect={handleJiraSelect}
              onToggleChange={handleToggleChange}
            />

            <div className="flex flex-wrap justify-end gap-3 rounded-[28px] border border-[#DCEEF5] bg-white px-5 py-4 shadow-sm">
              <Button variant="secondary" onClick={() => exportTimeReviewCsv(workEntries, jiraMatchesByWorkEntryId)}>Export CSV</Button>
              <Button onClick={() => router.push('/confirm')}>Review Time Summary</Button>
            </div>
          </div>
        ) : (
          <div className="rounded-[32px] border border-[#DCEEF5] bg-white/90 p-8 text-center shadow-[0_18px_48px_rgba(38,51,58,0.06)]">
            <h2 className="text-xl font-extrabold tracking-[-0.025em] text-[#26333A]">Imported time will show here for review</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#66747A]">
              Import calendar time when you're ready. This Timesheets page will also hold mapping rules for matching repeat events to Jira work later.
            </p>
            <Button className="mt-5" onClick={() => router.push('/upload')}>
              <span className="flex items-center gap-2">
                <ReloadIcon />
                Re-Import Time
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
