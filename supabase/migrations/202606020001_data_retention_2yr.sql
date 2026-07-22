-- Update import_event_traces retention from 90 days to 2 years
create or replace function public.cleanup_old_import_event_traces()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from public.import_event_traces
  where created_at < now() - interval '2 years';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_import_event_traces() from public;
grant execute on function public.cleanup_old_import_event_traces() to service_role;

-- Add cleanup for app_system_events older than 2 years (user_id already nullified on account delete)
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
  where created_at < now() - interval '2 years';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_app_system_events() from public;
grant execute on function public.cleanup_old_app_system_events() to service_role;

-- Schedule app_system_events cleanup daily at 3:30 AM UTC
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'cleanup-old-app-system-events'
  ) then
    perform cron.unschedule('cleanup-old-app-system-events');
  end if;

  perform cron.schedule(
    'cleanup-old-app-system-events',
    '30 3 * * *',
    'select public.cleanup_old_app_system_events();'
  );
end;
$$;
