-- 0087_counter_payment_gate.sql
--
-- Anybody holding the public anon key could book an unpaid order.
--
-- WHAT WAS OPEN.
--
-- place_order (0065) defaults payment_method to 'counter' and only refuses a
-- method other than counter when PayMongo is off. Counter itself was never
-- refused. The owner's ruling is payment first (PRODUCT.md, spec section
-- 27-1b), and the checkout screen honours it by never offering counter, but
-- the screen is not the authority: place_order is granted to anon, and the
-- anon key ships to every browser. So a request made straight to
-- /rest/v1/rpc/place_order, with no payment_method at all, wrote an order with
-- a payment row of 'due', booked a pickup slot and put a ticket on the counter
-- board at any branch accepting orders. It worked while the storefront said
-- ordering was not open, because closing the storefront removes a PayMongo key
-- from the deployment and that key is not something the database consults.
-- Found on 2026-10-15 reading the live function definition.
--
-- THE FIX.
--
-- A flag, off, and the database as its authority. counter_payments_enabled
-- joins the other integration switches in app_settings. While it is off, a
-- counter payment cannot be written, and because the payment row is written
-- inside place_order's transaction, refusing it unwinds the order, the slot
-- booking, the voucher use and the rate limit increment along with it.
--
-- A trigger rather than a restatement of place_order. That function is six
-- hundred lines, and restating all of it to change one condition is how a
-- second, unrelated difference ships unreviewed. The guard sits on the one
-- table every order must write to, so it also covers any future writer that
-- forgets to ask. The error is the one place_order already raises for a
-- method the business has not switched on, so lib/checkout/messages.ts maps it
-- without a new case.
--
-- place_order's own comment ("Counter is the only rail until PayMongo is
-- flipped on") predates the payment-first ruling and is now wrong; this file
-- is the correction.

alter table app_settings
  add column if not exists counter_payments_enabled boolean not null default false;

comment on column app_settings.counter_payments_enabled is
  'Whether an order may be placed to be paid at the counter on collection. Off by '
  'default: the owner ruled payment first. Enforced by payments_counter_gate (0087).';

create or replace function enforce_counter_payment_gate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.method = 'counter'
    and not coalesce(
      (select counter_payments_enabled from app_settings where id = 1),
      false
    )
  then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function enforce_counter_payment_gate() from public, anon, authenticated;

drop trigger if exists payments_counter_gate on payments;
create trigger payments_counter_gate
  before insert on payments
  for each row execute function enforce_counter_payment_gate();
