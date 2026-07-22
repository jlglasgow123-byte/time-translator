-- Enable RLS on jira_credentials and enforce user-scoped access at the database level.
-- Previously enforced only in application code; this adds the database-level guarantee.

alter table public.jira_credentials enable row level security;

create policy "Users manage own jira credentials"
  on public.jira_credentials
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
