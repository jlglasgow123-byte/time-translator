-- Append-only audit log proving right-to-erasure was fulfilled.
-- Stores a one-way SHA-256 hash of the email (not the email itself) so we can
-- confirm a specific address was deleted without re-holding personal data.
-- Records are never updated or deleted — they are the compliance evidence.

create table public.account_deletion_log (
  id             bigint generated always as identity primary key,
  -- Original user_id from auth.users (UUID retained for DR audit trail)
  user_id        uuid        not null,
  -- One-way hash of the email address at time of deletion
  email_hash     text        not null,
  -- Who triggered the deletion: 'user' (self-service) or 'admin'
  deleted_by     text        not null check (deleted_by in ('user', 'admin')),
  deleted_at     timestamptz not null default now()
);

-- No RLS — service_role only. Users must not be able to read or modify this table.
alter table public.account_deletion_log enable row level security;

-- Explicitly deny all access to authenticated and anonymous roles
create policy "no access" on public.account_deletion_log
  as restrictive
  for all
  to authenticated, anon
  using (false);

-- Allow service_role to insert (used by delete API routes)
grant insert on public.account_deletion_log to service_role;

comment on table public.account_deletion_log is
  'Immutable audit log of fulfilled right-to-erasure requests (GDPR Art. 17). '
  'Email is stored as a one-way SHA-256 hash only. Never delete rows from this table.';
