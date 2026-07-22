alter table public.profiles
add column if not exists trial_started_at timestamptz not null default now(),
add column if not exists trial_ends_at timestamptz not null default (now() + interval '30 days'),
add column if not exists subscription_tier text not null default 'free_trial',
add column if not exists subscription_status text not null default 'trialing',
add column if not exists subscription_current_period_end timestamptz,
add column if not exists stripe_customer_id text,
add column if not exists stripe_subscription_id text,
add column if not exists access_blocked_at timestamptz,
add column if not exists access_block_reason text;

update public.profiles
set
  trial_started_at = coalesce(trial_started_at, now()),
  trial_ends_at = coalesce(trial_ends_at, now() + interval '30 days'),
  subscription_tier = case
    when tier in ('paid', 'single_user', 'pro', 'paid_single_user') then 'paid_single_user'
    else coalesce(nullif(subscription_tier, ''), 'free_trial')
  end,
  subscription_status = case
    when tier in ('paid', 'single_user', 'pro', 'paid_single_user') then 'active'
    else coalesce(nullif(subscription_status, ''), 'trialing')
  end,
  tier = case
    when tier in ('paid', 'single_user', 'pro', 'paid_single_user') then 'paid_single_user'
    when tier in ('free', 'trial', 'free_trial') then 'free_trial'
    else coalesce(nullif(tier, ''), 'free_trial')
  end;

create unique index if not exists profiles_user_id_key
on public.profiles(user_id);

create unique index if not exists profiles_stripe_customer_id_key
on public.profiles(stripe_customer_id)
where stripe_customer_id is not null;

create unique index if not exists profiles_stripe_subscription_id_key
on public.profiles(stripe_subscription_id)
where stripe_subscription_id is not null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    user_id,
    tier,
    trial_started_at,
    trial_ends_at,
    subscription_tier,
    subscription_status
  )
  values (
    new.id,
    'free_trial',
    now(),
    now() + interval '30 days',
    'free_trial',
    'trialing'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_user_profile();
