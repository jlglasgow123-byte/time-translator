create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date,
  end_date date,
  timezone text,
  calendar_name text,
  file_size_bytes integer not null default 0 check (file_size_bytes >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  ai_matched_count integer not null default 0 check (ai_matched_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  status text not null default 'started' check (status in ('started', 'success', 'failed')),
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.import_event_traces (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_uid text not null,
  event_title_hash text not null,
  event_start timestamptz,
  event_end timestamptz,
  event_duration_seconds integer check (event_duration_seconds is null or event_duration_seconds >= 0),
  skipped boolean not null default false,
  skip_reason text,
  match_method text not null check (match_method in ('exact_key', 'mapping_rule', 'ai', 'no_match', 'skipped')),
  confidence text check (confidence in ('HIGH', 'MEDIUM', 'LOW')),
  selected_jira_key text,
  match_reason text,
  created_at timestamptz not null default now(),
  foreign key (import_run_id, user_id) references public.import_runs(id, user_id) on delete cascade
);

create index if not exists import_runs_user_created_idx on public.import_runs(user_id, created_at desc);
create index if not exists import_runs_status_created_idx on public.import_runs(status, created_at desc);
create index if not exists import_event_traces_run_idx on public.import_event_traces(import_run_id);
create index if not exists import_event_traces_user_created_idx on public.import_event_traces(user_id, created_at desc);
create index if not exists import_event_traces_jira_key_idx on public.import_event_traces(selected_jira_key);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists import_runs_set_updated_at on public.import_runs;
create trigger import_runs_set_updated_at
before update on public.import_runs
for each row execute function public.set_updated_at();

alter table public.import_runs enable row level security;
alter table public.import_event_traces enable row level security;

drop policy if exists "Users can read own import runs" on public.import_runs;
create policy "Users can read own import runs"
on public.import_runs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own import runs" on public.import_runs;
create policy "Users can create own import runs"
on public.import_runs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own import runs" on public.import_runs;
create policy "Users can update own import runs"
on public.import_runs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own import traces" on public.import_event_traces;
create policy "Users can read own import traces"
on public.import_event_traces
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own import traces" on public.import_event_traces;
create policy "Users can create own import traces"
on public.import_event_traces
for insert
to authenticated
with check (auth.uid() = user_id);
