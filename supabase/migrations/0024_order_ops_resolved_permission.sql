-- 0024_order_ops_resolved_permission.sql
-- Make the order transition RPC ask the same question about permissions that
-- everything else in the workspace now asks.
--
-- 0018 shipped before 0022 existed, so it hand-rolled its authorization: an
-- active admin or staff profile, then one lookup for an override row that
-- explicitly sets orders:manage to false. That check answers "has this person
-- been denied" rather than "does this person have it", and the two only agree
-- while every job role carries the permission by default. All three currently
-- do, so nothing was reachable through the gap. It was still the wrong
-- question, and the first role added without orders:manage would have been
-- refused by the application and allowed by the database, which is exactly the
-- direction of disagreement 0022 was written to end.
--
-- current_staff_has_permission() is that resolution in one place: true for an
-- admin, otherwise a per-person override if there is one and the job role's
-- defaults if there is not. It is the same function the RLS policies read, so
-- the row a staff member can see and the transition they can perform can no
-- longer part company.
--
-- Nothing else in the function changes. The branch check, the payment gate,
-- the pickup code, the replay guard, the status events and the audit row are
-- all restated verbatim, because `create or replace function` has no way to
-- amend a body in place.

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

  -- The profile row is still read directly, because the branch check below
  -- needs it. The permission question goes to the shared resolver.
  if not found or not current_staff_has_permission('orders:manage') then
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

-- create or replace keeps the existing ACL, so this is a restatement rather
-- than a change. It is here because a future replace that drops the function
-- first would otherwise leave it callable by nobody, and that failure is
-- silent until a cashier taps Ready.
revoke execute on function staff_set_order_status(uuid, order_status, text)
  from public, anon, authenticated;
grant execute on function staff_set_order_status(uuid, order_status, text)
  to authenticated;
