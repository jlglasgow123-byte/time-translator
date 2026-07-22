-- Per-import analytics: duration + match-type breakdown, queryable after the fact.
-- Kept as a dedicated table (not bolted onto app_system_events) because it has a
-- fixed, typed shape (one row per import run) rather than app_system_events'
-- free-form event log shape — makes future aggregation queries (e.g. avg duration
-- per week) simple without JSON-path filtering across unrelated event types.

create table if not exists public.import_run_analytics (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_ms integer not null,
  event_count integer not null default 0,
  rule_matched_count integer not null default 0,
  ai_high_confidence_count integer not null default 0,
  ai_medium_confidence_count integer not null default 0,
  ai_low_confidence_count integer not null default 0,
  unmatched_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists import_run_analytics_user_created_idx on public.import_run_analytics(user_id, created_at desc);
create index if not exists import_run_analytics_import_run_idx on public.import_run_analytics(import_run_id);

alter table public.import_run_analytics enable row level security;

drop policy if exists "Admins can read import analytics" on public.import_run_analytics;
create policy "Admins can read import analytics"
on public.import_run_analytics
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and profiles.is_admin = true
  )
);

drop policy if exists "No client writes to import analytics" on public.import_run_analytics;
create policy "No client writes to import analytics"
on public.import_run_analytics
for insert
to authenticated
with check (false);
