-- Stores the app-owner Atlassian OAuth tokens used for the Personal Data Reporting API.
-- One row only. Service role access only — no user-facing RLS policies.
create table if not exists public.app_atlassian_credentials (
  id            integer primary key default 1 check (id = 1),  -- enforce single row
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);

alter table public.app_atlassian_credentials enable row level security;
-- No policies — service role bypasses RLS; no user should ever read this table directly.
