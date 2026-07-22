import type { SupabaseClient } from '@supabase/supabase-js'
import type { LearnedMapping } from '@/types'

function normalise(title: string): string {
  return title.trim().toLowerCase()
}

export async function fetchLearnedMappings(
  supabase: SupabaseClient,
  userId: string
): Promise<LearnedMapping[]> {
  const { data, error } = await supabase
    .from('learned_mappings')
    .select('event_title, counts, last_used')
    .eq('user_id', userId)

  if (error) {
    console.error('[learned-mappings] fetch failed', error.message)
    return []
  }

  return (data ?? []).map(row => ({
    eventTitle: row.event_title,
    counts: row.counts as Record<string, number>,
    lastUsed: row.last_used,
  }))
}

// Upsert one correction (event title -> jira key) for a user. Increments the
// existing count for that key if the row already exists.
export async function recordLearnedCorrectionServer(
  supabase: SupabaseClient,
  userId: string,
  eventTitle: string,
  jiraKey: string,
  today: string
): Promise<void> {
  const trimmedTitle = eventTitle.trim()
  const normalised = normalise(eventTitle)
  if (!normalised) return

  const { data: existing, error: fetchError } = await supabase
    .from('learned_mappings')
    .select('id, counts')
    .eq('user_id', userId)
    .eq('event_title_normalised', normalised)
    .maybeSingle()

  if (fetchError) {
    console.error('[learned-mappings] lookup failed', fetchError.message)
    return
  }

  if (existing) {
    const counts = (existing.counts as Record<string, number>) ?? {}
    counts[jiraKey] = (counts[jiraKey] ?? 0) + 1
    const { error } = await supabase
      .from('learned_mappings')
      .update({ counts, last_used: today, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    if (error) console.error('[learned-mappings] update failed', error.message)
  } else {
    const { error } = await supabase.from('learned_mappings').insert({
      user_id: userId,
      event_title: trimmedTitle,
      event_title_normalised: normalised,
      counts: { [jiraKey]: 1 },
      last_used: today,
    })
    if (error) console.error('[learned-mappings] insert failed', error.message)
  }
}

export async function deleteLearnedMappingServer(
  supabase: SupabaseClient,
  userId: string,
  eventTitle: string
): Promise<void> {
  const { error } = await supabase
    .from('learned_mappings')
    .delete()
    .eq('user_id', userId)
    .eq('event_title_normalised', normalise(eventTitle))
  if (error) console.error('[learned-mappings] delete failed', error.message)
}

// One-time backfill: insert any localStorage mappings the server doesn't already
// have. Existing server rows win on conflict (never overwritten by stale client data).
export async function backfillLearnedMappings(
  supabase: SupabaseClient,
  userId: string,
  clientMappings: LearnedMapping[]
): Promise<LearnedMapping[]> {
  if (clientMappings.length === 0) return fetchLearnedMappings(supabase, userId)

  const rows = clientMappings
    .map(m => ({
      user_id: userId,
      event_title: m.eventTitle.trim(),
      event_title_normalised: normalise(m.eventTitle),
      counts: m.counts,
      last_used: m.lastUsed,
    }))
    .filter(r => r.event_title_normalised.length > 0)

  if (rows.length > 0) {
    const { error } = await supabase
      .from('learned_mappings')
      .upsert(rows, { onConflict: 'user_id,event_title_normalised', ignoreDuplicates: true })
    if (error) console.error('[learned-mappings] backfill upsert failed', error.message)
  }

  return fetchLearnedMappings(supabase, userId)
}
