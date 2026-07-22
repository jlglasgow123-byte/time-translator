import { toJiraStarted } from './timezone'
import { MAX_JIRA_TICKETS_PER_FETCH } from './security-limits'
import { captureAppEvent } from './observability'
import type { JiraTicket } from '@/types'

export interface JiraCredentials {
  baseUrl: string
  accessToken: string
}

interface WorklogPayload {
  issueKey: string
  startedAt: string   // ISO local
  durationSeconds: number
  comment?: string
}

function makeHeaders(creds: JiraCredentials): HeadersInit {
  return {
    Authorization: `Bearer ${creds.accessToken}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

function base(creds: JiraCredentials): string {
  return creds.baseUrl.replace(/\/$/, '')
}

function parseIssues(issues: Record<string, unknown>[]): JiraTicket[] {
  return issues.map((issue: Record<string, unknown>) => ({
    key: issue.key as string,
    summary: (issue.fields as Record<string, unknown>)?.summary as string ?? '',
    status: ((issue.fields as Record<string, unknown>)?.status as Record<string, unknown>)?.name as string ?? '',
    issueType: ((issue.fields as Record<string, unknown>)?.issuetype as Record<string, unknown>)?.name as string ?? '',
  }))
}

interface JiraSearchPage {
  issues?: Record<string, unknown>[]
  total?: number
  nextPageToken?: string
}

async function fetchJiraPage(
  creds: JiraCredentials,
  url: string,
  body: Record<string, unknown>
): Promise<JiraSearchPage> {
  const res = await fetch(url, {
    method: 'POST',
    headers: makeHeaders(creds),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Your Jira connection has expired. Please reconnect Jira in Settings.')
    if (res.status === 404) throw new Error('Could not reach your Jira account. Please check your Jira URL in Settings.')
    throw new Error('Could not fetch Jira tickets. Please check your connection in Settings.')
  }
  return res.json()
}

async function runJiraSearch(
  creds: JiraCredentials,
  url: string,
  jql: string,
  maxTickets = MAX_JIRA_TICKETS_PER_FETCH
): Promise<{ tickets: JiraTicket[]; truncated: boolean }> {
  const PAGE_SIZE = 100
  const baseBody: Record<string, unknown> = { jql, maxResults: PAGE_SIZE, fields: ['summary', 'status', 'issuetype'] }
  const isModern = url.endsWith('/search/jql')

  // Fetch page 1
  const firstData = await fetchJiraPage(creds, url, baseBody)
  const firstIssues = firstData.issues ?? []
  const tickets: JiraTicket[] = parseIssues(firstIssues)
  if (tickets.length >= maxTickets) return { tickets: tickets.slice(0, maxTickets), truncated: true }

  if (isModern) {
    // Modern cursor API: must page sequentially (no total count, token-based)
    let nextPageToken = firstData.nextPageToken
    while (nextPageToken && firstIssues.length > 0) {
      const data = await fetchJiraPage(creds, url, { ...baseBody, nextPageToken })
      const issues = data.issues ?? []
      tickets.push(...parseIssues(issues))
      if (tickets.length >= maxTickets) return { tickets: tickets.slice(0, maxTickets), truncated: true }
      nextPageToken = data.nextPageToken
      if (!issues.length) break
    }
  } else {
    // Legacy offset API: we know `total` from page 1, so fire all remaining pages in parallel
    const total = firstData.total ?? 0
    if (total > PAGE_SIZE) {
      const remainingPages: number[] = []
      for (let startAt = PAGE_SIZE; startAt < Math.min(total, maxTickets); startAt += PAGE_SIZE) {
        remainingPages.push(startAt)
      }
      const pageResults = await Promise.all(
        remainingPages.map(startAt => fetchJiraPage(creds, url, { ...baseBody, startAt }))
      )
      for (const data of pageResults) {
        tickets.push(...parseIssues(data.issues ?? []))
        if (tickets.length >= maxTickets) return { tickets: tickets.slice(0, maxTickets), truncated: true }
      }
    }
  }

  return { tickets, truncated: false }
}

// Process-memory cache for open-ticket lookups, keyed by account + query shape.
// Jira's open-ticket list rarely changes within a session, and re-fetching it is
// the dominant cost on repeat imports (see Item 2 investigation). TTL keeps staleness bounded.
const TICKET_CACHE_TTL_MS = 2 * 60 * 1000
const ticketCache = new Map<string, { expiresAt: number; result: { tickets: JiraTicket[]; truncated: boolean } }>()

function ticketCacheKey(creds: JiraCredentials, keys: string[], issueTypes: string[], maxTickets: number): string {
  return [base(creds), [...keys].sort().join(','), [...issueTypes].sort().join(','), maxTickets].join('|')
}

export async function fetchOpenTickets(
  creds: JiraCredentials,
  projectKeys: string | string[],
  issueTypes: string[] = [],
  maxTickets = MAX_JIRA_TICKETS_PER_FETCH
): Promise<{ tickets: JiraTicket[]; truncated: boolean }> {
  const keys = Array.isArray(projectKeys) ? projectKeys : [projectKeys]

  const cacheKey = ticketCacheKey(creds, keys, issueTypes, maxTickets)
  const cached = ticketCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  const projectList = keys.map(k => `"${k}"`).join(', ')
  const issueTypeClause = issueTypes.length
    ? ` AND issuetype in (${issueTypes.map(type => `"${type}"`).join(', ')})`
    : ''
  const jql = `project in (${projectList}) AND statusCategory not in (Done)${issueTypeClause} ORDER BY updated DESC`
  const modernUrl = `${base(creds)}/rest/api/3/search/jql`
  const legacyUrl = `${base(creds)}/rest/api/3/search`

  let result: { tickets: JiraTicket[]; truncated: boolean }
  // Try modern API first; only fall back to legacy if it throws (not just returns empty)
  try {
    result = await runJiraSearch(creds, modernUrl, jql, maxTickets)
  } catch (error) {
    console.warn('[jira] modern search failed, retrying legacy search', error)
    captureAppEvent('Jira modern search failed; retrying legacy search', 'warning', {
      eventType: 'jira_search_fallback',
      action: 'jira_search',
      status: 'fallback',
      errorCode: 'jira_modern_search_failed',
      details: { projectKeyCount: keys.length, issueTypeCount: issueTypes.length },
    })
    result = await runJiraSearch(creds, legacyUrl, jql, maxTickets)
  }

  ticketCache.set(cacheKey, { expiresAt: Date.now() + TICKET_CACHE_TTL_MS, result })
  return result
}

export async function logWorklog(
  creds: JiraCredentials,
  payload: WorklogPayload
): Promise<{ worklogId: string }> {
  const url = `${base(creds)}/rest/api/3/issue/${payload.issueKey}/worklog`

  const body = {
    started: toJiraStarted(payload.startedAt),
    timeSpentSeconds: payload.durationSeconds,
    ...(payload.comment ? {
      comment: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: payload.comment }] }],
      }
    } : {}),
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: makeHeaders(creds),
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Your Jira connection has expired. Please reconnect Jira in Settings.')
    if (res.status === 404) throw new Error(`Could not find Jira issue ${payload.issueKey}. It may have been deleted or moved.`)
    throw new Error(`Could not log time to ${payload.issueKey}. Please try again or check your Jira connection in Settings.`)
  }

  const data = await res.json()
  return { worklogId: String(data.id) }
}

export async function fetchIssue(
  creds: JiraCredentials,
  key: string
): Promise<{ key: string; summary: string } | null> {
  const res = await fetch(
    `${base(creds)}/rest/api/3/issue/${key}?fields=summary`,
    { headers: makeHeaders(creds) }
  )
  if (!res.ok) return null
  const data = await res.json()
  return { key, summary: data.fields?.summary ?? '' }
}

export async function searchIssues(
  creds: JiraCredentials,
  query: string,
  defaultProjectKey?: string,
  maxResults = 15
): Promise<JiraTicket[]> {
  // Run two searches in parallel:
  // 1. JQL scoped to default project (prioritised, more results)
  // 2. issue/picker for cross-project fallback
  const pickerUrl = `${base(creds)}/rest/api/3/issue/picker?query=${encodeURIComponent(query)}&currentJQL=statusCategory+not+in+(Done)&showSubTasks=true&showSubTaskParent=true`

  const jqlQuery = defaultProjectKey
    ? `project = "${defaultProjectKey}" AND statusCategory not in (Done) AND summary ~ "${query.replace(/"/g, '')}" ORDER BY updated DESC`
    : null

  const [pickerData, jqlResults] = await Promise.all([
    fetch(pickerUrl, { headers: makeHeaders(creds) }).then(r => r.ok ? r.json() : { sections: [] }).catch(() => ({ sections: [] })),
    jqlQuery
      ? fetch(`${base(creds)}/rest/api/3/search`, {
          method: 'POST',
          headers: makeHeaders(creds),
          body: JSON.stringify({ jql: jqlQuery, maxResults: 10, fields: ['summary', 'status', 'issuetype'] }),
        }).then(r => r.ok ? r.json() : { issues: [] }).catch(() => ({ issues: [] }))
      : Promise.resolve({ issues: [] }),
  ])

  const seen = new Set<string>()
  const tickets: JiraTicket[] = []

  // Default project JQL results first
  for (const issue of jqlResults.issues ?? []) {
    if (seen.has(issue.key)) continue
    seen.add(issue.key)
    tickets.push({
      key: issue.key,
      summary: issue.fields?.summary ?? '',
      status: issue.fields?.status?.name ?? '',
      issueType: issue.fields?.issuetype?.name ?? '',
    })
  }

  // Then picker results (other projects)
  for (const section of pickerData.sections ?? []) {
    for (const issue of section.issues ?? []) {
      if (seen.has(issue.key)) continue
      seen.add(issue.key)
      tickets.push({
        key: issue.key,
        summary: issue.summaryText ?? issue.summary ?? '',
        status: '',
        issueType: '',
      })
    }
  }

  return tickets.slice(0, maxResults)
}

export async function checkJiraConnection(creds: JiraCredentials): Promise<{ email: string }> {
  const res = await fetch(`${base(creds)}/rest/api/3/myself`, { headers: makeHeaders(creds) })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Your Jira connection has expired. Please reconnect in Settings.')
    if (res.status === 404) throw new Error('Could not reach your Jira account. Please reconnect in Settings.')
    throw new Error('Could not connect to Jira. Please check your connection in Settings.')
  }
  const data = await res.json()
  return { email: data.emailAddress ?? data.displayName ?? 'unknown' }
}

export async function fetchAllIssueWorklogs(
  creds: JiraCredentials,
  issueKey: string
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let startAt = 0
  while (true) {
    const res = await fetch(
      `${base(creds)}/rest/api/3/issue/${issueKey}/worklog?maxResults=100&startAt=${startAt}`,
      { headers: makeHeaders(creds) }
    )
    if (!res.ok) break
    const data = await res.json()
    const page: Record<string, unknown>[] = data.worklogs ?? []
    all.push(...page)
    if (all.length >= (data.total ?? 0) || page.length === 0) break
    startAt += page.length
  }
  return all
}
