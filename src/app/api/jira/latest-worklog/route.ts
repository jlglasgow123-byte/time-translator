import { NextResponse } from 'next/server'
import { fetchAllIssueWorklogs } from '@/lib/jira-client'
import { JIRA_CONNECTION_REQUIRED_MESSAGE, getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
import type { JiraCredentials } from '@/lib/jira-client'
import { safeErrorResponse } from '@/lib/errors'

async function jiraGet(creds: JiraCredentials, path: string) {
  const base = creds.baseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error('Your Jira connection has expired. Please update your API token in Settings.')
    if (res.status === 404) throw new Error('Could not reach your Jira account. Please check your Jira URL in Settings.')
    throw new Error('Could not connect to Jira. Please check your connection in Settings.')
  }
  return res.json()
}

async function jiraSearchJql(creds: JiraCredentials, jql: string, nextPageToken?: string) {
  const base = creds.baseUrl.replace(/\/$/, '')
  const body: Record<string, unknown> = { jql, fields: ['summary'], maxResults: 50 }
  if (nextPageToken) body.nextPageToken = nextPageToken
  const res = await fetch(`${base}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Jira search error ${res.status}: ${await res.text()}`)
  return res.json()
}

function padDate(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy.toISOString().slice(0, 10)
}

export async function GET() {
  try {
    const creds = await getJiraCreds()
    if (isCredsError(creds)) {
      const response = credsErrorResponse(creds)
      if (response.status === 400) {
        return NextResponse.json({ error: JIRA_CONNECTION_REQUIRED_MESSAGE }, { status: 400 })
      }
      return response
    }

    const myself = await jiraGet(creds, '/rest/api/3/myself')
    const accountId: string = myself.accountId
    const now = new Date()
    const ISSUE_CAP = 500
    const windows = [90, 180, 365]

    for (const daysBack of windows) {
      const from = new Date(now)
      from.setUTCDate(from.getUTCDate() - daysBack)
      const jql = `worklogDate >= "${padDate(from, -1)}" AND worklogDate <= "${padDate(now, 1)}" AND worklogAuthor = "${accountId}"`

      const issues: { key: string; fields: { summary: string } }[] = []
      let nextPageToken: string | undefined

      while (issues.length < ISSUE_CAP) {
        const data = await jiraSearchJql(creds, jql, nextPageToken)
        issues.push(...(data.issues ?? []))
        nextPageToken = data.nextPageToken
        if (!nextPageToken || !data.issues?.length) break
      }

      let latest: { startedAt: string; issueKey: string; issueSummary: string } | null = null

      for (let i = 0; i < issues.length; i += 5) {
        const batch = issues.slice(i, i + 5)
        const results = await Promise.allSettled(
          batch.map(issue => fetchAllIssueWorklogs(creds, issue.key))
        )

        for (let j = 0; j < batch.length; j++) {
          const result = results[j]
          if (result.status !== 'fulfilled') continue
          const issue = batch[j]

          for (const wl of result.value) {
            const author = wl.author as { accountId?: string } | undefined
            if (author?.accountId !== accountId) continue

            const startedAt = String(wl.started ?? '')
            if (!startedAt) continue

            if (!latest || new Date(startedAt).getTime() > new Date(latest.startedAt).getTime()) {
              latest = {
                startedAt,
                issueKey: issue.key,
                issueSummary: issue.fields.summary ?? '',
              }
            }
          }
        }
      }

      if (latest) {
        return NextResponse.json({
          latestWorklog: {
            ...latest,
            date: latest.startedAt.slice(0, 10),
            searchedDays: daysBack,
          },
        })
      }
    }

    return NextResponse.json({ latestWorklog: null })
  } catch (err) {
    return NextResponse.json(
      safeErrorResponse(err, 'Could not fetch your latest Jira worklog. Please try again.'),
      { status: 500 }
    )
  }
}
