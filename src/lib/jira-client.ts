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

// Escape a user-typed string for use inside a double-quoted JQL literal.
// Backslashes first, otherwise we'd double-escape the ones we just added.
function escapeJqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// The operand of JQL's `~` is parsed as a Lucene query, not an opaque string, so
// ordinary typed text can be a syntax error (a stray colon, bracket or trailing
// hyphen) or silently change meaning (`*` = prefix search, `~` = fuzzy). Strip the
// Lucene specials and the reserved boolean words, leaving plain terms to match on.
function sanitiseForTextSearch(query: string): string {
  return query
    // Note the explicit \\ and \/ — writing these as one class risks `\\/` being
    // read as a literal slash, silently dropping backslash from the set.
    .replace(/[+!(){}[\]^"~*?:&|]/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\//g, ' ')
    // Hyphens are only operators at a term boundary — keep them inside words so
    // "DOC-572", "check-in" and "Smith-Jones" stay single terms. Strips both
    // leading ("-foo") and trailing ("DOC-", the normal mid-typing state).
    .replace(/(^|\s)-+/g, '$1')
    .replace(/-+(?=\s|$)/g, '')
    .replace(/\b(AND|OR|NOT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseIssues(issues: Record<string, unknown>[]): JiraTicket[] {
  return issues.map((issue: Record<string, unknown>) => ({
    key: issue.key as string,
    summary: (issue.fields as Record<string, unknown>)?.summary as string ?? '',
    status: ((issue.fields as Record<string, unknown>)?.status as Record<string, unknown>)?.name as string ?? '',
    statusCategory: (((issue.fields as Record<string, unknown>)?.status as Record<string, unknown>)
      ?.statusCategory as Record<string, unknown>)?.name as string ?? '',
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
  const keys = (Array.isArray(projectKeys) ? projectKeys : [projectKeys]).filter(Boolean)

  // No default project set yet — `project in ()` is invalid JQL, so return nothing
  // rather than sending a broken query.
  if (keys.length === 0) return { tickets: [], truncated: false }

  const cacheKey = ticketCacheKey(creds, keys, issueTypes, maxTickets)
  const cached = ticketCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result
  }

  const projectList = keys.map(k => `"${escapeJqlLiteral(k)}"`).join(', ')
  const issueTypeClause = issueTypes.length
    ? ` AND issuetype in (${issueTypes.map(type => `"${escapeJqlLiteral(type)}"`).join(', ')})`
    : ''
  // Include recently-closed tickets: time is often logged retrospectively against
  // work that has since been completed. Keyed on statusCategoryChangedDate, not
  // resolutiondate — many workflows move an issue to Done without setting a
  // resolution, leaving resolutiondate null and the ticket invisible.
  // Bounded to 45 days so a long-history project can't push the result set past
  // MAX_JIRA_TICKETS_PER_FETCH, which would silently truncate open tickets in
  // favour of closed ones (ORDER BY updated DESC).
  const jql = `project in (${projectList}) AND (statusCategory not in (Done) OR (statusCategory = Done AND statusCategoryChangedDate >= -45d))${issueTypeClause} ORDER BY updated DESC`
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

export interface JiraProject {
  key: string
  name: string
}

// Projects the connected user can browse, optionally filtered by a typed query.
// Used by the "pick your default project" step after connecting Jira.
export async function searchProjects(
  creds: JiraCredentials,
  query?: string,
  maxResults = 50
): Promise<JiraProject[]> {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    orderBy: 'name',
  })
  if (query) params.set('query', query)

  const res = await fetch(`${base(creds)}/rest/api/3/project/search?${params}`, {
    headers: makeHeaders(creds),
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('Your Jira connection has expired. Please reconnect Jira in Settings.')
    }
    throw new Error('Could not load your Jira projects. Please try again.')
  }

  const data = await res.json()
  // Drop anything without a usable key — a keyless project would end up saved as
  // the user's default and match nothing.
  return (data.values ?? [])
    .filter((p: Record<string, unknown>) => typeof p.key === 'string' && p.key.length > 0)
    .map((p: Record<string, unknown>) => ({
      key: p.key as string,
      name: typeof p.name === 'string' && p.name ? p.name : (p.key as string),
    }))
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
  // No status filter on either path: the user typed a query, so don't second-guess it
  // by hiding tickets whose status they never asked about. Default-project results
  // carry a real status; picker results do not (see the known gap below).
  const pickerUrl = `${base(creds)}/rest/api/3/issue/picker?query=${encodeURIComponent(query)}&showSubTasks=true&showSubTaskParent=true`

  // `text ~` covers summary + description + comments + environment — the same field set
  // Jira's own quick search uses. `summary ~` alone was narrower than users expect.
  // Skip the JQL leg entirely if sanitising leaves no searchable terms (e.g. "!!!"),
  // since `text ~ ""` is a 400. The picker still runs on the raw query.
  const searchTerms = sanitiseForTextSearch(query)
  const jqlQuery = defaultProjectKey && searchTerms
    ? `project = "${escapeJqlLiteral(defaultProjectKey)}" AND text ~ "${escapeJqlLiteral(searchTerms)}" ORDER BY updated DESC`
    : null

  // Both legs degrade to empty rather than failing the whole search — one path
  // returning results is better than none. But a failure is reported rather than
  // silently looking like "no matches", which is indistinguishable to the user.
  const reportSearchFailure = (leg: string, status?: number) => {
    captureAppEvent(`Jira ticket search leg failed (${leg})`, 'warning', {
      eventType: 'jira_ticket_search_failed',
      action: 'jira_ticket_search',
      status: 'failed',
      errorCode: `jira_search_${leg}_${status ?? 'network'}`,
      details: { leg, httpStatus: status ?? null, queryLength: query.length },
    })
  }

  const [pickerData, jqlResults] = await Promise.all([
    fetch(pickerUrl, { headers: makeHeaders(creds) })
      .then(r => {
        if (!r.ok) { reportSearchFailure('picker', r.status); return { sections: [] } }
        return r.json()
      })
      .catch(() => { reportSearchFailure('picker'); return { sections: [] } }),
    jqlQuery
      ? fetch(`${base(creds)}/rest/api/3/search`, {
          method: 'POST',
          headers: makeHeaders(creds),
          body: JSON.stringify({ jql: jqlQuery, maxResults: 10, fields: ['summary', 'status', 'issuetype'] }),
        })
          .then(r => {
            if (!r.ok) { reportSearchFailure('jql', r.status); return { issues: [] } }
            return r.json()
          })
          .catch(() => { reportSearchFailure('jql'); return { issues: [] } })
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
      // KNOWN GAP: /issue/picker returns only id, img, key, keyHtml, summary and
      // summaryText — there is no status field, so cross-project results carry no
      // status and a closed ticket looks the same as an open one in the dropdown.
      // Accepted deliberately (2026-08-05): default-project results come from the
      // JQL path above and do show real status. Closing this would need a second
      // lookup to hydrate statuses for these keys.
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
