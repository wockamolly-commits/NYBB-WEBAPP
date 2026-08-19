-- 0048_staff_new_order_notice.sql
-- Telling the counter about an order that is paid at the counter.
--
-- WHAT WAS WRONG.
-- ===========================================================================
-- notifyStaffOfNewOrder had exactly two callers: the PayMongo webhook and the
-- development mock rail. Both of them fire when money arrives, so the counter
-- was told about a payment rather than about an order.
--
-- Every order this system can currently take is paid at the counter.
-- paymongo_enabled is off in app_settings, so getCheckoutPaymentMethods
-- returns nothing and checkout offers `counter` alone; `place_order` writes
-- the payment row as `due` and the money is captured at claim. Nothing in
-- that sequence ever reaches a webhook, so the tablet rang for no order at
-- all. The single test the whole staff half exists for, in
-- docs/push-device-test-checklist.md, is "close the browser entirely, place an
-- order, the tablet must ring", and it could not be performed. It was read as
-- blocked on PayMongo merchant approval, which has a lead time in weeks. It
-- was not: it was blocked on a trigger that was never wired.
--
-- Spec section 15 says staff push "fires on a new order landing", not on a
-- payment settling, so the application is what diverged.
--
-- WHY THIS NEEDS A MIGRATION AT ALL.
-- ===========================================================================
-- The trigger point is one line in a Server Action. The reason there is SQL
-- here is that `place_order` is idempotent on a browser-minted attempt id: a
-- replayed Server Action returns the first attempt's stored result, byte for
-- byte, and nothing in that answer distinguishes a fresh order from a replay.
-- Sending on every successful return would ring the counter twice for one
-- order on any retry, which is precisely the case the attempt id exists to
-- make safe.
--
-- So the claim lives here, next to the row, rather than in the caller. Note
-- what that buys beyond the checkout path: the webhook is also a retrying
-- caller (PayMongo redelivers), and a staff member's tablet has no way to tell
-- a duplicate alert from a second order. One guard, in front of every caller,
-- rather than one condition per call site.

alter table orders add column staff_notified_at timestamptz;

comment on column orders.staff_notified_at is
  'When the counter was told this order exists. Written only by '
  'claim_staff_new_order_notice, which is what makes that telling exactly once.';

create function claim_staff_new_order_notice(p_order_id uuid)
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

  -- The whole guard is the `where`, and it has to be, because a check
  -- followed by a write is two statements with a gap between them. Under read
  -- committed a second caller arriving during that gap blocks on the row,
  -- re-reads it when the first commits, finds staff_notified_at set, and
  -- updates nothing. It gets false and sends nothing, which is the answer that
  -- makes this exactly once rather than usually once.
  update public.orders
     set staff_notified_at = now()
   where id = p_order_id
     and staff_notified_at is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

comment on function claim_staff_new_order_notice(uuid) is
  'Claims the right to tell the counter about one order, once. True means the '
  'caller holds it and should send; false means somebody already did, or the '
  'order does not exist. Both refusals are the same false on purpose.';

-- Named role by role rather than left to `revoke from public`. Supabase ships
-- a default privilege granting EXECUTE on functions to anon that `from public`
-- does not touch, which is how every function in this schema was once callable
-- by anonymous callers with 327 tests passing. Handoff trap 14.
--
-- service_role is the one grantee, and it is the only caller: the dispatch
-- path runs on the admin client. No browser has any business marking an order
-- as announced, least of all one that could then keep the counter quiet by
-- claiming the notice before the server does.
revoke execute on function claim_staff_new_order_notice(uuid)
  from public, anon, authenticated, service_role;
grant execute on function claim_staff_new_order_notice(uuid)
  to service_role;
