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
  where created_at < now() - interval '90 days';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_old_import_event_traces() from public;
grant execute on function public.cleanup_old_import_event_traces() to service_role;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1
    from cron.job
    where jobname = 'cleanup-old-import-event-traces'
  ) then
    perform cron.unschedule('cleanup-old-import-event-traces');
  end if;

  perform cron.schedule(
    'cleanup-old-import-event-traces',
    '15 3 * * *',
    'select public.cleanup_old_import_event_traces();'
  );
end;
$$;
