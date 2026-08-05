-- 0001_types.sql
-- Enum types, the shared updated_at helper, and the two code generators.
--
-- Conventions inherited from the reference implementation (C:\dev\zombeans-web,
-- migrations 0001 to 0011) and applied throughout this schema:
--
--   * Money is always BIGINT minor units (centavos), named *_cents. Never a
--     float and never numeric. 12000 renders as PHP 120.00.
--   * Every mutable table carries updated_at and a set_updated_at() trigger.
--   * Authorization inside SECURITY DEFINER functions goes through
--     current_role_kind(), defined in 0007 once profiles exists.
--   * Every table gets RLS (0009) and an explicit GRANT (0010). A new table
--     without both is a 42501 waiting to happen, or worse, an open door.
--
-- These migrations are written but not applied: no Supabase project exists for
-- this app yet.

create extension if not exists pgcrypto;

-- Pickup is the only service this platform runs, and delivery is an explicit
-- anti-goal (spec section 30). The enum still carries dine_in so that adding
-- it later is a CHECK constraint change on one column rather than a type
-- migration across every order row. orders.service_mode is pinned to 'pickup'
-- by a CHECK in 0005.
create type service_mode as enum ('pickup', 'dine_in');

-- Spec section 12. ACTIVE_STATUSES = the first four, TERMINAL_STATUSES = the
-- last four. There is no out_for_delivery here and there never will be.
create type order_status as enum (
  'pending',
  'accepted',
  'preparing',
  'ready',
  'claimed',
  'rejected',
  'cancelled',
  'no_show'
);

-- 'counter' is pay at the counter on collection, the default rail. The other
-- four are online prepay through PayMongo and stay dark until paymongo_enabled
-- is flipped. QR Ph is the one proven live in the reference; card additionally
-- needs the legal pages and separate merchant approval (spec section 17).
create type payment_method as enum ('counter', 'qrph', 'gcash', 'maya', 'card');

create type payment_provider as enum ('manual', 'paymongo');

-- 'due' is money the business expects to collect in person and is not chasing:
-- a counter order sits here from placement until the claim action records it.
-- 'pending' is an online intent awaiting its webhook, which is a different
-- thing operationally (it expires, it releases a pickup slot, it is a risk).
-- The reference conflated the two under 'pending' and its dashboard could not
-- tell an unpaid online order from a counter order waiting at the till.
create type payment_status as enum ('due', 'pending', 'paid', 'refunded', 'failed');

-- The broad account class used by RLS. Keep this small: it answers "may this
-- session touch operational data at all".
create type user_role as enum ('admin', 'staff');

-- The assigned job, which supplies the default permission set that
-- resolvePermissions() then adjusts with staff_permission_overrides rows
-- (spec section 13). Separate from user_role for the same reason the reference
-- separated them: an account class is not a job description.
create type staff_role as enum ('cashier', 'kitchen', 'manager');

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The public, human-quotable order handle: NY- plus six characters from a
-- 31-character alphabet with 0, O, 1, I and L removed, so it survives being
-- read aloud across a counter.
--
-- This is a handle, not a secret. random() is not cryptographically strong and
-- six characters is guessable at scale, which is exactly why orders also carry
-- an unguessable tracking_token (0005) and why guest order tracking requires
-- that token rather than the short code alone.
create or replace function generate_short_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := 'NY-';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- The four-digit counter handoff code (spec section 10, N2). Distinct from the
-- short code: the short code identifies an order in conversation, this one
-- proves the person at the counter is the person who ordered.
--
-- Because it is an authorization check it uses gen_random_bytes rather than
-- random(). Values at or above 60000 are rejected and redrawn so that the
-- modulo does not bias the low digits, since 60000 is a whole multiple of
-- 10000. Uniqueness among live orders at a branch is enforced by a partial
-- unique index in 0005, not here.
create or replace function generate_pickup_code()
returns text
language plpgsql
volatile
as $$
declare
  v_bytes bytea;
  v_value int;
begin
  loop
    v_bytes := gen_random_bytes(2);
    v_value := (get_byte(v_bytes, 0) << 8) | get_byte(v_bytes, 1);
    exit when v_value < 60000;
  end loop;
  return lpad((v_value % 10000)::text, 4, '0');
end;
$$;
