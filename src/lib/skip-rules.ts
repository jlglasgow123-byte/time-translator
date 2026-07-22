import type { SkipRule } from '@/types'

export type SkipReason = 'TITLE_CONTAINS' | 'TITLE_EQUALS' | 'TIME_EXACT'

export const DEFAULT_SKIP_RULES: SkipRule[] = [
  { id: '1', type: 'TITLE_CONTAINS', value: 'Lunch' },
  { id: '2', type: 'TITLE_CONTAINS', value: 'OOO' },
  { id: '3', type: 'TITLE_CONTAINS', value: 'Sick' },
  { id: '4', type: 'TITLE_CONTAINS', value: 'Holiday' },
  { id: '5', type: 'TITLE_CONTAINS', value: 'Ignore' },
]

export function shouldSkip(
  title: string,
  startLocalTime: string,
  rules: SkipRule[]
): { skip: boolean; source?: 'rule'; reason?: string } {
  const upper = title.toUpperCase()

  for (const rule of rules) {
    if (rule.type === 'TITLE_CONTAINS' && upper.includes(rule.value.toUpperCase())) {
      return { skip: true, source: 'rule', reason: `Your rule is set to ignore events whose title contains "${rule.value}"` }
    }
    if (rule.type === 'TITLE_EQUALS' && upper === rule.value.toUpperCase()) {
      return { skip: true, source: 'rule', reason: `Your rule is set to ignore events whose title equals "${rule.value}"` }
    }
    if (rule.type === 'TIME_EXACT' && startLocalTime === rule.value) {
      return { skip: true, source: 'rule', reason: `Your rule is set to ignore events that start at ${rule.value}` }
    }
  }

  return { skip: false }
}
