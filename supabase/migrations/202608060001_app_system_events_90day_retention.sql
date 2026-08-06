-- Shorten app_system_events retention from 2 years to 90 days.
--
-- WHY: diagnostic rows can contain fragments of Google Calendar content. When the AI
-- matcher cannot parse a model response it stores `rawPreview` — the first 500 chars of
-- that response — and those sentences can quote or paraphrase a user's meeting titles.
--
-- Google's API Services User Data Policy explicitly permits holding this: "investigating
-- a bug" is a named exception to the no-human-reading rule. But the policy limits
-- retention to what is *necessary for the purpose*, and Google sets no fixed number. A
-- parse failure is investigated within weeks or never, so a 2-year window is difficult to
-- argue is necessary. 90 days is comfortably defensible and costs nothing operational.
--
-- NOTE: `calendar.readonly` is a SENSITIVE scope, not RESTRICTED — the annual CASA
-- security assessment does not apply. See Project_Model.md §6, 2026-08-06.
--
-- The daily cron job (cleanup-old-app-system-events, 03:30 UTC) is already scheduled by
-- 202606020001 and calls this function by name, so replacing the function is sufficient —
-- the schedule does not need re-creating.
--
-- import_event_traces retention is deliberately UNCHANGED at 2 years: those rows are the
-- user's own worklog history, which they may reasonably want to look back on, and they
-- are covered by the account-deletion cascade.

create or replace function public.cleanup_old_app_system_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.app_system_events
  where created_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_app_system_events() from public;
grant execute on function public.cleanup_old_app_system_events() to service_role;
