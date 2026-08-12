-- 0033_staff_refunds.sql
-- Staff-authorized PayMongo refunds with a database-held reservation.
--
-- Apply after 0032_cancel_failed_online_payments.sql. A pending refund counts
-- against the remaining balance until PayMongo confirms that it failed. This
-- prevents two staff sessions from returning the same money twice.

do $$
begin
  create type refund_status as enum ('pending', 'succeeded', 'failed');
exception
  when duplicate_object then null;
end
$$;

create table refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 100),
  reason text not null check (reason in ('duplicate', 'fraudulent', 'requested_by_customer', 'others')),
  note text check (note is null or char_length(note) <= 255),
  status refund_status not null default 'pending',
  provider_refund_id text unique,
  requested_by_profile_id uuid references profiles(id),
  failure_message text,
  raw_webhook jsonb,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create index refunds_payment_id_idx on refunds(payment_id);
create index refunds_order_id_idx on refunds(order_id);

alter table refunds enable row level security;
revoke all on refunds from anon, authenticated;
grant select on refunds to authenticated, service_role;

create policy "authorized staff read refunds" on refunds
  for select using (
    current_staff_has_permission('orders:view')
    and exists (
      select 1 from orders o
      where o.id = refunds.order_id
        and current_staff_can_access_branch(o.branch_id)
    )
  );

-- Keep the database permission resolver aligned with lib/staff/roles.ts. Only
-- managers receive refund authority by default; an explicit override can grant
-- or remove it for an individual member of staff.
create or replace function current_staff_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when p.role = 'admin'::public.user_role then true
      else coalesce(
        (
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ),
        case p.staff_role
          when 'cashier'::public.staff_role then p_permission = any(array[
            'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
            'menu:availability', 'pos:manage', 'store:availability'
          ]::text[])
          when 'kitchen'::public.staff_role then p_permission = any(array[
            'orders:view', 'orders:manage'
          ]::text[])
          when 'manager'::public.staff_role then p_permission = any(array[
            'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
            'menu:availability', 'menu:configure', 'pos:manage',
            'analytics:view', 'vouchers:manage', 'store:availability',
            'settings:manage', 'audit:view', 'refunds:manage'
          ]::text[])
          else false
        end
      )
    end
    from public.profiles p
    where p.id = auth.uid() and p.is_active
  ), false)
$$;

revoke execute on function current_staff_has_permission(text)
  from public, anon, authenticated;
grant execute on function current_staff_has_permission(text) to authenticated;

create or replace function staff_request_refund(
  p_order_id uuid,
  p_amount_cents bigint default null,
  p_reason text default 'requested_by_customer',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_payment_id uuid;
  v_amount_cents bigint;
  v_provider payment_provider;
  v_payment_status payment_status;
  v_provider_payment_id text;
  v_branch_id uuid;
  v_already_cents bigint;
  v_remaining_cents bigint;
  v_requested_cents bigint;
  v_refund_id uuid;
begin
  if not current_staff_has_permission('refunds:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select p.id, p.amount_cents, p.provider, p.status, p.provider_payment_id, o.branch_id
    into v_payment_id, v_amount_cents, v_provider, v_payment_status, v_provider_payment_id, v_branch_id
  from payments p
  join orders o on o.id = p.order_id
  where p.order_id = p_order_id
  for update of p, o;

  if v_payment_id is null then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(v_branch_id) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_provider <> 'paymongo' then
    raise exception 'REFUND_PROVIDER_UNSUPPORTED' using errcode = 'P0001';
  end if;
  if v_payment_status <> 'paid' then
    raise exception 'REFUND_PAYMENT_NOT_PAID' using errcode = 'P0001';
  end if;
  if v_provider_payment_id is null then
    raise exception 'REFUND_NO_PROVIDER_PAYMENT' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('duplicate', 'fraudulent', 'requested_by_customer', 'others') then
    raise exception 'REFUND_REASON_INVALID' using errcode = 'P0001';
  end if;

  select coalesce(sum(r.amount_cents), 0) into v_already_cents
  from refunds r
  where r.payment_id = v_payment_id and r.status in ('pending', 'succeeded');
  v_remaining_cents := v_amount_cents - v_already_cents;

  if v_remaining_cents <= 0 then
    raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = 'P0001';
  end if;
  v_requested_cents := coalesce(p_amount_cents, v_remaining_cents);
  if v_requested_cents < 100 then
    raise exception 'REFUND_BELOW_MINIMUM' using errcode = 'P0001';
  end if;
  if v_requested_cents > v_remaining_cents then
    raise exception 'REFUND_EXCEEDS_PAYMENT' using errcode = 'P0001';
  end if;

  insert into refunds (payment_id, order_id, amount_cents, reason, note, requested_by_profile_id)
  values (v_payment_id, p_order_id, v_requested_cents, p_reason, nullif(trim(p_note), ''), v_uid)
  returning id into v_refund_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, branch_id, diff)
  values (
    v_uid, 'refund.requested', 'refunds', v_refund_id::text, v_branch_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'amount_cents', v_requested_cents,
      'reason', p_reason,
      'refundable_before_cents', v_remaining_cents
    )
  );

  return jsonb_build_object(
    'refund_id', v_refund_id,
    'amount_cents', v_requested_cents,
    'provider_payment_id', v_provider_payment_id
  );
end;
$$;

revoke execute on function staff_request_refund(uuid, bigint, text, text)
  from public, anon;
grant execute on function staff_request_refund(uuid, bigint, text, text) to authenticated;

create or replace function apply_paymongo_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_status text,
  p_raw jsonb default null,
  p_failure_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_status refund_status;
  v_payment_id uuid;
  v_branch_id uuid;
  v_payment_cents bigint;
  v_refunded_cents bigint;
begin
  if p_status not in ('pending', 'succeeded', 'failed') then
    raise exception 'INVALID_REFUND_STATUS' using errcode = 'P0001';
  end if;

  select r.id, r.status, r.payment_id, o.branch_id
    into v_id, v_status, v_payment_id, v_branch_id
  from refunds r
  join orders o on o.id = r.order_id
  where (p_refund_id is not null and r.id = p_refund_id)
     or (p_refund_id is null and p_provider_refund_id is not null and r.provider_refund_id = p_provider_refund_id)
  limit 1
  for update of r;

  if v_id is null then
    return;
  end if;
  if v_status = 'succeeded' then
    update refunds
      set provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id)
    where id = v_id and p_provider_refund_id is not null;
    return;
  end if;

  if p_status = 'succeeded' then
    update refunds
      set status = 'succeeded', settled_at = now(),
          provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
          raw_webhook = coalesce(p_raw, raw_webhook)
    where id = v_id;

    select amount_cents into v_payment_cents from payments where id = v_payment_id for update;
    select coalesce(sum(amount_cents), 0) into v_refunded_cents
    from refunds where payment_id = v_payment_id and status = 'succeeded';
    if v_refunded_cents >= v_payment_cents then
      update payments set status = 'refunded', needs_refund = false where id = v_payment_id;
    end if;

    insert into audit_logs (action, target_table, target_id, branch_id, diff)
    values (
      'refund.succeeded', 'refunds', v_id::text, v_branch_id,
      jsonb_build_object('payment_id', v_payment_id, 'refunded_total_cents', v_refunded_cents)
    );
  elsif p_status = 'failed' then
    update refunds
      set status = 'failed', settled_at = now(),
          provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
          failure_message = coalesce(p_failure_message, failure_message),
          raw_webhook = coalesce(p_raw, raw_webhook)
    where id = v_id;

    insert into audit_logs (action, target_table, target_id, branch_id, diff)
    values (
      'refund.failed', 'refunds', v_id::text, v_branch_id,
      jsonb_build_object('payment_id', v_payment_id, 'message', p_failure_message)
    );
  else
    update refunds
      set provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
          raw_webhook = coalesce(p_raw, raw_webhook)
    where id = v_id;
  end if;
end;
$$;

revoke execute on function apply_paymongo_refund(uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function apply_paymongo_refund(uuid, text, text, jsonb, text) to service_role;

create or replace function require_refund_record_for_refunded_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'refunded' and new.status is distinct from old.status then
    if coalesce((
      select sum(r.amount_cents) from refunds r
      where r.payment_id = new.id and r.status = 'succeeded'
    ), 0) < new.amount_cents then
      raise exception 'REFUND_RECORD_REQUIRED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function require_refund_record_for_refunded_status()
  from public, anon, authenticated, service_role;
drop trigger if exists require_refund_record_for_refunded_status_trigger on payments;
create trigger require_refund_record_for_refunded_status_trigger
  before update on payments
  for each row execute function require_refund_record_for_refunded_status();

-- A paid order refunded before the kitchen starts must still be terminalized
-- when its provisional pickup window expires. Preserve the refunded payment
-- record rather than rewriting it to failed.
create or replace function expire_unpaid_online_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry_minutes int;
  v_order_id uuid;
  v_slot_id uuid;
  v_payment_status payment_status;
  v_count integer := 0;
begin
  select online_payment_expiry_minutes into v_expiry_minutes
  from app_settings where id = 1;
  if v_expiry_minutes is null then
    return 0;
  end if;

  for v_order_id, v_slot_id in
    select o.id, o.pickup_slot_id
    from orders o
    join payments p on p.order_id = o.id
    where o.status = 'pending'
      and p.provider = 'paymongo'
      and p.status <> 'paid'
      and o.placed_at < now() - make_interval(mins => v_expiry_minutes)
    for update of o, p skip locked
  loop
    select status into v_payment_status from payments where order_id = v_order_id for update;
    if v_payment_status = 'paid' then
      continue;
    end if;
    if v_slot_id is not null then
      update pickup_slots set reserved = greatest(reserved - 1, 0) where id = v_slot_id;
    end if;
    update orders
      set status = 'cancelled', cancelled_at = now(), cancelled_reason = 'payment_timeout', pickup_slot_id = null
      where id = v_order_id and status = 'pending';
    update payments set status = 'failed'
      where order_id = v_order_id and status not in ('paid', 'refunded');
    insert into order_status_events (order_id, from_status, to_status, reason)
    values (v_order_id, 'pending', 'cancelled', 'payment_timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function expire_unpaid_online_orders() from public, anon, authenticated;
grant execute on function expire_unpaid_online_orders() to service_role;
