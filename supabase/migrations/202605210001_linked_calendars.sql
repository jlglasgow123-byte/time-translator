-- Linked calendars: one per Pro user, many per Max Power user.
-- calendar_name matches the CALNAME field from the ICS file (case-insensitive comparison in app).
-- Future: add google_calendar_id column here when Google Calendar API pull is implemented.

create table public.linked_calendars (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  calendar_name text not null,
  created_at   timestamptz not null default now(),

  -- Prevent duplicate calendar names per user
  unique (user_id, calendar_name)
);

-- Users can only read/write their own linked calendars
alter table public.linked_calendars enable row level security;

create policy "Users can read own linked calendars"
  on public.linked_calendars for select
  using (auth.uid() = user_id);

create policy "Users can insert own linked calendars"
  on public.linked_calendars for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own linked calendars"
  on public.linked_calendars for delete
  using (auth.uid() = user_id);

-- Index for fast per-user lookups
create index linked_calendars_user_id_idx on public.linked_calendars(user_id);
