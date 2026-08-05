-- 0010_grants.sql
-- Postgres GRANTs, the companion to 0009.
--
-- RLS decides which rows a role may see. The grant decides whether the role
-- may attempt the table at all. A policy without a grant returns 42501; a
-- grant without a policy returns an empty set, which is the quieter and
-- therefore worse failure.
--
-- Three deliberate positions:
--
--   1. anon holds nothing. No table, no view, no sequence. The storefront
--      reaches the database only through SECURITY DEFINER functions, so the
--      entire public read surface is the short grant list at the bottom of
--      this file and can be reviewed in one sitting.
--   2. authenticated may SELECT operational data and may write catalog and
--      configuration, but holds no INSERT, UPDATE or DELETE on orders,
--      order_items, order_item_options, order_status_events, payments,
--      pickup_slots or pos_sync. Every write there is an RPC that checks
--      current_role_kind() and writes the audit trail in the same
--      transaction. Without the grant, there is no way to skip it.
--   3. Function EXECUTE is revoked from PUBLIC and handed back by name.
--      Postgres grants EXECUTE to PUBLIC on every new function by default,
--      which would have left rate_limit_hit callable by any anonymous visitor,
--      and a rate limiter an attacker can drive is not a rate limiter.

-- ---------------------------------------------------------------------------
-- Clear the Supabase bootstrap grants first.
--
-- Supabase ships `alter default privileges in schema public grant all on
-- tables to anon, authenticated, service_role`, so pg_default_acl hands every
-- new table TRUNCATE, REFERENCES and TRIGGER to anon and authenticated for
-- free. TRUNCATE is not subject to row level security, so no policy in 0009
-- would stop it. Insert, select, update and delete are not in that set, which
-- is why the explicit grants below are still needed.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

revoke truncate, references, trigger
  on all tables in schema public
  from anon, authenticated;

-- Future tables, or the revoke above decays the moment anyone adds one.
-- Scoped `for role postgres` because that is the role that owns the default in
-- pg_default_acl: a bare alter default privileges would only touch the
-- executing role's own defaults and would silently do nothing.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger
  on tables
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reads. RLS in 0009 gates the rows.
-- ---------------------------------------------------------------------------

grant select on
  price_lists,
  branches,
  store_hours,
  menu_categories,
  menu_items,
  item_variations,
  menu_option_groups,
  menu_options,
  menu_item_option_groups,
  item_variation_prices,
  menu_option_variation_prices,
  carts,
  cart_items,
  cart_item_options,
  customer_carts,
  pickup_slots,
  orders,
  order_items,
  order_item_options,
  order_status_events,
  payments,
  pos_sync,
  profiles,
  customer_profiles,
  staff_invitations,
  staff_permission_overrides,
  audit_logs,
  app_settings,
  vouchers,
  voucher_redemptions,
  franchise_inquiries
  to authenticated;

-- ---------------------------------------------------------------------------
-- Writes on the catalog and configuration. These are the owner tools: menu,
-- prices, hours, branches, promo codes, staff. If the owner has to call a
-- developer to change a price, the platform has failed.
-- ---------------------------------------------------------------------------

grant insert, update, delete on
  price_lists,
  branches,
  store_hours,
  menu_categories,
  menu_items,
  item_variations,
  menu_option_groups,
  menu_options,
  menu_item_option_groups,
  item_variation_prices,
  menu_option_variation_prices,
  vouchers,
  staff_invitations,
  staff_permission_overrides,
  profiles
  to authenticated;

grant update on app_settings to authenticated;
grant update on franchise_inquiries to authenticated;

-- The customer's own two rows.
grant insert, update on customer_profiles to authenticated;
grant insert, update, delete on customer_carts to authenticated;

-- ---------------------------------------------------------------------------
-- Functions.
-- ---------------------------------------------------------------------------

-- Take back the implicit PUBLIC grant on everything this schema defines.
revoke execute on function
  set_updated_at(),
  generate_short_code(),
  generate_pickup_code(),
  branch_is_open_at(uuid, timestamptz),
  resolve_variation_price_cents(uuid, uuid),
  resolve_option_price_cents(uuid, uuid, uuid),
  current_role_kind(),
  current_staff_role(),
  is_staff(),
  is_admin(),
  get_public_settings(),
  branch_accepts_orders(uuid, timestamptz),
  rate_limit_hit(text, int, int)
  from public;

-- The policy helpers. A row level security expression is evaluated as the
-- querying role, so authenticated must be able to call the functions its own
-- policies name, or every staff read fails with permission denied on a
-- function rather than on the table, which is a puzzling error to debug.
grant execute on function
  current_role_kind(),
  current_staff_role(),
  is_staff(),
  is_admin()
  to authenticated;

-- The public read surface, in full. Nothing here exposes a row: two booleans
-- and a handful of flags.
grant execute on function
  get_public_settings(),
  branch_is_open_at(uuid, timestamptz),
  branch_accepts_orders(uuid, timestamptz)
  to anon, authenticated;

-- Server-only. rate_limit_hit is called from the service-role client, and the
-- price resolvers are called from inside SECURITY DEFINER functions, where the
-- effective user is the function owner rather than the caller.
grant execute on function rate_limit_hit(text, int, int) to service_role;

-- ---------------------------------------------------------------------------
-- Phase 1 adds place_order(), get_storefront_menu(), get_order_by_tracking()
-- and the pickup slot reader. Each one needs its grant in the same migration
-- that creates it. A function shipped without one is invisible to the client
-- and looks like a routing bug for about an hour.
-- ---------------------------------------------------------------------------
