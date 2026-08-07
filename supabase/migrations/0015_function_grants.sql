-- 0015_function_grants.sql
-- Revoking EXECUTE from the grantee that actually held it.
--
-- THE BUG THIS FIXES, AND WHY EVERY TEST PASSED WHILE IT WAS THERE.
-- ---------------------------------------------------------------------------
-- 0010 states the position: function EXECUTE is revoked and handed back by
-- name, because "Postgres grants EXECUTE to PUBLIC on every new function by
-- default, which would have left rate_limit_hit callable by any anonymous
-- visitor, and a rate limiter an attacker can drive is not a rate limiter."
--
-- That is true of Postgres and insufficient on Supabase. Supabase also ships
--
--   alter default privileges for role postgres in schema public
--     grant execute on functions to anon, authenticated, service_role;
--
-- so every function these migrations create arrives carrying an EXPLICIT grant
-- to anon, visible in pg_proc.proacl as `anon=X/postgres`. A `revoke execute
-- ... from public` does not touch it. PUBLIC and anon are different grantees,
-- and 0010 revoked from the one nobody held.
--
-- The first Supabase project these migrations were applied to therefore had
-- all nineteen functions in `public` executable by anon: the price resolvers,
-- the code generators, resolve_pickup_branch_id, and rate_limit_hit. The last
-- one is the one that matters. A limiter an anonymous caller can invoke
-- directly is a limiter they can drive to its ceiling against any key they can
-- guess, which turns a defence against abuse into a way to lock a specific
-- customer's phone number out of ordering.
--
-- Nothing caught it because PGlite is a bare Postgres with no such default,
-- so the assertion in tests/sql/place-order.test.ts that anon cannot execute
-- rate_limit_hit was true there and false in production. The harness now
-- reproduces the default privilege, and that test fails without this file.
-- This is exactly the gap the harness header warns about: it can prove the
-- schema is coherent, and it could not prove what a real role may call.

-- ---------------------------------------------------------------------------
-- 1. Stop new functions inheriting it.
--
-- Without this, the next migration to add a function reintroduces the hole,
-- and it does so silently. No FOR ROLE clause: default privileges attach to
-- the role that creates the object, migrations run as the owner, and naming a
-- role here that does not exist in a given environment would fail the whole
-- file. The implicit form is the current role, which is the same role whose
-- default privileges granted this in the first place.
-- ---------------------------------------------------------------------------

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Take it back from everything that already exists.
--
-- Deliberately a blanket revoke rather than a list. A list is the thing that
-- went wrong above: it can only name what somebody remembered, and the whole
-- failure was a grant nobody knew had been made. Every function in `public` is
-- one of ours (the extensions live in their own schemas), so there is nothing
-- here to catch in the blast radius.
--
-- service_role is untouched. It is the trusted server identity, it already
-- bypasses RLS by design, and rate_limit_hit is granted to it on purpose.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Hand back exactly the intended surface, and nothing else.
--
-- These seven are the public read and write surface, unchanged from what 0010
-- to 0014 meant to grant. Anything not named here is server-side: the price
-- resolvers, resolve_pickup_branch_id, resolve_price_list_id, the short code
-- and pickup code generators, and set_updated_at.
--
-- Revoking the trigger function is safe and was checked rather than assumed:
-- firing a trigger does not require EXECUTE on its function, only creating the
-- trigger does. An authenticated write that touches updated_at still works.
-- ---------------------------------------------------------------------------

grant execute on function
  get_public_settings(),
  branch_is_open_at(uuid, timestamptz),
  branch_accepts_orders(uuid, timestamptz),
  get_storefront_menu(text),
  get_pickup_slots(text, timestamptz),
  place_order(jsonb, uuid),
  get_order_by_tracking(text, text)
  to anon, authenticated;

-- The policy helpers. A row level security expression is evaluated as the
-- querying role, so authenticated must be able to call the functions its own
-- policies name, or every staff read fails with permission denied on a
-- function rather than on the table. Same reasoning as 0010, restated because
-- the blanket revoke above took these away too.
grant execute on function
  current_role_kind(),
  current_staff_role(),
  is_staff(),
  is_admin()
  to authenticated;

-- Re-asserted rather than assumed. The revoke above does not name service_role,
-- but this is the grant the whole address limiter depends on, and a file about
-- function privileges that leaves the reader to go and check 0010 for the one
-- that matters is a file doing half its job.
grant execute on function rate_limit_hit(text, int, int) to service_role;
