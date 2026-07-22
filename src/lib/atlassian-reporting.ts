import { createServiceClient } from '@/lib/supabase/service'
import { getAppAtlassianToken } from '@/lib/supabase/get-app-atlassian-token'
import { getJiraCredsForUser } from '@/lib/supabase/get-jira-creds'
import { deleteUserById } from '@/lib/admin/delete-user'

const REPORT_URL = 'https://api.atlassian.com/app/report-accounts/'
const BATCH_SIZE = 90

export interface ReportSummary {
  reported: number
  ok: number
  closed: number
  updated: number
  refreshFailed: number
  errors: string[]
}

interface JiraCredRow {
  atlassian_account_id: string
  user_id: string
  updated_at: string
}

interface AtlassianAccountResult {
  accountId: string
  status?: 'closed' | 'updated'
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export async function runAtlassianReport(): Promise<ReportSummary> {
  const summary: ReportSummary = { reported: 0, ok: 0, closed: 0, updated: 0, refreshFailed: 0, errors: [] }
  const supabase = createServiceClient()

  let appToken: string
  try {
    appToken = await getAppAtlassianToken()
  } catch (err) {
    summary.errors.push(`Failed to load app-owner token: ${String(err)}`)
    return summary
  }

  const { data: rows, error: fetchError } = await supabase
    .from('jira_credentials')
    .select('atlassian_account_id, user_id, updated_at')

  if (fetchError) {
    summary.errors.push(`Failed to fetch jira_credentials: ${fetchError.message}`)
    return summary
  }

  if (!rows || rows.length === 0) return summary

  const batches = chunk(rows as JiraCredRow[], BATCH_SIZE)

  for (const batch of batches) {
    const payload = {
      accounts: batch.map((r) => ({
        accountId: r.atlassian_account_id,
        updatedAt: new Date(r.updated_at).toISOString(),
      })),
    }

    let res: Response
    try {
      res = await fetch(REPORT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${appToken}`,
        },
        body: JSON.stringify(payload),
      })
    } catch (err) {
      summary.errors.push(`Network error posting batch: ${String(err)}`)
      continue
    }

    summary.reported += batch.length

    // Parse Cycle-Period header — Atlassian tells us how often to report (default 7 days).
    // Stored in the log as an integer so we have evidence if Atlassian changes the cadence.
    const cyclePeriodRaw = res.headers.get('Cycle-Period')
    const cyclePeriodDays = cyclePeriodRaw ? parseInt(cyclePeriodRaw, 10) || null : null

    if (res.status === 204) {
      const now = new Date().toISOString()
      await Promise.all(
        batch.map((r) =>
          supabase.from('atlassian_reporting_log').upsert({
            atlassian_account_id: r.atlassian_account_id,
            user_id: r.user_id,
            last_reported_at: now,
            last_status: 'ok',
            cycle_period_days: cyclePeriodDays,
          }, { onConflict: 'atlassian_account_id' })
        )
      )
      summary.ok += batch.length
      continue
    }

    if (res.status === 200) {
      let body: { accounts: AtlassianAccountResult[] }
      try {
        body = await res.json()
      } catch {
        summary.errors.push('Failed to parse 200 response body from Atlassian')
        continue
      }

      const byAccountId = new Map(batch.map((r) => [r.atlassian_account_id, r]))
      const now = new Date().toISOString()

      for (const result of body.accounts) {
        const row = byAccountId.get(result.accountId)
        if (!row) continue

        if (result.status === 'closed') {
          await handleClosed(row, now, cyclePeriodDays, supabase, summary)
        } else if (result.status === 'updated') {
          await handleUpdated(row, appToken, now, cyclePeriodDays, supabase, summary)
        }
      }

      // Log 'ok' for accounts in the batch that had no status entry in the response
      const actionedIds = new Set(body.accounts.map((a) => a.accountId))
      const unactionedRows = batch.filter((r) => !actionedIds.has(r.atlassian_account_id))
      if (unactionedRows.length > 0) {
        await Promise.all(
          unactionedRows.map((r) =>
            supabase.from('atlassian_reporting_log').upsert({
              atlassian_account_id: r.atlassian_account_id,
              user_id: r.user_id,
              last_reported_at: now,
              last_status: 'ok',
              cycle_period_days: cyclePeriodDays,
            }, { onConflict: 'atlassian_account_id' })
          )
        )
        summary.ok += unactionedRows.length
      }

      continue
    }

    // Unexpected status
    const body = await res.text().catch(() => '(unreadable)')
    summary.errors.push(`Unexpected Atlassian response ${res.status}: ${body}`)
  }

  return summary
}

async function handleClosed(
  row: JiraCredRow,
  now: string,
  cyclePeriodDays: number | null,
  supabase: ReturnType<typeof createServiceClient>,
  summary: ReportSummary
) {
  const { error } = await deleteUserById(row.user_id)
  if (error && !error.includes('not found')) {
    summary.errors.push(`deleteUserById(${row.user_id}) failed: ${error}`)
  }

  await supabase.from('atlassian_reporting_log').upsert({
    atlassian_account_id: row.atlassian_account_id,
    user_id: null,
    last_reported_at: now,
    last_status: 'closed',
    actioned_at: now,
    cycle_period_days: cyclePeriodDays,
  }, { onConflict: 'atlassian_account_id' })

  summary.closed++
}

async function handleUpdated(
  row: JiraCredRow,
  appToken: string,
  now: string,
  cyclePeriodDays: number | null,
  supabase: ReturnType<typeof createServiceClient>,
  summary: ReportSummary
) {
  const creds = await getJiraCredsForUser(row.user_id)

  if (!creds) {
    await supabase.from('atlassian_reporting_log').upsert({
      atlassian_account_id: row.atlassian_account_id,
      user_id: row.user_id,
      last_reported_at: now,
      last_status: 'refresh_failed',
      actioned_at: now,
      cycle_period_days: cyclePeriodDays,
    }, { onConflict: 'atlassian_account_id' })
    summary.refreshFailed++
    return
  }

  // Re-fetch the user's Atlassian profile using their own token
  try {
    const meRes = await fetch('https://api.atlassian.com/me', {
      headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: 'application/json' },
    })

    if (meRes.ok) {
      const me = await meRes.json()
      await supabase.from('jira_credentials').update({
        atlassian_account_id: me.account_id,
        email: me.email,
        updated_at: now,
      }).eq('user_id', row.user_id)
    }
  } catch {
    // Profile refresh failed but token is valid — log updated anyway
  }

  await supabase.from('atlassian_reporting_log').upsert({
    atlassian_account_id: row.atlassian_account_id,
    user_id: row.user_id,
    last_reported_at: now,
    last_status: 'updated',
    actioned_at: now,
    cycle_period_days: cyclePeriodDays,
  }, { onConflict: 'atlassian_account_id' })

  summary.updated++
}
