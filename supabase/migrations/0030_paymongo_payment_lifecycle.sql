-- 0030_paymongo_payment_lifecycle.sql
-- PayMongo payment methods, webhook reconciliation, and expired-intent release.
--
-- This migration lands before the PayMongo checkout UI. Counter payment remains
-- valid and reachable until the public method flag is switched to QR Ph. Online
-- orders reserve a pickup window provisionally, but do not reach the staff
-- board until their payment webhook changes the payment row to paid.

alter table app_settings
  add column if not exists paymongo_methods jsonb not null
  default '{"qrph": false, "gcash": false, "maya": false, "card": false}'::jsonb;

alter table app_settings
  drop constraint if exists app_settings_paymongo_methods_shape;

alter table app_settings
  add constraint app_settings_paymongo_methods_shape check (
    jsonb_typeof(paymongo_methods) = 'object'
    and paymongo_methods ? 'qrph'
    and paymongo_methods ? 'gcash'
    and paymongo_methods ? 'maya'
    and paymongo_methods ? 'card'
    and jsonb_typeof(paymongo_methods -> 'qrph') = 'boolean'
    and jsonb_typeof(paymongo_methods -> 'gcash') = 'boolean'
    and jsonb_typeof(paymongo_methods -> 'maya') = 'boolean'
    and jsonb_typeof(paymongo_methods -> 'card') = 'boolean'
  );

alter table payments
  add column if not exists needs_refund boolean not null default false;

comment on column payments.needs_refund is
  'True when a payment.paid webhook arrived after the unpaid order expired. '
  'Phase 2b turns this flag into a staff refund workflow.';

-- The public reader remains the only way checkout learns which rail it may
-- show. The database trigger below repeats the same decision at write time.
create or replace function get_public_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'accepting_orders', s.accepting_orders,
    'multi_branch_enabled', s.multi_branch_enabled,
    'paymongo_enabled', s.paymongo_enabled,
    'paymongo_methods', s.paymongo_methods,
    'vouchers_enabled', s.vouchers_enabled,
    'slot_horizon_hours', s.slot_horizon_hours
  )
  from app_settings s
  where s.id = 1
$$;

-- A browser can call place_order directly, so the screen's enabled-method
-- list is not an authorization boundary. Keep the flag decision next to the
-- payment write, where every order reaches it atomically.
create or replace function enforce_paymongo_payment_method()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_methods jsonb;
begin
  if new.provider <> 'paymongo' then
    return new;
  end if;

  select paymongo_methods into v_methods
  from app_settings
  where id = 1 and paymongo_enabled;

  if v_methods is null
     or not coalesce((v_methods ->> new.method::text)::boolean, false) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists payments_enforce_paymongo_method on payments;
create trigger payments_enforce_paymongo_method
  before insert or update of method, provider on payments
  for each row execute function enforce_paymongo_payment_method();

-- The webhook is the authority for money. It locks the payment and order rows
-- together so a delivery racing the expiry sweep cannot make a paid order
-- disappear. A late paid delivery is recorded, remains cancelled, and is
-- flagged for Phase 2b rather than silently accepting food the branch never
-- received.
create or replace function apply_paymongo_payment(
  p_intent_id text,
  p_status text,
  p_payment_id text,
  p_raw jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_payment_status payment_status;
  v_order_status order_status;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = 'P0001';
  end if;

  select p.id, p.status, o.status
    into v_payment_id, v_payment_status, v_order_status
  from payments p
  join orders o on o.id = p.order_id
  where p.provider = 'paymongo'
    and p.provider_intent_id = p_intent_id
  for update of p, o;

  if v_payment_id is null then
    return;
  end if;

  if p_status = 'paid' then
    if v_payment_status = 'paid' then
      return;
    end if;

    update payments
      set status = 'paid',
          paid_at = now(),
          provider_payment_id = coalesce(nullif(p_payment_id, ''), provider_payment_id),
          raw_webhook = p_raw,
          needs_refund = v_order_status in ('cancelled', 'rejected')
      where id = v_payment_id;
  elsif v_payment_status <> 'paid' then
    update payments
      set status = 'failed', raw_webhook = p_raw
      where id = v_payment_id;
  end if;
end;
$$;

-- Cancelling an unpaid intent is a capacity release, not a kitchen rejection.
-- The slot reservation is decremented under the same locked transaction that
-- terminalizes the order, so a freed place cannot be lost or released twice.
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
    select status into v_payment_status
    from payments where order_id = v_order_id for update;
    if v_payment_status = 'paid' then
      continue;
    end if;

    if v_slot_id is not null then
      update pickup_slots
        set reserved = greatest(reserved - 1, 0)
      where id = v_slot_id;
    end if;

    update orders
      set status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = 'payment_timeout',
          pickup_slot_id = null
      where id = v_order_id and status = 'pending';

    update payments
      set status = 'failed'
      where order_id = v_order_id and status <> 'paid';

    insert into order_status_events (order_id, from_status, to_status, reason)
    values (v_order_id, 'pending', 'cancelled', 'payment_timeout');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function enforce_paymongo_payment_method()
  from public, anon, authenticated, service_role;
revoke execute on function apply_paymongo_payment(text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function expire_unpaid_online_orders()
  from public, anon, authenticated;
grant execute on function apply_paymongo_payment(text, text, text, jsonb)
  to service_role;
grant execute on function expire_unpaid_online_orders() to service_role;
