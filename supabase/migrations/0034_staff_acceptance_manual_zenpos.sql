-- 0034_staff_acceptance_manual_zenpos.sql
-- Historical migration. Reverted by 0035 after the manual ZenPOS workflow was
-- intentionally set aside.

alter table pos_sync add column branch_id uuid references branches(id);
update pos_sync ps set branch_id = o.branch_id from orders o
where o.id = ps.order_id and ps.branch_id is null;
alter table pos_sync alter column branch_id set not null;
create unique index pos_sync_branch_external_ref_key
  on pos_sync (branch_id, lower(external_ref)) where external_ref is not null;

create or replace function pos_sync_set_branch_id()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from orders where id = new.order_id;
  end if;
  return new;
end;
$$;
create trigger pos_sync_set_branch_id before insert on pos_sync
  for each row execute function pos_sync_set_branch_id();
revoke execute on function pos_sync_set_branch_id() from public, anon, authenticated;

drop policy if exists "staff read pos sync" on pos_sync;
create policy "staff read pos sync" on pos_sync for select using (
  current_staff_has_permission('orders:view')
  and current_staff_can_access_branch(branch_id)
);

create or replace function staff_accept_order(p_order_id uuid)
returns order_status language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_profile profiles%rowtype; v_order orders%rowtype;
  v_payment payments%rowtype; v_now timestamptz := now();
begin
  select * into v_profile from profiles where id = v_uid and is_active and role in ('admin', 'staff');
  if not found or not current_staff_has_permission('orders:manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.branch_id is not null and v_profile.branch_id <> v_order.branch_id then raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001'; end if;
  if v_order.status = 'accepted' then return 'accepted'; end if;
  if v_order.status <> 'pending' then raise exception 'INVALID_TRANSITION:%->accepted', v_order.status using errcode = 'P0001'; end if;
  select * into v_payment from payments where order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_payment.method <> 'counter' and v_payment.status <> 'paid' then raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001'; end if;
  update orders set status = 'accepted', accepted_at = coalesce(accepted_at, v_now), accepted_by_profile_id = coalesce(accepted_by_profile_id, v_uid) where id = p_order_id;
  insert into order_status_events (order_id, from_status, to_status, actor_profile_id) values (p_order_id, 'pending', 'accepted', v_uid);
  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff) values (v_uid, 'order.accepted', 'orders', p_order_id::text, jsonb_build_object('from', 'pending', 'to', 'accepted'));
  return 'accepted';
end;
$$;

create or replace function staff_record_manual_zenpos_entry(p_order_id uuid, p_ticket_reference text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_profile profiles%rowtype; v_order orders%rowtype;
  v_sync pos_sync%rowtype; v_reference text := nullif(btrim(p_ticket_reference), ''); v_now timestamptz := now();
begin
  select * into v_profile from profiles where id = v_uid and is_active and role in ('admin', 'staff');
  if not found or not current_staff_has_permission('pos:manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  if v_reference is null or length(v_reference) > 120 then raise exception 'ZENPOS_TICKET_INVALID' using errcode = 'P0001'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.branch_id is not null and v_profile.branch_id <> v_order.branch_id then raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001'; end if;
  if v_order.status <> 'accepted' then raise exception 'ZENPOS_ENTRY_NOT_READY' using errcode = 'P0001'; end if;
  select * into v_sync from pos_sync where order_id = p_order_id for update;
  if not found then insert into pos_sync (order_id, adapter) values (p_order_id, 'manual_rekey') returning * into v_sync; end if;
  if v_sync.entered_at is not null then
    if lower(coalesce(v_sync.external_ref, '')) = lower(v_reference) then return v_sync.external_ref; end if;
    raise exception 'ZENPOS_ALREADY_ENTERED' using errcode = 'P0001';
  end if;
  begin
    update pos_sync set adapter = 'manual_rekey', state = 'manual', external_ref = v_reference, entered_by = v_uid, entered_at = v_now, last_error = null where id = v_sync.id;
  exception when unique_violation then raise exception 'ZENPOS_TICKET_IN_USE' using errcode = 'P0001';
  end;
  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff) values (v_uid, 'order.zenpos_entry_recorded', 'orders', p_order_id::text, jsonb_build_object('ticketReference', v_reference, 'entry', 'manual'));
  return v_reference;
end;
$$;

-- The status-function replacement is deliberately retained here because this
-- is what was applied. Migration 0035 restores the previous implementation.
create or replace function staff_set_order_status(p_order_id uuid, p_to order_status, p_pickup_code text default null)
returns order_status language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_profile profiles%rowtype; v_order orders%rowtype;
  v_payment payments%rowtype; v_sync pos_sync%rowtype; v_now timestamptz := now(); v_action text; v_payment_changed boolean := false;
begin
  select * into v_profile from profiles where id = v_uid and is_active and role in ('admin', 'staff');
  if not found or not current_staff_has_permission('orders:manage') then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001'; end if;
  if v_profile.branch_id is not null and v_profile.branch_id <> v_order.branch_id then raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001'; end if;
  if v_order.status = p_to then return p_to; end if;
  select * into v_payment from payments where order_id = p_order_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001'; end if;
  if p_to = 'preparing' and v_order.status = 'accepted' then
    if v_payment.method <> 'counter' and v_payment.status <> 'paid' then raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001'; end if;
    select * into v_sync from pos_sync where order_id = p_order_id for update;
    if not found or v_sync.state <> 'manual' or v_sync.entered_at is null or nullif(btrim(v_sync.external_ref), '') is null then raise exception 'ZENPOS_ENTRY_REQUIRED' using errcode = 'P0001'; end if;
    update orders set status = 'preparing', preparing_at = coalesce(preparing_at, v_now) where id = p_order_id;
    insert into order_status_events (order_id, from_status, to_status, actor_profile_id) values (p_order_id, 'accepted', 'preparing', v_uid); v_action := 'order.started';
  elsif p_to = 'ready' and v_order.status = 'preparing' then
    update orders set status = 'ready', ready_at = coalesce(ready_at, v_now) where id = p_order_id;
    insert into order_status_events (order_id, from_status, to_status, actor_profile_id) values (p_order_id, 'preparing', 'ready', v_uid); v_action := 'order.ready';
  elsif p_to = 'claimed' and v_order.status = 'ready' then
    if p_pickup_code is null or p_pickup_code !~ '^[0-9]{4}$' or p_pickup_code <> v_order.pickup_code then raise exception 'PICKUP_CODE_INVALID' using errcode = 'P0001'; end if;
    if v_payment.method = 'counter' and v_payment.status = 'due' then update payments set status = 'paid', paid_at = v_now, recorded_by_profile_id = v_uid where id = v_payment.id; v_payment_changed := true;
    elsif v_payment.status <> 'paid' then raise exception 'PAYMENT_REQUIRED' using errcode = 'P0001'; end if;
    update orders set status = 'claimed', claimed_at = coalesce(claimed_at, v_now), claimed_by_profile_id = coalesce(claimed_by_profile_id, v_uid) where id = p_order_id;
    insert into order_status_events (order_id, from_status, to_status, actor_profile_id) values (p_order_id, 'ready', 'claimed', v_uid); v_action := 'order.claimed';
  else raise exception 'INVALID_TRANSITION:%->%', v_order.status, p_to using errcode = 'P0001'; end if;
  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff) values (v_uid, v_action, 'orders', p_order_id::text, jsonb_build_object('from', v_order.status, 'to', p_to, 'counterPaymentCaptured', v_payment_changed));
  return p_to;
end;
$$;

revoke execute on function staff_accept_order(uuid) from public, anon, authenticated;
grant execute on function staff_accept_order(uuid) to authenticated;
revoke execute on function staff_record_manual_zenpos_entry(uuid, text) from public, anon, authenticated;
grant execute on function staff_record_manual_zenpos_entry(uuid, text) to authenticated;
revoke execute on function staff_set_order_status(uuid, order_status, text) from public, anon, authenticated;
grant execute on function staff_set_order_status(uuid, order_status, text) to authenticated;
