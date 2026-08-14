-- 0043_payment_reconciliation_reports_no_ops.sql
-- Make apply_paymongo_payment's answer mean "I changed something".
--
-- 0040 made this function return the order id so the webhook could tell the
-- counter about a paid order and the customer about a failed payment. It
-- returned that id on every path that matched an intent, including the two
-- where it did nothing at all, and the caller has no way to tell those apart.
--
-- Both of those paths are ordinary traffic rather than edge cases:
--
--   1. A redelivered `payment.paid`. PayMongo retries on any non-2xx or
--      timeout, and the webhook route answers 500 when reconciliation fails,
--      so a retry is expected rather than exceptional. The second delivery
--      took the `v_payment_status = 'paid'` early return, still handed back an
--      order id, and rang the counter tablet a second time for an order
--      already sitting on the board.
--   2. A `payment.failed` arriving after the payment is already paid. The
--      `elsif v_payment_status <> 'paid'` branch is skipped entirely, nothing
--      is written, and the id came back anyway, so the customer was told their
--      payment failed on the strength of a database change that did not
--      happen. `tests/sql/paymongo-payment-lifecycle.test.ts` already exercises
--      exactly this sequence as expected traffic.
--
-- So the contract is now: the order id when this call reconciled something,
-- null when it did not. Null already meant "no matching intent", and both
-- readings share the only thing the caller does with it, which is decide
-- whether to notify anybody.
--
-- THIS IS A CORRECTION TO THE PLAN, NOT AN IMPLEMENTER'S DIVERGENCE. The task
-- brief behind 0040 said in as many words to return the id on every path. It
-- was written before anyone traced what a redelivery does.
--
-- The body is 0040's verbatim apart from the two returns. The return type is
-- unchanged, so this is a replace rather than the drop 0040 needed, and the
-- grants below are restated rather than repaired: `create or replace` keeps
-- the existing ACL, and naming them is how this schema documents that the
-- function is service_role only (handoff trap 14).

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
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = 'P0001';
  end if;

  select p.id, p.order_id, p.status, o.status, o.pickup_slot_id
    into v_payment_id, v_order_id, v_payment_status, v_order_status, v_slot_id
  from payments p
  join orders o on o.id = p.order_id
  where p.provider = 'paymongo'
    and p.provider_intent_id = p_intent_id
  for update of p, o;

  if v_payment_id is null then
    return null;
  end if;

  if p_status = 'paid' then
    if v_payment_status = 'paid' then
      -- Was: return v_order_id. A redelivery of the same paid event lands
      -- here, and telling the caller about it rang the counter twice.
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

revoke execute on function apply_paymongo_payment(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function apply_paymongo_payment(text, text, text, jsonb)
  to service_role;

comment on function apply_paymongo_payment(text, text, text, jsonb) is
  'Reconciles one PayMongo payment event. Returns the order id when the call '
  'changed something, and null when it did not: no matching intent, a '
  'redelivered paid event, or a failure arriving after the payment succeeded. '
  'Callers use the answer to decide whether to notify anybody, so a no-op must '
  'not look like a reconciliation.';
