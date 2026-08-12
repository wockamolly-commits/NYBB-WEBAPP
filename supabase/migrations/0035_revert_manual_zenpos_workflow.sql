-- 0035_revert_manual_zenpos_workflow.sql
-- ZenPOS work is deferred. This reverses the applied 0034 database changes.

drop function staff_record_manual_zenpos_entry(uuid, text);
drop function staff_accept_order(uuid);

drop policy if exists "staff read pos sync" on pos_sync;
create policy "staff read pos sync" on pos_sync for select using (
  current_staff_has_permission('pos:manage')
  and exists (
    select 1 from public.orders o
    where o.id = pos_sync.order_id and current_staff_can_access_branch(o.branch_id)
  )
);

drop trigger pos_sync_set_branch_id on pos_sync;
drop function pos_sync_set_branch_id();
drop index pos_sync_branch_external_ref_key;
alter table pos_sync drop column branch_id;

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
      insert into order_status_events (order_id, from_status, to_status, actor_profile_id)
      values (p_order_id, 'pending', 'accepted', v_uid), (p_order_id, 'accepted', 'preparing', v_uid);
    else
      insert into order_status_events (order_id, from_status, to_status, actor_profile_id)
      values (p_order_id, 'accepted', 'preparing', v_uid);
    end if;
    v_action := 'order.started';

  elsif p_to = 'ready' and v_order.status = 'preparing' then
    update orders set status = 'ready', ready_at = coalesce(ready_at, v_now) where id = p_order_id;
    insert into order_status_events (order_id, from_status, to_status, actor_profile_id)
    values (p_order_id, 'preparing', 'ready', v_uid);
    v_action := 'order.ready';

  elsif p_to = 'claimed' and v_order.status = 'ready' then
    if p_pickup_code is null or p_pickup_code !~ '^[0-9]{4}$' or p_pickup_code <> v_order.pickup_code then
      raise exception 'PICKUP_CODE_INVALID' using errcode = 'P0001';
    end if;
    if v_payment.method = 'counter' and v_payment.status = 'due' then
      update payments set status = 'paid', paid_at = v_now, recorded_by_profile_id = v_uid where id = v_payment.id;
      v_payment_changed := true;
    elsif v_payment.status <> 'paid' then
      raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001';
    end if;
    update orders set status = 'claimed', claimed_at = coalesce(claimed_at, v_now), claimed_by_profile_id = coalesce(claimed_by_profile_id, v_uid) where id = p_order_id;
    insert into order_status_events (order_id, from_status, to_status, actor_profile_id)
    values (p_order_id, 'ready', 'claimed', v_uid);
    v_action := 'order.claimed';
  else
    raise exception 'INVALID_TRANSITION:%->%', v_order.status, p_to using errcode = 'P0001';
  end if;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (v_uid, v_action, 'orders', p_order_id::text, jsonb_build_object(
    'from', v_order.status, 'to', p_to, 'counterPaymentCaptured', v_payment_changed
  ));
  return p_to;
end;
$$;

revoke execute on function staff_set_order_status(uuid, order_status, text)
  from public, anon, authenticated;
grant execute on function staff_set_order_status(uuid, order_status, text) to authenticated;
