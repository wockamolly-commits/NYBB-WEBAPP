-- 0091: payment events that arrive late, twice, or after a refund.
--
-- apply_paymongo_payment (last written in 0043) only treated 'paid' as
-- settled. Two consequences, both reproduced against the migrations:
--
--   1. A redelivered payment.paid for an order that had been fully refunded
--      set the payment back to 'paid', cleared needs_refund, and returned the
--      order id, so the webhook rang the counter and staff_set_order_status
--      would then let staff cook an order whose money was already returned.
--      A late payment.failed on the same payment set it to 'failed' and
--      cancelled the order.
--   2. A repeated payment.failed re-sent the "payment failed" notice.
--
-- And separately, claim_staff_new_order_notice (0048) checked only that the
-- counter had not been told yet. A customer who paid after the expiry sweep
-- cancelled their order got a payment marked needs_refund, and the counter
-- got a "New order" alert for an order that was not on the board. The claim
-- now also requires the order to still be live.
--
-- And a third, from PayMongo's own documentation rather than a reproduction:
-- the payment resource in a payment.paid event carries `amount` (centavos)
-- and `currency`, and nothing compared them with what this order charged. A
-- paid event whose amount or currency disagrees with the payment row is now
-- refused: the payment stays unpaid, the event is kept on the row, and an
-- audit entry against the order says what arrived. The webhook still answers
-- 2xx, so PayMongo does not retry an event that will never change.

create or replace function apply_paymongo_payment(
  p_intent_id text,
  p_status text,
  p_payment_id text,
  p_raw jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_order_id uuid;
  v_payment_status payment_status;
  v_order_status order_status;
  v_slot_id uuid;
  v_expected_cents bigint;
  v_event_amount text;
  v_event_currency text;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = 'P0001';
  end if;

  select p.id, p.order_id, p.status, o.status, o.pickup_slot_id, p.amount_cents
    into v_payment_id, v_order_id, v_payment_status, v_order_status, v_slot_id, v_expected_cents
  from payments p
  join orders o on o.id = p.order_id
  where p.provider = 'paymongo'
    and p.provider_intent_id = p_intent_id
  for update of p, o;

  if v_payment_id is null then
    return null;
  end if;

  -- A refunded payment is finished. Since 0033 money only reaches 'refunded'
  -- once a refund has succeeded, so a paid event arriving now is a redelivery
  -- or an out-of-order delivery of something that already happened. Before
  -- 0091 the paid branch below turned it back into 'paid' (and rang the
  -- counter for an order whose money was already returned), and the failed
  -- branch turned it into 'failed' and cancelled the order.
  if v_payment_status = 'refunded' then
    return null;
  end if;

  -- The same failure told twice. The first one already cancelled the order and
  -- told the customer; the second must not tell them again.
  if p_status = 'failed' and v_payment_status = 'failed' then
    return null;
  end if;

  if p_status = 'paid' then
    if v_payment_status = 'paid' then
      -- Was: return v_order_id. A redelivery of the same paid event lands
      -- here, and telling the caller about it rang the counter twice.
      return null;
    end if;

    -- The payment resource, where PayMongo's event puts it. Absent for the
    -- development mock, which sends no amount, and then there is nothing to
    -- compare.
    v_event_amount := p_raw->'data'->'attributes'->'data'->'attributes'->>'amount';
    v_event_currency := p_raw->'data'->'attributes'->'data'->'attributes'->>'currency';
    if (v_event_amount is not null
          and (v_event_amount !~ '^[0-9]{1,15}$' or v_event_amount::bigint <> v_expected_cents))
       or (v_event_currency is not null and upper(v_event_currency) <> 'PHP')
    then
      update payments set raw_webhook = p_raw where id = v_payment_id;
      insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
      values (
        null, 'payment.amount_mismatch', 'orders', v_order_id::text,
        jsonb_build_object(
          'expected_cents', v_expected_cents,
          'received_amount', v_event_amount,
          'received_currency', v_event_currency
        )
      );
      return null;
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

    if v_order_status = 'pending' then
      if v_slot_id is not null then
        update pickup_slots
          set reserved = greatest(reserved - 1, 0)
        where id = v_slot_id;
      end if;

      update orders
        set status = 'cancelled',
            cancelled_at = now(),
            cancelled_reason = 'payment_failed',
            pickup_slot_id = null
        where id = v_order_id
          and status = 'pending';

      insert into order_status_events (order_id, from_status, to_status, reason)
      select order_id, 'pending', 'cancelled', 'payment_failed'
      from payments
      where id = v_payment_id;
    end if;
  else
    -- A 'failed' event for a payment that is already paid. The elsif above
    -- skipped every write, so there is nothing to tell anyone about. Was:
    -- fall through to `return v_order_id`, which notified the customer that
    -- their payment had failed when it had not.
    return null;
  end if;

  return v_order_id;
end;
$$;

create or replace function claim_staff_new_order_notice(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claimed boolean;
begin
  if p_order_id is null then
    return false;
  end if;

  -- One statement, for the reason 0048 gives. The status condition is new in
  -- 0091: a cancelled or rejected order is not news for the kitchen, and the
  -- money it may be holding is surfaced on the board as a refund owed instead.
  update public.orders
     set staff_notified_at = now()
   where id = p_order_id
     and staff_notified_at is null
     and status in ('pending', 'accepted', 'preparing', 'ready')
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;
