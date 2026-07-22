-- Stores the referral relationship created at signup
create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  -- the user who was referred (new signup)
  referred_user_id uuid not null references auth.users(id),
  -- email the new user typed in — resolved to referrer_user_id once confirmed
  referrer_email text not null,
  -- resolved once we find a matching account
  referrer_user_id uuid references auth.users(id),
  -- reward fires when referred_user_id makes their first payment
  rewarded_at timestamptz,
  -- how many days were added
  reward_days integer,
  created_at timestamptz not null default now(),
  unique(referred_user_id)
);

create index if not exists referrals_referrer_user_idx on referrals(referrer_user_id);

alter table referrals enable row level security;
-- No direct client access — all writes go through service role API routes
create policy "no direct access" on referrals for all using (false);
