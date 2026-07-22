-- Promo codes for promotional campaigns (e.g. 100% discount grants)
create table if not exists promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  -- grants this tier for promo_duration_days days from redemption
  grants_tier text not null default 'paid_single_user',
  promo_duration_days integer not null default 30,
  -- code cannot be redeemed after this date
  expires_at timestamptz not null,
  -- null = unlimited
  max_uses integer,
  created_at timestamptz not null default now()
);

-- Track each individual redemption
create table if not exists promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id),
  user_id uuid not null references auth.users(id),
  redeemed_at timestamptz not null default now(),
  -- when the promo period ends for this user
  promo_ends_at timestamptz not null,
  unique(promo_code_id, user_id)
);

-- Index for fast redemption count lookups (milestone notifications)
create index if not exists promo_redemptions_code_idx on promo_redemptions(promo_code_id);

-- RLS
alter table promo_codes enable row level security;
alter table promo_redemptions enable row level security;

-- Only service role can read/write promo_codes
create policy "service role only" on promo_codes for all using (false);

-- Users can read their own redemptions; service role handles inserts
create policy "users read own redemptions" on promo_redemptions for select using (auth.uid() = user_id);
create policy "service role insert redemptions" on promo_redemptions for insert with check (false);

-- Seed the FREETIME code (expires 2026-06-21 00:00:00 UTC)
insert into promo_codes (code, description, grants_tier, promo_duration_days, expires_at, max_uses)
values (
  'FREETIME',
  'FB entrepreneur group launch campaign — 30 days free Pro',
  'paid_single_user',
  30,
  '2026-06-21 00:00:00+00',
  null
)
on conflict (code) do nothing;
