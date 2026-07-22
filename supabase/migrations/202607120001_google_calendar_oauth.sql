-- Google Calendar OAuth: separate, read-only-scoped connection distinct from Google sign-in.
create table if not exists public.google_calendar_credentials (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  google_email  text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.google_calendar_credentials enable row level security;

create policy "Users manage own google calendar credentials"
  on public.google_calendar_credentials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- State table for CSRF protection during OAuth flow (same pattern as jira_oauth_state)
create table if not exists public.google_calendar_oauth_state (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      text not null,
  created_at timestamptz not null default now()
);

alter table public.google_calendar_oauth_state enable row level security;

create policy "Users manage own google calendar oauth state"
  on public.google_calendar_oauth_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
