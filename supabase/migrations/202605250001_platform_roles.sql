-- Rename is_admin → is_platform_admin and add is_developer.
-- is_platform_admin: full platform access (Jasmine). Gates billing, user PII, and all admin pages.
-- is_developer: collaborator access. Same log/event visibility but a distinct role for future ACL splits.

alter table public.profiles
  add column if not exists is_platform_admin boolean not null default false,
  add column if not exists is_developer boolean not null default false;

-- Carry forward any existing is_admin grants to is_platform_admin.
update public.profiles set is_platform_admin = true where is_admin = true;

-- Keep is_admin in place for now so nothing breaks before code is deployed,
-- but new code will only check is_platform_admin / is_developer.

-- Update RLS on app_system_events: both platform admins and developers can read.
drop policy if exists "Admins can read system events" on public.app_system_events;
create policy "Platform admins and developers can read system events"
on public.app_system_events
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.user_id = auth.uid()
      and (profiles.is_platform_admin = true or profiles.is_developer = true)
  )
);
