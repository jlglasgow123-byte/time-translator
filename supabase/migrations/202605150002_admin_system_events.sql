alter table public.profiles
add column if not exists is_admin boolean not null default false;

create table if not exists public.app_system_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null check (severity in ('info', 'warning', 'error')),
  user_id uuid references auth.users(id) on delete set null,
  request_id text not null,
  import_id uuid,
  route text,
  action text,
  status text,
  error_code text,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_system_events_created_idx on public.app_system_events(created_at desc);
create index if not exists app_system_events_severity_created_idx on public.app_system_events(severity, created_at desc);
create index if not exists app_system_events_type_created_idx on public.app_system_events(event_type, created_at desc);
create index if not exists app_system_events_user_created_idx on public.app_system_events(user_id, created_at desc);
create index if not exists app_system_events_import_created_idx on public.app_system_events(import_id, created_at desc);

alter table public.app_system_events enable row level security;

drop policy if exists "Admins can read system events" on public.app_system_events;
create policy "Admins can read system events"
on public.app_system_events
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

drop policy if exists "No client writes to system events" on public.app_system_events;
create policy "No client writes to system events"
on public.app_system_events
for insert
to authenticated
with check (false);
