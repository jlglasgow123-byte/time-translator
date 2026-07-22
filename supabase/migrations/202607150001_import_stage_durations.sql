-- Per-stage duration breakdown for import_run_analytics. The console.log lap()
-- timings in the sync route were never persisted anywhere queryable — this adds
-- the same stage timings as real columns so slow-stage diagnosis doesn't require
-- digging through Vercel logs.

alter table public.import_run_analytics
  add column if not exists auth_ms integer,
  add column if not exists creds_ms integer,
  add column if not exists fetch_calendar_events_ms integer,
  add column if not exists entitlement_ms integer,
  add column if not exists fetch_jira_tickets_ms integer,
  add column if not exists match_events_ms integer;
