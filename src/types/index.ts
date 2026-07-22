export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface CalendarEvent {
  uid: string
  title: string
  startUtc: string
  endUtc: string
  startLocal: string
  endLocal: string
  durationSeconds: number
  dayLabel: string
  dateLabel: string
  calendarName: string
  autoSkipped: boolean
  autoSkipSource?: 'rule' | 'duplicate'
  skipReason?: string
}

export interface JiraTicket {
  key: string
  summary: string
  status: string
  issueType?: string
}

export type MatchType = 'equals' | 'contains' | 'not_contains'

export interface CatchAllMapping {
  eventTitle: string
  jiraKey: string
  matchType: MatchType
}

export interface SkipRule {
  id: string
  type: 'TITLE_CONTAINS' | 'TITLE_EQUALS' | 'TIME_EXACT'
  value: string
}

export interface WorkEntry {
  id: string
  date: string
  dayLabel: string
  startTime: string
  durationSeconds: number
  durationDisplay: string
  calendarEventTitle: string
  logToggle: 'log' | 'skip'
  autoSkipped: boolean
  autoSkipSource?: 'rule' | 'duplicate'
  skipReason?: string
}

export type MatchSource = 'rule' | 'ai' | 'none'

export interface JiraMatch {
  suggestedJiraKey: string
  jiraTaskDescription: string
  confidence: Confidence
  matchReason: string
  matchSource?: MatchSource
}

export type JiraMatchesByWorkEntryId = Record<string, JiraMatch>

export type AiUnavailableReason = 'credits_exhausted' | 'auth_failed'

export interface WorkEntryProcessingResult {
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
  aiUnavailable?: boolean
  aiUnavailableReason?: AiUnavailableReason
}

export interface JiraConfig {
  jiraBaseUrl: string
  defaultProjectKey: string
  timezone: string
  calendarName: string
  catchAllMappings: CatchAllMapping[]
  skipRules: SkipRule[]
  includedIssueTypes?: string[]
  dateRange: {
    start: string
    end: string
  }
  mode?: ImportMode
}

export interface StoredSession {
  schemaVersion: number
  workEntries: WorkEntry[]
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId
  config: JiraConfig
  savedAt: string
  mode?: ImportMode
  ticketsTruncated?: boolean
  aiUnavailable?: boolean
  aiUnavailableReason?: AiUnavailableReason
}

export interface LogResult {
  entryId: string
  issueKey: string
  status: 'pending' | 'success' | 'error'
  worklogId?: string
  errorMessage?: string
}

export type ImportMode = 'jira' | 'csv'

export interface CsvOverride {
  contactName?: string
  invoiceNumber?: string
  dueDate?: string
  description?: string
  unitAmount?: string
  include?: boolean
}

export type CsvOverridesByWorkEntryId = Record<string, CsvOverride>

export interface LearnedMapping {
  eventTitle: string
  counts: Record<string, number> // jiraKey → times logged
  lastUsed: string // ISO date YYYY-MM-DD
}
