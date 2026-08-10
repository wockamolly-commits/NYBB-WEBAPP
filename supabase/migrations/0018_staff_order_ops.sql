-- 0018_staff_order_ops.sql
-- Phase 2 order transitions for the three-tap pickup workflow.

create or replace function staff_set_order_status(
  p_order_id uuid,
  p_to order_status,
  p_pickup_code text default null
)
returns order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_order orders%rowtype;
  v_payment payments%rowtype;
  v_now timestamptz := now();
  v_action text;
  v_payment_changed boolean := false;
begin
  select * into v_profile
  from profiles
  where id = v_uid and is_active and role in ('admin', 'staff');

  if not found then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_profile.role = 'staff' and exists (
    select 1 from staff_permission_overrides
    where profile_id = v_uid
      and permission = 'orders:manage'
      and not granted
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_profile.branch_id is not null and v_profile.branch_id <> v_order.branch_id then
    raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001';
  end if;

  -- A replay of the same action is harmless and creates no duplicate trail.
  if v_order.status = p_to then
    return p_to;
  end if;

  select * into v_payment from payments where order_id = p_order_id for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_to = 'preparing' and v_order.status in ('pending', 'accepted') then
    if v_payment.method <> 'counter' and v_payment.status <> 'paid' then
      raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001';
    end if;

    update orders set
      status = 'preparing',
      accepted_at = coalesce(accepted_at, v_now),
      preparing_at = coalesce(preparing_at, v_now),
      accepted_by_profile_id = coalesce(accepted_by_profile_id, v_uid)
    where id = p_order_id;

    if v_order.status = 'pending' then
      insert into order_status_events
        (order_id, from_status, to_status, actor_profile_id)
      values
        (p_order_id, 'pending', 'accepted', v_uid),
        (p_order_id, 'accepted', 'preparing', v_uid);
    else
      insert into order_status_events
        (order_id, from_status, to_status, actor_profile_id)
      values (p_order_id, 'accepted', 'preparing', v_uid);
    end if;
    v_action := 'order.started';

  elsif p_to = 'ready' and v_order.status = 'preparing' then
    update orders set status = 'ready', ready_at = coalesce(ready_at, v_now)
    where id = p_order_id;
    insert into order_status_events
      (order_id, from_status, to_status, actor_profile_id)
    values (p_order_id, 'preparing', 'ready', v_uid);
    v_action := 'order.ready';

  elsif p_to = 'claimed' and v_order.status = 'ready' then
    if p_pickup_code is null
       or p_pickup_code !~ '^[0-9]{4}$'
       or p_pickup_code <> v_order.pickup_code then
      raise exception 'PICKUP_CODE_INVALID' using errcode = 'P0001';
    end if;

    if v_payment.method = 'counter' and v_payment.status = 'due' then
      update payments set
        status = 'paid',
        paid_at = v_now,
        recorded_by_profile_id = v_uid
      where id = v_payment.id;
      v_payment_changed := true;
    elsif v_payment.status <> 'paid' then
      raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001';
    end if;

    update orders set
      status = 'claimed',
      claimed_at = coalesce(claimed_at, v_now),
      claimed_by_profile_id = coalesce(claimed_by_profile_id, v_uid)
    where id = p_order_id;
    insert into order_status_events
      (order_id, from_status, to_status, actor_profile_id)
    values (p_order_id, 'ready', 'claimed', v_uid);
    v_action := 'order.claimed';

  else
    raise exception 'INVALID_TRANSITION:%->%', v_order.status, p_to
      using errcode = 'P0001';
  end if;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_uid,
    v_action,
    'orders',
    p_order_id::text,
    jsonb_build_object(
      'from', v_order.status,
      'to', p_to,
      'counterPaymentCaptured', v_payment_changed
    )
  );

  return p_to;
end;
$$;

revoke execute on function staff_set_order_status(uuid, order_status, text)
  from public, anon, authenticated;
grant execute on function staff_set_order_status(uuid, order_status, text)
  to authenticated;

-- Supabase creates this publication before project migrations run. PGlite does
-- not, so the guarded block keeps the local migration harness representative.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'orders'
     ) then
    alter publication supabase_realtime add table orders;
  end if;
end;
$$;
