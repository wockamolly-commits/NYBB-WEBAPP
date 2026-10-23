-- 0085_ready_ring.sql
-- A ready order rings on the customer's phone until they say they are coming,
-- and the counter can ring it again.
--
-- Modelled on the same pair in ZOMBEANS (its 0137 and 0138), fitted to this
-- flow, which already has "I'm here" (0029) for when the customer reaches the
-- counter. The two taps answer different questions. "I'm coming" says the
-- customer heard the alarm and is on the way, which is what stops it.
-- "I'm here" says they are standing at the counter, which is what 0080 pushes
-- to staff. Neither replaces the other.
--
-- Apply this BEFORE the code that reads these columns ships. The staff board
-- selects both columns, and a missing column fails the whole board read.

alter table orders
  add column ready_acknowledged_at timestamptz,
  add column ready_ring_at timestamptz;

comment on column orders.ready_acknowledged_at is
  'When the customer tapped "I''m coming" on a ready order. Cleared by '
  'staff_ring_ready_order, so a ring after the tap makes the phone ring again.';
comment on column orders.ready_ring_at is
  'The last time staff rang the customer again for a ready order. Null means '
  'the only ring so far is the one the order made by becoming ready.';

-- ---------------------------------------------------------------------------
-- The customer's tap.
-- ---------------------------------------------------------------------------
--
-- Same shape and the same refusals as customer_mark_order_arrived (0029): the
-- tracking token or the signed-in owner, a ready order only, and one false for
-- every refusal so the answer cannot be used to probe short codes. A second tap
-- keeps the first timestamp.

create function customer_acknowledge_ready_order(
  p_short_code text,
  p_tracking_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_order orders%rowtype;
begin
  if v_code = '' then
    return false;
  end if;

  select * into v_order
  from orders o
  where o.short_code = v_code
    and (
      o.tracking_token::text = v_token
      or (auth.uid() is not null and o.user_id = auth.uid())
    )
  for update;

  if not found or v_order.status <> 'ready' then
    return false;
  end if;

  update orders
  set ready_acknowledged_at = coalesce(ready_acknowledged_at, now())
  where id = v_order.id;

  return true;
end;
$$;

comment on function customer_acknowledge_ready_order(text, text) is
  'Records "I''m coming" on a ready order for its tracking-token holder or '
  'signed-in owner. Refusals are deliberately indistinguishable.';

revoke execute on function customer_acknowledge_ready_order(text, text)
  from public, anon, authenticated;
grant execute on function customer_acknowledge_ready_order(text, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The counter's ring.
-- ---------------------------------------------------------------------------
--
-- For a customer who tapped "I'm coming" and still has not come, or who never
-- opened the page at all. Stamping a fresh ring and clearing the tap is what
-- makes the phone treat it as a new alarm.
--
-- The cooldown is for a double tap on the tablet, which would otherwise fire
-- two alarms and two pushes. It is short enough that a counter ringing on
-- purpose never meets it twice.

create function staff_ring_ready_order(p_order_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_order orders%rowtype;
begin
  if not current_staff_has_permission('orders:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not current_staff_can_access_branch(v_order.branch_id) then
    raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001';
  end if;

  if v_order.status <> 'ready' then
    raise exception 'INVALID_TRANSITION:%->ring', v_order.status
      using errcode = 'P0001';
  end if;

  if v_order.ready_ring_at is not null
     and v_order.ready_ring_at > v_now - interval '15 seconds' then
    raise exception 'RING_COOLDOWN' using errcode = 'P0001';
  end if;

  update orders
  set ready_ring_at = v_now,
      ready_acknowledged_at = null
  where id = p_order_id;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (v_uid, 'order.ready_rung', 'orders', p_order_id::text, jsonb_build_object(
    'previousRingAt', v_order.ready_ring_at,
    'customerHadAcknowledged', v_order.ready_acknowledged_at is not null
  ));

  return v_now;
end;
$$;

comment on function staff_ring_ready_order(uuid) is
  'Rings the customer again for a ready order: stamps ready_ring_at and clears '
  'ready_acknowledged_at. Refuses a second ring inside 15 seconds.';

revoke execute on function staff_ring_ready_order(uuid)
  from public, anon, authenticated;
grant execute on function staff_ring_ready_order(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The tracking page has to hear a ring now, not on its next 20 second poll.
-- ---------------------------------------------------------------------------
--
-- 0021's signal fired on a status change only, and a ring changes no status.
-- The payload stays data free: the page re-reads the order through
-- get_order_by_tracking, which is still the only thing that decides what it
-- may see. The acknowledgement is included so a second tab or a second phone
-- holding the same link stops ringing too.

create or replace function broadcast_order_tracking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     or new.ready_ring_at is distinct from old.ready_ring_at
     or new.ready_acknowledged_at is distinct from old.ready_acknowledged_at then
    perform realtime.send(
      jsonb_build_object('changed', true),
      'status_changed',
      'order-tracking:' || new.tracking_token::text,
      false
    );
  end if;

  return new;
end;
$$;

revoke execute on function broadcast_order_tracking_status()
  from public, anon, authenticated, service_role;

drop trigger orders_broadcast_tracking_status on orders;

create trigger orders_broadcast_tracking_status
  after update of status, ready_ring_at, ready_acknowledged_at on orders
  for each row
  when (
    old.status is distinct from new.status
    or old.ready_ring_at is distinct from new.ready_ring_at
    or old.ready_acknowledged_at is distinct from new.ready_acknowledged_at
  )
  execute function broadcast_order_tracking_status();

-- ---------------------------------------------------------------------------
-- The tracking reader, from 0014, with the two stamps added to its timeline.
-- ---------------------------------------------------------------------------
--
-- Copied whole because create or replace takes the whole body. The only change
-- is the lines marked 0085. Grants survive a replace and are restated below
-- anyway, so a fresh build and production agree.

create or replace function get_order_by_tracking(
  p_short_code text,
  p_tracking_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Upper-cased and trimmed, because this arrives from a URL a person may
  -- have typed off a screenshot, and NY-ABC234 is the same order as ny-abc234.
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_order orders%rowtype;
  v_branch branches%rowtype;
  v_slot pickup_slots%rowtype;
  v_payment payments%rowtype;
  v_items jsonb;
begin
  if v_code = '' then
    return null;
  end if;

  select * into v_order
  from orders o
  where o.short_code = v_code
    and (
      -- The token is the guest's key. The cast is on the column rather than on
      -- the input so a malformed token is a miss rather than an error: an
      -- invalid uuid cast would raise, and a raise is a different answer from
      -- a null, which is the whole distinction this function refuses to make.
      o.tracking_token::text = v_token
      -- Or the customer's own session, once customer sign-in exists. Written
      -- now because it costs one line and because a signed-in customer opening
      -- their order history should not need a token they never saw.
      or (auth.uid() is not null and o.user_id = auth.uid())
    );

  if not found then
    return null;
  end if;

  select * into v_branch from branches where id = v_order.branch_id;
  select * into v_payment from payments where order_id = v_order.id;
  if v_order.pickup_slot_id is not null then
    select * into v_slot from pickup_slots where id = v_order.pickup_slot_id;
  end if;

  -- The snapshots, not the menu. An order placed last Tuesday says what was
  -- actually sold, at the price actually charged, however the menu has been
  -- edited since. That is what the *_snapshot columns in 0005 are for, and
  -- joining back to menu_items here would quietly undo them.
  select coalesce(jsonb_agg(item.line order by item.name, item.id), '[]'::jsonb)
    into v_items
  from (
    select
      oi.id,
      oi.item_name_snapshot as name,
      jsonb_build_object(
        'name', oi.item_name_snapshot,
        'variationLabel', oi.variation_label_snapshot,
        'quantity', oi.qty,
        'unitPriceCents', oi.unit_price_cents,
        'lineTotalCents', oi.line_total_cents,
        'notes', oi.notes,
        'options', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'group', oio.group_name_snapshot,
                'name', oio.name_snapshot,
                'priceCents', oio.price_cents,
                'heatPercent', oio.heat_percent_snapshot
              )
              order by oio.price_cents, oio.name_snapshot
            )
            from order_item_options oio
            where oio.order_item_id = oi.id
          ),
          '[]'::jsonb
        )
      ) as line
    from order_items oi
    where oi.order_id = v_order.id
  ) item;

  return jsonb_build_object(
    'shortCode', v_order.short_code,
    'status', v_order.status,
    'placedAt', v_order.placed_at,
    -- The four digit counter handoff code (spec section 10, N2). It is the
    -- reason this page needs a token at all: anybody holding this URL can read
    -- the code that claims the order.
    'pickupCode', v_order.pickup_code,
    -- The end is derived from the branch's current slot length, because
    -- pickup_slots stores a start and a capacity and nothing else: the grid is
    -- a function of the branch, exactly as get_pickup_slots computes it. The
    -- one case where that is imprecise is an order placed before somebody
    -- changed pickup_slot_minutes, which would redraw a past window by a few
    -- minutes. Storing an end on the row would fix it and is not worth a
    -- column until a branch has actually changed its granularity.
    'pickup', case
      when v_slot.id is null then null
      else jsonb_build_object(
        'startsAt', v_slot.slot_start,
        'endsAt', v_slot.slot_start
          + make_interval(mins => v_branch.pickup_slot_minutes)
      )
    end,
    'branch', jsonb_build_object(
      'slug', v_branch.slug,
      'name', v_branch.name,
      'shortName', v_branch.short_name,
      'timezone', v_branch.timezone,
      'addressLine', v_branch.address_line,
      'city', v_branch.city,
      'phones', to_jsonb(v_branch.phones)
    ),
    'customer', jsonb_build_object(
      'name', v_order.customer_name,
      'phone', v_order.customer_phone,
      'email', v_order.customer_email
    ),
    'items', v_items,
    'subtotalCents', v_order.subtotal_cents,
    'discountCents', v_order.discount_cents,
    'totalCents', v_order.total_cents,
    'notes', v_order.notes,
    'payment', case
      when v_payment.id is null then null
      else jsonb_build_object(
        'method', v_payment.method,
        'status', v_payment.status,
        'amountCents', v_payment.amount_cents,
        'paidAt', v_payment.paid_at
      )
    end,
    -- Every timestamp the lifecycle stamps, so the page can say what happened
    -- and when rather than only what is true now. Nulls are meaningful: they
    -- are the steps that have not happened.
    'timeline', jsonb_build_object(
      'acceptedAt', v_order.accepted_at,
      'preparingAt', v_order.preparing_at,
      'readyAt', v_order.ready_at,
      'claimedAt', v_order.claimed_at,
      'rejectedAt', v_order.rejected_at,
      'rejectedReason', v_order.rejected_reason,
      'cancelledAt', v_order.cancelled_at,
      'cancelledReason', v_order.cancelled_reason,
      'customerArrivedAt', v_order.customer_arrived_at,
      -- 0085. The customer's "I'm coming" tap and staff's latest ring. The
      -- phone rings while the order is ready and the tap is null, and a ring
      -- clears the tap, so a ring after it starts the alarm again.
      'readyAcknowledgedAt', v_order.ready_acknowledged_at,
      'readyRingAt', v_order.ready_ring_at,
      'noShowAt', v_order.no_show_at
    )
  );
end;
$$;

revoke execute on function get_order_by_tracking(text, text) from public;
grant execute on function get_order_by_tracking(text, text) to anon, authenticated;
