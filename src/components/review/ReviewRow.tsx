'use client'

import type { JiraMatch, WorkEntry } from '@/types'
import { ConfidenceBadge, MatchedBadge } from '@/components/ui/Badge'
import { JiraKeyInput } from './JiraKeyInput'

interface Props {
  entry: WorkEntry
  jiraMatch: JiraMatch
  defaultProjectKey?: string
  onJiraKeyChange: (id: string, key: string) => void
  onJiraKeyBlur: (id: string, key: string) => void
  onJiraSelect: (id: string, key: string, summary: string) => void
  onToggleChange: (id: string, toggle: 'log' | 'skip') => void
}

function MetaIcon({ title, isDuplicate }: { title: string; isDuplicate: boolean }) {
  return (
    <span title={title} className="shrink-0 cursor-help text-gray-400 hover:text-gray-600">
      {isDuplicate ? (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M6 2a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6z" opacity=".35" />
          <path d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-1.5a1 1 0 10-2 0V16H4V8h1.5a1 1 0 100-2H4z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M17.707 9.293l-7-7A1 1 0 0010 2H4a2 2 0 00-2 2v6a1 1 0 00.293.707l7 7a1 1 0 001.414 0l6-6a1 1 0 000-1.414zM6 7a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
        </svg>
      )}
    </span>
  )
}

function StatusBadge({ entry, jiraMatch }: { entry: WorkEntry; jiraMatch: JiraMatch }) {
  if (entry.autoSkipped) {
    if (entry.autoSkipSource === 'duplicate') {
      return (
        <span title={entry.skipReason} className="cursor-help inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold bg-gray-700 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
            <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
          </svg>
          DUPLICATE
        </span>
      )
    }
    return (
      <span title={entry.skipReason} className="cursor-help rounded px-1.5 py-0.5 text-xs font-semibold bg-gray-700 text-white">
        IGNORED
      </span>
    )
  }
  if (entry.logToggle === 'skip') {
    return <span className="rounded px-1.5 py-0.5 text-xs font-semibold bg-gray-700 text-white">SKIPPED</span>
  }
  if (jiraMatch.matchSource === 'rule') return <MatchedBadge reason={jiraMatch.matchReason} />
  return <ConfidenceBadge confidence={jiraMatch.confidence} />
}

function ActionToggle({ entry, onToggleChange }: { entry: WorkEntry; onToggleChange: (id: string, toggle: 'log' | 'skip') => void }) {
  const isSkip = entry.logToggle === 'skip'
  return (
    <div className="inline-flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
      <button
        type="button"
        onClick={() => onToggleChange(entry.id, 'log')}
        className={`px-3 py-1 ${!isSkip ? 'bg-[#3F7C85] text-white' : 'bg-white text-gray-400'}`}
      >
        Log
      </button>
      <button
        type="button"
        onClick={() => onToggleChange(entry.id, 'skip')}
        className={`px-3 py-1 border-l border-gray-200 ${isSkip ? 'bg-gray-700 text-white' : 'bg-white text-gray-400'}`}
      >
        Skip
      </button>
    </div>
  )
}

export function ReviewRow({ entry, jiraMatch, defaultProjectKey, onJiraKeyChange, onJiraKeyBlur, onJiraSelect, onToggleChange }: Props) {
  const isSkip = entry.logToggle === 'skip'
  const isDimmed = isSkip || entry.autoSkipped
  const cellText = isDimmed ? 'text-[#6E6E6E]' : 'text-gray-900'
  const showMetaIcon = jiraMatch.matchReason === 'You mapped this calendar event to this Jira task using a rule' || entry.autoSkipped

  // Desktop table row
  return (
    <>
      {/* Mobile card — shown below md */}
      <tr className="md:hidden">
        <td colSpan={7} className={`px-3 py-3 ${isDimmed ? 'bg-gray-50' : 'bg-white'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs ${cellText}`}>{entry.startTime}</span>
                <span className={`text-xs font-semibold ${cellText}`}>{entry.durationDisplay}</span>
              </div>
              <p className={`text-sm font-medium truncate ${cellText}`} title={entry.calendarEventTitle}>
                {entry.calendarEventTitle}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <JiraKeyInput
                  value={jiraMatch.suggestedJiraKey}
                  disabled={isSkip}
                  defaultProjectKey={defaultProjectKey}
                  onChange={key => onJiraKeyChange(entry.id, key)}
                  onBlur={key => onJiraKeyBlur(entry.id, key)}
                  onSelect={(key, summary) => onJiraSelect(entry.id, key, summary)}
                />
                {jiraMatch.jiraTaskDescription && (
                  <span className={`text-xs truncate max-w-[180px] ${cellText}`} title={jiraMatch.jiraTaskDescription}>
                    {jiraMatch.jiraTaskDescription}
                  </span>
                )}
                {showMetaIcon && (
                  <MetaIcon
                    title={entry.autoSkipped ? (entry.skipReason ?? '') : jiraMatch.matchReason}
                    isDuplicate={entry.autoSkipSource === 'duplicate'}
                  />
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <StatusBadge entry={entry} jiraMatch={jiraMatch} />
              <ActionToggle entry={entry} onToggleChange={onToggleChange} />
            </div>
          </div>
        </td>
      </tr>

      {/* Desktop row — hidden below md */}
      <tr className={`hidden md:table-row ${isDimmed ? 'bg-gray-50' : 'bg-white'}`}>
        <td className={`px-3 py-2 text-sm whitespace-nowrap ${cellText}`}>{entry.startTime}</td>
        <td className={`px-3 py-2 text-sm whitespace-nowrap ${cellText}`}>{entry.durationDisplay}</td>
        <td className={`px-3 py-2 text-sm ${cellText}`}>
          <div className="break-words">{entry.calendarEventTitle}</div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <JiraKeyInput
            value={jiraMatch.suggestedJiraKey}
            disabled={isSkip}
            onChange={key => onJiraKeyChange(entry.id, key)}
            onBlur={key => onJiraKeyBlur(entry.id, key)}
            onSelect={(key, summary) => onJiraSelect(entry.id, key, summary)}
          />
        </td>
        <td className={`px-3 py-2 text-sm ${cellText}`}>
          <div className="flex items-start gap-1.5">
            <span className="break-words min-w-0">{jiraMatch.jiraTaskDescription}</span>
            {showMetaIcon && (
              <MetaIcon
                title={entry.autoSkipped ? (entry.skipReason ?? '') : jiraMatch.matchReason}
                isDuplicate={entry.autoSkipSource === 'duplicate'}
              />
            )}
          </div>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <StatusBadge entry={entry} jiraMatch={jiraMatch} />
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <ActionToggle entry={entry} onToggleChange={onToggleChange} />
        </td>
      </tr>
    </>
  )
}
