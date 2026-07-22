create table if not exists public.learned_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_title text not null,
  event_title_normalised text not null,
  counts jsonb not null default '{}'::jsonb,
  last_used date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_title_normalised)
);

create index if not exists learned_mappings_user_idx on public.learned_mappings(user_id);
create index if not exists learned_mappings_user_title_idx on public.learned_mappings(user_id, event_title_normalised);

alter table public.learned_mappings enable row level security;

drop policy if exists "Users can read own learned mappings" on public.learned_mappings;
create policy "Users can read own learned mappings"
on public.learned_mappings
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can insert own learned mappings" on public.learned_mappings;
create policy "Users can insert own learned mappings"
on public.learned_mappings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can update own learned mappings" on public.learned_mappings;
create policy "Users can update own learned mappings"
on public.learned_mappings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Users can delete own learned mappings" on public.learned_mappings;
create policy "Users can delete own learned mappings"
on public.learned_mappings
for delete
to authenticated
using (user_id = auth.uid());
