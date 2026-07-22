-- Drop old API token columns, add OAuth columns to jira_credentials
alter table public.jira_credentials
  drop column if exists api_token,
  drop column if exists email,
  add column if not exists cloud_id text,
  add column if not exists atlassian_account_id text,
  add column if not exists email text,
  add column if not exists access_token text,
  add column if not exists refresh_token text,
  add column if not exists expires_at timestamptz;

-- State table for CSRF protection during OAuth flow
create table if not exists public.jira_oauth_state (
  user_id uuid primary key references auth.users on delete cascade,
  state text not null,
  created_at timestamptz not null default now()
);

alter table public.jira_oauth_state enable row level security;

-- Users can only read/write their own state rows (server uses service role anyway)
create policy "Users manage own oauth state"
  on public.jira_oauth_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
