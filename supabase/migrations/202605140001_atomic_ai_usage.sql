create or replace function public.consume_ai_usage(
  p_user_id uuid,
  p_period text,
  p_amount integer,
  p_limit integer
)
returns table(allowed boolean, ai_calls integer, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_calls integer;
begin
  if p_amount < 0 then
    raise exception 'p_amount must be non-negative';
  end if;

  insert into public.usage (user_id, period, ai_calls, updated_at)
  values (p_user_id, p_period, 0, now())
  on conflict (user_id, period) do nothing;

  select u.ai_calls
  into current_calls
  from public.usage as u
  where u.user_id = p_user_id
    and u.period = p_period
  for update;

  if p_limit >= 0 and current_calls + p_amount > p_limit then
    return query select false, current_calls, greatest(0, p_limit - current_calls);
    return;
  end if;

  update public.usage
  set ai_calls = current_calls + p_amount,
      updated_at = now()
  where user_id = p_user_id
    and period = p_period;

  return query select true, current_calls + p_amount, greatest(0, p_limit - current_calls - p_amount);
end;
$$;

create or replace function public.refund_ai_usage(
  p_user_id uuid,
  p_period text,
  p_amount integer
)
returns table(ai_calls integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_calls integer;
begin
  if p_amount < 0 then
    raise exception 'p_amount must be non-negative';
  end if;

  update public.usage
  set ai_calls = greatest(0, ai_calls - p_amount),
      updated_at = now()
  where user_id = p_user_id
    and period = p_period
  returning usage.ai_calls into updated_calls;

  return query select coalesce(updated_calls, 0);
end;
$$;

revoke all on function public.consume_ai_usage(uuid, text, integer, integer) from public;
revoke all on function public.refund_ai_usage(uuid, text, integer) from public;
grant execute on function public.consume_ai_usage(uuid, text, integer, integer) to service_role;
grant execute on function public.refund_ai_usage(uuid, text, integer) to service_role;
