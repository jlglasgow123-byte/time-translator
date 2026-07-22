-- Stores each successfully logged Jira worklog entry.
-- Written by /api/jira/log after a successful Jira API call.
create table if not exists jira_worklogs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worklog_id text not null,           -- Jira worklog ID returned by the API
  jira_key text not null,             -- e.g. DOC-234
  jira_summary text,                  -- ticket summary at time of logging
  event_title text not null,          -- original calendar event title
  event_date date not null,           -- local date of the event
  start_time text,                    -- HH:mm local time
  duration_seconds integer not null,
  logged_at timestamptz not null default now()
);

create index if not exists jira_worklogs_user_id_idx on jira_worklogs(user_id);
create index if not exists jira_worklogs_logged_at_idx on jira_worklogs(logged_at desc);

alter table jira_worklogs enable row level security;

create policy "Users can read own worklogs"
on jira_worklogs for select
to authenticated
using (user_id = auth.uid());

create policy "Users can insert own worklogs"
on jira_worklogs for insert
to authenticated
with check (user_id = auth.uid());
