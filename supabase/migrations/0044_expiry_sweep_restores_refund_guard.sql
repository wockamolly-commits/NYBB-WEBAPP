-- 0044_expiry_sweep_restores_refund_guard.sql
-- Put back the guard that stops the expiry sweep calling a refund a failure.
--
-- WHAT WENT WRONG, AND HOW IT HID.
-- ============================================================================
-- `expire_unpaid_online_orders()` has been restated three times: 0030 wrote it,
-- 0033 amended it, and 0039 restated it again to add the queued notification.
-- 0039's brief said to copy the body from 0030, and its reviewer diffed the
-- result against 0030 and correctly found it byte-identical apart from the
-- intended insert. Both were looking at the wrong ancestor. 0033 was the
-- latest one, and the single line it had changed was silently reverted:
--
--   0030   where order_id = v_order_id and status <> 'paid'
--   0033   where order_id = v_order_id and status not in ('paid', 'refunded')
--   0039   where order_id = v_order_id and status <> 'paid'          <- reverted
--
-- This is the same defect as the one recorded against Task 7's brief, which
-- also cited 0030 when 0032 was the latest ancestor. A function restated by
-- more than one migration needs the diff taken against the most recent one, not
-- against the migration that introduced it.
--
-- WHY THE MISSING GUARD MATTERS, WHICH IS NOT OBVIOUS.
-- ============================================================================
-- It looks unreachable: a refund follows a paid payment, and the loop skips a
-- paid one. But paying does NOT move the order out of `pending`. 0030 says so
-- in as many words, and `tests/sql/paymongo-payment-lifecycle.test.ts` asserts
-- it: "marks a matching pending intent paid without changing the order
-- lifecycle". The order sits `pending` until a staff member accepts it.
--
-- So there is a real window: an order is `pending`, its payment is `paid`, and
-- a staff member refunds it before anyone accepts the order. The payment is now
-- `refunded`, which is not `paid`, so the sweep's own paid-race guard no longer
-- fires. The order is cancelled, which is defensible, and then the refunded
-- payment is overwritten to `failed`, which is not: the money went back to the
-- customer, and the payment row now says the charge never succeeded. The
-- `refunds` row survives and disagrees with it.
--
-- Everything else in this body is 0039's verbatim, including the queued
-- notification. Diff this against 0039, which is now the latest ancestor.

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

    insert into notifications (channel, target, template, payload)
    select 'push', o.short_code, 'order_cancelled_expired',
           jsonb_build_object('order_id', o.id)
    from orders o where o.id = v_order_id;

    -- The restored guard. `refunded` is a settled outcome, not a payment still
    -- in flight, and this sweep has no business rewriting it.
    update payments
      set status = 'failed'
      where order_id = v_order_id and status not in ('paid', 'refunded');

    insert into order_status_events (order_id, from_status, to_status, reason)
    values (v_order_id, 'pending', 'cancelled', 'payment_timeout');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function expire_unpaid_online_orders()
  from public, anon, authenticated;
grant execute on function expire_unpaid_online_orders() to service_role;
