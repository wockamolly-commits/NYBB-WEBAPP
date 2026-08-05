-- 0009_rls.sql
-- Row Level Security on every table.
--
-- The rule this schema follows, and it is stricter than the reference:
--
--   anon gets no table access at all. Not even the menu.
--
-- The reference grants anon SELECT on its menu tables, which works but means
-- the public read surface is a set of policies spread across five tables that
-- must all stay correct as columns are added. Here the storefront reads
-- get_storefront_menu() and the other SECURITY DEFINER RPCs, so the public
-- surface is a short list of functions with explicit return shapes. Anything a
-- customer can enumerate goes through a function, never a table.
--
-- RLS decides WHICH rows a role may see. The GRANT in 0010 decides whether the
-- role may attempt the table at all. Both are required: a policy without a
-- grant is a 42501, and a grant without a policy is an empty result set that
-- looks like missing data. The second failure mode is the dangerous one,
-- because it is silent. When you lock a table, audit every caller that read it.
--
-- service_role bypasses RLS entirely. That is why tables with no policies
-- below are not unreachable, they are simply server-only.

-- Config and catalog.
alter table price_lists enable row level security;
alter table branches enable row level security;
alter table store_hours enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table item_variations enable row level security;
alter table menu_option_groups enable row level security;
alter table menu_options enable row level security;
alter table menu_item_option_groups enable row level security;
alter table item_variation_prices enable row level security;
alter table menu_option_variation_prices enable row level security;

-- Carts.
alter table carts enable row level security;
alter table cart_items enable row level security;
alter table cart_item_options enable row level security;
alter table customer_carts enable row level security;

-- Orders and money.
alter table pickup_slots enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_options enable row level security;
alter table order_status_events enable row level security;
alter table payments enable row level security;
alter table checkout_attempts enable row level security;
alter table pos_sync enable row level security;

-- Accounts and trails.
alter table profiles enable row level security;
alter table customer_profiles enable row level security;
alter table staff_invitations enable row level security;
alter table staff_permission_overrides enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table push_subscriptions enable row level security;
alter table push_subscription_orders enable row level security;

-- Settings and the rest.
alter table app_settings enable row level security;
alter table rate_limits enable row level security;
alter table vouchers enable row level security;
alter table voucher_redemptions enable row level security;
alter table franchise_inquiries enable row level security;

-- ---------------------------------------------------------------------------
-- Catalog: staff read everything, staff and admin maintain it.
--
-- Menu maintenance is direct table access rather than an RPC because the owner
-- tools are CRUD over these rows and an RPC per column would be ceremony. The
-- finer question of WHICH staff may edit prices is answered by
-- resolvePermissions() in the app, on top of these policies.
-- ---------------------------------------------------------------------------

create policy "staff read price lists" on price_lists
  for select using (is_staff());
create policy "admin write price lists" on price_lists
  for all using (is_admin()) with check (is_admin());

create policy "staff read branches" on branches
  for select using (is_staff());
create policy "admin write branches" on branches
  for all using (is_admin()) with check (is_admin());

create policy "staff read store hours" on store_hours
  for select using (is_staff());
create policy "admin write store hours" on store_hours
  for all using (is_admin()) with check (is_admin());

create policy "staff read categories" on menu_categories
  for select using (is_staff());
create policy "staff write categories" on menu_categories
  for all using (is_staff()) with check (is_staff());

create policy "staff read items" on menu_items
  for select using (is_staff());
create policy "staff write items" on menu_items
  for all using (is_staff()) with check (is_staff());

create policy "staff read variations" on item_variations
  for select using (is_staff());
create policy "staff write variations" on item_variations
  for all using (is_staff()) with check (is_staff());

create policy "staff read option groups" on menu_option_groups
  for select using (is_staff());
create policy "staff write option groups" on menu_option_groups
  for all using (is_staff()) with check (is_staff());

create policy "staff read options" on menu_options
  for select using (is_staff());
create policy "staff write options" on menu_options
  for all using (is_staff()) with check (is_staff());

create policy "staff read item option groups" on menu_item_option_groups
  for select using (is_staff());
create policy "staff write item option groups" on menu_item_option_groups
  for all using (is_staff()) with check (is_staff());

create policy "staff read variation prices" on item_variation_prices
  for select using (is_staff());
create policy "staff write variation prices" on item_variation_prices
  for all using (is_staff()) with check (is_staff());

create policy "staff read option variation prices" on menu_option_variation_prices
  for select using (is_staff());
create policy "staff write option variation prices" on menu_option_variation_prices
  for all using (is_staff()) with check (is_staff());

-- ---------------------------------------------------------------------------
-- Carts.
--
-- carts and cart_items are the server-side guest cart, written only by RPCs.
-- customer_carts is the signed-in sync target and is the one table a customer
-- session touches directly, because a single-row upsert keyed on the user id
-- cannot be made unsafe by a policy this simple.
-- ---------------------------------------------------------------------------

create policy "staff read carts" on carts
  for select using (is_staff());
create policy "staff read cart items" on cart_items
  for select using (is_staff());
create policy "staff read cart item options" on cart_item_options
  for select using (is_staff());

create policy "customer reads own cart" on customer_carts
  for select using (user_id = auth.uid());
create policy "customer writes own cart" on customer_carts
  for insert with check (user_id = auth.uid());
create policy "customer updates own cart" on customer_carts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "customer clears own cart" on customer_carts
  for delete using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Orders and money.
--
-- Read only, for everyone. Every write is a SECURITY DEFINER function that
-- checks current_role_kind() internally: place_order, staff_set_order_status,
-- cashier_advance_order, claim_order. There is deliberately no write policy
-- here for any role, and 0010 grants no INSERT, UPDATE or DELETE to match, so
-- a status change cannot be smuggled past the audit trail as a bare update.
--
-- A signed-in customer reads their own orders directly. A guest has no row of
-- their own to match on and reads through get_order_by_tracking(), which
-- requires the unguessable tracking token rather than the short code.
-- ---------------------------------------------------------------------------

create policy "staff read pickup slots" on pickup_slots
  for select using (is_staff());

create policy "staff read orders" on orders
  for select using (is_staff());
create policy "customer reads own orders" on orders
  for select using (user_id is not null and user_id = auth.uid());

create policy "staff read order items" on order_items
  for select using (is_staff());
create policy "customer reads own order items" on order_items
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_items.order_id
        and o.user_id is not null
        and o.user_id = auth.uid()
    )
  );

create policy "staff read order item options" on order_item_options
  for select using (is_staff());
create policy "customer reads own order item options" on order_item_options
  for select using (
    exists (
      select 1
      from order_items oi
      join orders o on o.id = oi.order_id
      where oi.id = order_item_options.order_item_id
        and o.user_id is not null
        and o.user_id = auth.uid()
    )
  );

create policy "staff read status events" on order_status_events
  for select using (is_staff());
create policy "customer reads own status events" on order_status_events
  for select using (
    exists (
      select 1 from orders o
      where o.id = order_status_events.order_id
        and o.user_id is not null
        and o.user_id = auth.uid()
    )
  );

create policy "staff read payments" on payments
  for select using (is_staff());
create policy "customer reads own payments" on payments
  for select using (
    exists (
      select 1 from orders o
      where o.id = payments.order_id
        and o.user_id is not null
        and o.user_id = auth.uid()
    )
  );

create policy "staff read pos sync" on pos_sync
  for select using (is_staff());

-- checkout_attempts has no policy on purpose. It is the idempotency ledger,
-- read and written only by place_order and the service-role client. A customer
-- who could read it could enumerate other customers' order ids.

-- ---------------------------------------------------------------------------
-- Accounts and trails.
-- ---------------------------------------------------------------------------

create policy "staff read profiles" on profiles
  for select using (is_staff() or id = auth.uid());
create policy "admin write profiles" on profiles
  for all using (is_admin()) with check (is_admin());
create policy "staff update own profile" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "customer reads own profile" on customer_profiles
  for select using (id = auth.uid());
create policy "customer creates own profile" on customer_profiles
  for insert with check (id = auth.uid());
create policy "customer updates own profile" on customer_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "admin manages invitations" on staff_invitations
  for all using (is_admin()) with check (is_admin());

create policy "staff reads own overrides" on staff_permission_overrides
  for select using (is_admin() or profile_id = auth.uid());
create policy "admin writes overrides" on staff_permission_overrides
  for all using (is_admin()) with check (is_admin());

-- notifications, push_subscriptions and push_subscription_orders carry no
-- policies. The send workers and the subscribe route use the service-role
-- client, and no browser session has any business reading a queue of other
-- people's phone numbers and endpoints.

create policy "admin reads audit log" on audit_logs
  for select using (is_admin());

-- ---------------------------------------------------------------------------
-- Settings, vouchers, leads.
-- ---------------------------------------------------------------------------

-- No anon policy, deliberately. The storefront reads get_public_settings().
create policy "staff read settings" on app_settings
  for select using (is_staff());
create policy "admin write settings" on app_settings
  for update using (is_admin()) with check (is_admin());

-- rate_limits has no policy. Only rate_limit_hit(), which is SECURITY DEFINER
-- and runs as the owner, and the service-role cleanup job touch it.

create policy "staff read vouchers" on vouchers
  for select using (is_staff());
create policy "admin write vouchers" on vouchers
  for all using (is_admin()) with check (is_admin());

-- A customer never selects from vouchers. They send a code and place_order
-- resolves the peso value, so an invalid code and an inactive one are
-- indistinguishable from the outside, and the code space cannot be scraped.
create policy "staff read redemptions" on voucher_redemptions
  for select using (is_staff());

create policy "staff read franchise inquiries" on franchise_inquiries
  for select using (is_staff());
create policy "admin updates franchise inquiries" on franchise_inquiries
  for update using (is_admin()) with check (is_admin());
