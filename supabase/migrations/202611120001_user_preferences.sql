-- Per-user preferences stored on the account rather than only in the browser.
--
-- Starts with the default Jira project key. It used to live only in localStorage,
-- so clearing browser data, switching browser, or using a private window silently
-- wiped it — and with no default project the AI has no tickets to match against.
--
-- Deliberately a separate table, not a column on jira_credentials: that row is
-- deleted whenever a Jira token refresh fails (e.g. after a long break), which is
-- exactly when losing the default project would bite.
--
-- A row with default_project_key = null means "the user cleared it on purpose";
-- no row at all means "never saved to the account yet" (the server then adopts
-- the browser's value once, so existing users carry over without re-picking).

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_project_key text,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

drop policy if exists "Users manage own preferences" on public.user_preferences;
create policy "Users manage own preferences"
  on public.user_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
