import { NextRequest, NextResponse } from 'next/server'
import { fetchAllIssueWorklogs } from '@/lib/jira-client'
import { getJiraCreds, isCredsError, credsErrorResponse } from '@/lib/supabase/get-jira-creds'
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

export interface WorklogEntry {
  issueKey: string
  issueSummary: string
  timeSpentSeconds: number
  date: string
}

export async function GET(req: NextRequest) {
  const creds = await getJiraCreds()
  if (isCredsError(creds)) return credsErrorResponse(creds)

  const { searchParams } = new URL(req.url)
  const start = searchParams.get('start')
  const end = searchParams.get('end')

  if (!start || !end) {
    return NextResponse.json({ error: 'start and end query params required' }, { status: 400 })
  }

  const diffDays = (new Date(end).getTime() - new Date(start).getTime()) / 86_400_000
  if (diffDays > 90) {
    return NextResponse.json({ error: 'Date range cannot exceed 90 days' }, { status: 400 })
  }

  try {
    const myself = await jiraGet(creds, '/rest/api/3/myself')
    const accountId: string = myself.accountId

    const ISSUE_CAP = 500

    // Pad JQL by 1 day either side — worklogDate uses UTC, worklogs are in local time (e.g. AEST = UTC+10).
    // A worklog at 9am AEST is 11pm UTC the previous day and would be missed without the padding.
    const padDate = (dateStr: string, days: number) => {
      const d = new Date(dateStr)
      d.setUTCDate(d.getUTCDate() + days)
      return d.toISOString().slice(0, 10)
    }

    // worklogAuthor filter reduces results to only issues where the current user logged time,
    // which also avoids paginating through hundreds of other people's worklogs on shared tickets.
    const jql = `worklogDate >= "${padDate(start, -1)}" AND worklogDate <= "${padDate(end, 1)}" AND worklogAuthor = "${accountId}"`

    const issues: { key: string; fields: { summary: string } }[] = []
    let nextPageToken: string | undefined = undefined
    let capped = false

    while (issues.length < ISSUE_CAP) {
      const data = await jiraSearchJql(creds, jql, nextPageToken)
      issues.push(...data.issues)
      nextPageToken = data.nextPageToken
      if (!nextPageToken || !data.issues?.length) break
    }
    if (issues.length >= ISSUE_CAP) capped = true

    const worklogs: WorklogEntry[] = []

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
          // Use local date from started (Jira stores with timezone offset e.g. +1000)
          const started = wl.started as string
          const localDate = started.slice(0, 10)
          if (localDate < start || localDate > end) continue
          worklogs.push({
            issueKey: issue.key,
            issueSummary: issue.fields.summary,
            timeSpentSeconds: wl.timeSpentSeconds as number,
            date: localDate,
          })
        }
      }
    }

    return NextResponse.json({ worklogs, capped })
  } catch (err) {
    return NextResponse.json(
      safeErrorResponse(err, 'Could not fetch your Jira worklogs. Please try again.'),
      { status: 500 }
    )
  }
}
