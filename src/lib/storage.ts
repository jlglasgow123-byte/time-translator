import type {
  StoredSession,
  WorkEntry,
  JiraConfig,
  CatchAllMapping,
  SkipRule,
  JiraMatchesByWorkEntryId,
  JiraMatch,
  ImportMode,
  CsvOverridesByWorkEntryId,
  LearnedMapping,
  AiUnavailableReason,
} from '@/types'
import { DEFAULT_INCLUDED_JIRA_ISSUE_TYPES } from './jira-issue-types'

const KEY = 'jtl:session'
const FORM_KEY = 'jtl:form-config'
const LEARNED_KEY = 'jtl:learned'
const CSV_OVERRIDES_KEY = 'jtl:csv-overrides'
const SCHEMA_VERSION = 1

export interface StoredFormConfig {
  calendarName?: string
  timezone: string
  defaultProjectKey: string
  catchAllMappings: CatchAllMapping[]
  skipRules: SkipRule[]
  includedIssueTypes?: string[]
  excludeWeekends?: boolean
}

export function saveFormConfig(config: StoredFormConfig): void {
  try {
    localStorage.setItem(FORM_KEY, JSON.stringify(config))
  } catch { /* quota exceeded */ }
}

export function loadFormConfig(): StoredFormConfig | null {
  try {
    const raw = localStorage.getItem(FORM_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredFormConfig
    return {
      ...parsed,
      includedIssueTypes:
        parsed.includedIssueTypes && parsed.includedIssueTypes.length > 0
          ? parsed.includedIssueTypes
          : [...DEFAULT_INCLUDED_JIRA_ISSUE_TYPES],
    }
  } catch {
    return null
  }
}

type LegacyWorkEntry = WorkEntry & JiraMatch
type LegacyStoredSession = Omit<StoredSession, 'workEntries' | 'jiraMatchesByWorkEntryId'> & {
  entries: LegacyWorkEntry[]
}

function splitLegacyEntries(entries: LegacyWorkEntry[]): {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
} {
  const workEntries: WorkEntry[] = []
  const jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId = {}

  for (const entry of entries) {
    const {
      suggestedJiraKey,
      jiraTaskDescription,
      confidence,
      matchReason,
      ...workEntry
    } = entry

    workEntries.push(workEntry)
    jiraMatchesByWorkEntryId[entry.id] = {
      suggestedJiraKey: suggestedJiraKey ?? '',
      jiraTaskDescription: jiraTaskDescription ?? '',
      confidence: confidence ?? 'LOW',
      matchReason: matchReason ?? '',
    }
  }

  return { workEntries, jiraMatchesByWorkEntryId }
}

export function saveSession(
  workEntries: WorkEntry[],
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId,
  config: JiraConfig,
  mode?: ImportMode,
  ticketsTruncated?: boolean,
  aiUnavailable?: boolean,
  aiUnavailableReason?: AiUnavailableReason
): void {
  const session: StoredSession = {
    schemaVersion: SCHEMA_VERSION,
    workEntries,
    jiraMatchesByWorkEntryId,
    config,
    savedAt: new Date().toISOString(),
    mode,
    ticketsTruncated,
    aiUnavailable,
    aiUnavailableReason,
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // storage quota exceeded — silently fail
  }
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession | LegacyStoredSession
    if (parsed.schemaVersion !== SCHEMA_VERSION) {
      localStorage.removeItem(KEY)
      return null
    }
    if ('workEntries' in parsed && 'jiraMatchesByWorkEntryId' in parsed) {
      return parsed
    }
    if ('entries' in parsed && Array.isArray(parsed.entries)) {
      const { workEntries, jiraMatchesByWorkEntryId } = splitLegacyEntries(parsed.entries)
      return {
        schemaVersion: parsed.schemaVersion,
        workEntries,
        jiraMatchesByWorkEntryId,
        config: parsed.config,
        savedAt: parsed.savedAt,
      }
    }
    return null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

export function saveCsvOverrides(overrides: CsvOverridesByWorkEntryId): void {
  try {
    localStorage.setItem(CSV_OVERRIDES_KEY, JSON.stringify(overrides))
  } catch { /* quota exceeded */ }
}

export function loadCsvOverrides(): CsvOverridesByWorkEntryId {
  try {
    const raw = localStorage.getItem(CSV_OVERRIDES_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CsvOverridesByWorkEntryId
  } catch {
    return {}
  }
}

export function clearCsvOverrides(): void {
  try {
    localStorage.removeItem(CSV_OVERRIDES_KEY)
  } catch { /* ignore */ }
}

export function loadLearnedMappings(): LearnedMapping[] {
  try {
    const raw = localStorage.getItem(LEARNED_KEY)
    if (!raw) return []
    return JSON.parse(raw) as LearnedMapping[]
  } catch {
    return []
  }
}

export function saveLearnedMappings(mappings: LearnedMapping[]): void {
  try {
    localStorage.setItem(LEARNED_KEY, JSON.stringify(mappings))
  } catch { /* quota exceeded */ }
}

// Record that eventTitle was logged to jiraKey today.
// Increments the count for that key, or creates a new entry.
export function recordLearnedCorrection(eventTitle: string, jiraKey: string, today: string): void {
  const existing = loadLearnedMappings()
  const normalised = eventTitle.trim().toLowerCase()
  const idx = existing.findIndex(m => m.eventTitle.trim().toLowerCase() === normalised)
  if (idx >= 0) {
    existing[idx].counts[jiraKey] = (existing[idx].counts[jiraKey] ?? 0) + 1
    existing[idx].lastUsed = today
  } else {
    existing.push({ eventTitle: eventTitle.trim(), counts: { [jiraKey]: 1 }, lastUsed: today })
  }
  saveLearnedMappings(existing)
}

export function deleteLearnedMapping(eventTitle: string): void {
  const existing = loadLearnedMappings()
  saveLearnedMappings(existing.filter(m => m.eventTitle !== eventTitle))
}
