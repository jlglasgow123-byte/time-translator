-- Atlassian Personal Data Reporting API — audit log table.
-- Tracks every account ID reported to Atlassian, when it was last reported,
-- and what Atlassian said back. Provides idempotency and compliance evidence.
--
-- This table is written exclusively by /api/admin/atlassian-report (the weekly
-- reporting job). No user-facing access. Service role only.

create table if not exists public.atlassian_reporting_log (
  atlassian_account_id  text        primary key,
  user_id               uuid        references auth.users(id) on delete set null,
  last_reported_at      timestamptz,
  -- null = not yet actioned, 'ok' = 204 no action, 'closed' = account deleted,
  -- 'updated' = profile refreshed, 'refresh_failed' = could not refresh user token
  last_status           text        check (last_status in ('ok', 'closed', 'updated', 'refresh_failed')),
  actioned_at           timestamptz -- set when closed/updated/refresh_failed is processed
);

alter table public.atlassian_reporting_log enable row level security;
-- No RLS policies — service role bypasses RLS. No user should ever read this table directly.

comment on table public.atlassian_reporting_log is
  'Compliance audit log for the Atlassian Personal Data Reporting API. One row per Atlassian account ID the app holds data for. Updated weekly by the reporting cron job.';
