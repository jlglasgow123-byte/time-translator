import type { SupabaseClient } from '@supabase/supabase-js'
import { captureAppError } from '@/lib/observability'

// Jira project keys: a letter followed by letters, digits or underscores. Jira's
// default cap is 10 characters but admins can raise it, so allow some headroom.
const PROJECT_KEY_RE = /^[A-Z][A-Z0-9_]{0,49}$/

// Returns the normalised key, '' for "clear it", or null when the input is invalid.
export function normaliseProjectKey(raw: unknown): string | null {
  if (raw === null || raw === undefined) return ''
  if (typeof raw !== 'string') return null
  const key = raw.trim().toUpperCase()
  if (key === '') return ''
  return PROJECT_KEY_RE.test(key) ? key : null
}

// `saved` distinguishes "never saved to the account" (no row) from "saved as empty"
// (the user cleared it). Only the former lets a browser-held value be adopted.
export interface StoredDefaultProject {
  saved: boolean
  key: string
}

export async function getStoredDefaultProject(
  supabase: SupabaseClient,
  userId: string
): Promise<StoredDefaultProject | null> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('default_project_key')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    captureAppError(error, {
      eventType: 'user_preferences_read_failed',
      userId,
      action: 'read_user_preferences',
      status: 'failed',
      errorCode: 'user_preferences_read_failed',
      details: { dbCode: (error as { code?: string }).code },
    })
    return null
  }
  if (!data) return { saved: false, key: '' }
  return { saved: true, key: data.default_project_key ?? '' }
}

export async function saveDefaultProject(
  supabase: SupabaseClient,
  userId: string,
  key: string
): Promise<boolean> {
  const { error } = await supabase
    .from('user_preferences')
    .upsert(
      { user_id: userId, default_project_key: key || null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )

  if (error) {
    captureAppError(error, {
      eventType: 'user_preferences_write_failed',
      userId,
      action: 'save_user_preferences',
      status: 'failed',
      errorCode: 'user_preferences_write_failed',
      details: { dbCode: (error as { code?: string }).code },
    })
    return false
  }
  return true
}

// The default project an import should use. The account value wins; the value the
// browser sent is only used (and adopted into the account) when nothing has ever
// been saved there — the one-time carry-over for users from before this table.
// If the account can't be read, fall back to the browser value rather than failing
// the import.
export async function resolveDefaultProject(
  supabase: SupabaseClient,
  userId: string,
  browserValue: unknown
): Promise<string> {
  const fromBrowser = normaliseProjectKey(browserValue) ?? ''
  const stored = await getStoredDefaultProject(supabase, userId)
  if (!stored) return fromBrowser
  if (stored.saved) return stored.key
  if (fromBrowser) await saveDefaultProject(supabase, userId, fromBrowser)
  return fromBrowser
}
