import type { WorkEntry, LogResult, JiraMatchesByWorkEntryId, CsvOverridesByWorkEntryId } from '@/types'

function buildCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

function triggerDownload(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportTimeReviewCsv(workEntries: WorkEntry[], jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId) {
  const headers = ['Date', 'Day', 'Start Time', 'Duration', 'Event', 'Jira Key', 'Jira Task', 'Status']
  const rows = workEntries.map(entry => [
    entry.date,
    entry.dayLabel,
    entry.startTime,
    entry.durationDisplay,
    entry.calendarEventTitle,
    jiraMatchesByWorkEntryId[entry.id]?.suggestedJiraKey ?? '',
    jiraMatchesByWorkEntryId[entry.id]?.jiraTaskDescription ?? '',
    entry.autoSkipped ? 'Ignored' : entry.logToggle === 'skip' ? 'Skipped' : 'Log',
  ])
  triggerDownload('time-review.csv', buildCsv(headers, rows))
}

export function exportCsv(workEntries: WorkEntry[], overrides: CsvOverridesByWorkEntryId) {
  const today = new Date().toISOString().slice(0, 10)
  const defaultDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const headers = [
    'ContactName', 'InvoiceNumber', 'Reference', 'InvoiceDate', 'DueDate',
    'Description', 'Quantity', 'UnitAmount', 'Discount', 'AccountCode',
    'TaxType', 'Status', 'Type',
  ]

  const rows = workEntries
    .filter(e => !e.autoSkipped && overrides[e.id]?.include !== false)
    .map(e => {
      const ov = overrides[e.id] ?? {}
      const quantity = (e.durationSeconds / 3600).toFixed(2)
      return [
        ov.contactName ?? '',
        ov.invoiceNumber ?? '000001',
        e.calendarEventTitle,
        today,
        ov.dueDate ?? defaultDue,
        ov.description ?? e.calendarEventTitle,
        quantity,
        ov.unitAmount ?? '100',
        '',
        '',
        '200',
        'DRAFT',
        'ACCREC',
      ]
    })

  triggerDownload('csv-export.csv', buildCsv(headers, rows))
}

export function exportConfirmCsv(
  workEntries: WorkEntry[],
  jiraMatchesByWorkEntryId: JiraMatchesByWorkEntryId,
  results: LogResult[],
  excludeFailed: boolean
) {
  const filtered = excludeFailed
    ? workEntries.filter(entry => results.find(r => r.entryId === entry.id)?.status !== 'error')
    : workEntries
  const headers = ['Date', 'Event', 'Jira Key', 'Jira Task', 'Duration', 'Status']
  const rows = filtered.map(entry => {
    const result = results.find(r => r.entryId === entry.id)
    const jiraMatch = jiraMatchesByWorkEntryId[entry.id]
    const status = result?.status === 'success' ? 'Logged' : result?.status === 'error' ? 'Failed' : 'Pending'
    return [
      entry.date,
      entry.calendarEventTitle,
      jiraMatch?.suggestedJiraKey ?? '',
      jiraMatch?.jiraTaskDescription ?? '',
      entry.durationDisplay,
      status,
    ]
  })
  triggerDownload('time-log-export.csv', buildCsv(headers, rows))
}
