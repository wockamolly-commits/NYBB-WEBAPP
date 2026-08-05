-- 0005_orders.sql
-- Pickup slots and orders.
--
-- The pickup slot is the load-bearing idea in this platform. A free-text
-- "what time will you collect it" is a promise nobody checks; a slot with a
-- capacity is a promise the kitchen can keep.

create table pickup_slots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  slot_start timestamptz not null,
  capacity int not null check (capacity > 0),
  reserved int not null default 0 check (reserved >= 0),
  created_at timestamptz not null default now(),
  unique (branch_id, slot_start),
  -- The throttle, enforced by the database rather than by the caller.
  -- place_order increments reserved in the same transaction as the order
  -- insert, so two customers racing for the last 7:00pm slot cannot both win:
  -- the loser's UPDATE violates this constraint and its transaction rolls
  -- back. A cancelled, rejected or no-show order decrements it again.
  constraint pickup_slots_within_capacity check (reserved <= capacity)
);
create index pickup_slots_branch_start_idx on pickup_slots (branch_id, slot_start);

comment on table pickup_slots is
  'Rows are created on demand as customers pick windows, not materialized far '
  'ahead. Slot boundaries come from store_hours plus branches.pickup_slot_'
  'minutes, and capacity is copied from branches.pickup_slot_capacity at '
  'creation so that raising the branch default does not retroactively oversell '
  'a window the kitchen already planned around.';

create table orders (
  id uuid primary key default gen_random_uuid(),

  -- The quotable handle. Not a secret: see generate_short_code in 0001.
  short_code text unique not null,
  -- The secret. Guest order tracking requires this, because a short code that
  -- is easy to read aloud is by construction easy to guess, and the order
  -- carries a customer's name and phone number.
  tracking_token uuid not null default gen_random_uuid(),

  status order_status not null default 'pending',

  -- Pinned. Keeping the column costs one byte and means that adding dine-in
  -- later is a constraint change rather than a migration of every order row.
  service_mode service_mode not null default 'pickup'
    check (service_mode = 'pickup'),

  branch_id uuid not null references branches(id) on delete restrict,
  -- Snapshotted from the branch at placement. Without it, repointing a branch
  -- at a new price list silently rewrites the history of what was charged.
  price_list_id uuid not null references price_lists(id) on delete restrict,

  pickup_slot_id uuid references pickup_slots(id) on delete set null,
  -- The four-digit counter handoff code. Distinct from short_code: this one is
  -- checked at the counter to prove the collector is the customer.
  pickup_code text not null check (pickup_code ~ '^[0-9]{4}$'),

  -- Null for guests. Set from auth.uid() when the customer is signed in.
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  customer_email text,

  subtotal_cents bigint not null default 0 check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  total_cents bigint not null default 0 check (total_cents >= 0),

  notes text,

  -- Excluded from every money figure in analytics. Staff test orders during
  -- setup are real rows and must not distort the first week's numbers.
  is_test boolean not null default false,

  -- Lifecycle timestamps. accepted/preparing/ready/claimed are also the
  -- prep-time telemetry (spec section 10, N7): actual duration per item mix is
  -- derived from these, which is how the ETA stops being a static guess.
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  claimed_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  cancelled_at timestamptz,
  cancelled_reason text,
  -- Set by the customer's "I'm here" button on the tracking page.
  customer_arrived_at timestamptz,
  -- Set by the no-show sweep after the configured window.
  no_show_at timestamptz,

  accepted_by_profile_id uuid,
  claimed_by_profile_id uuid,

  updated_at timestamptz not null default now()
);
create unique index orders_tracking_token_key on orders (tracking_token);
create index orders_status_placed_idx on orders (status, placed_at desc);
create index orders_branch_status_idx on orders (branch_id, status, placed_at desc);
create index orders_pickup_slot_idx on orders (pickup_slot_id);
create index orders_user_idx on orders (user_id, placed_at desc);
create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- A four-digit code has ten thousand values, so it cannot be globally unique
-- and does not need to be. It only has to be unambiguous among the orders a
-- single counter is holding at one moment, which this partial index
-- guarantees. The status list is the ACTIVE set from spec section 12.
create unique index orders_active_pickup_code_key
  on orders (branch_id, pickup_code)
  where status in ('pending', 'accepted', 'preparing', 'ready');

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  item_id uuid not null references menu_items(id),
  variation_id uuid not null references item_variations(id),
  -- Snapshots. A ticket, a receipt and an analytics row must keep saying what
  -- was actually sold after the menu is renamed or repriced.
  item_name_snapshot text not null,
  variation_label_snapshot text not null,
  -- The variation price plus the resolved option prices, per unit.
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  qty int not null check (qty > 0 and qty <= 50),
  line_total_cents bigint not null check (line_total_cents >= 0),
  notes text
);
create index order_items_order_idx on order_items (order_id);

create table order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  option_id uuid not null references menu_options(id),
  group_name_snapshot text not null,
  name_snapshot text not null,
  -- What this option actually added, after resolve_option_price_cents. Stored
  -- rather than recomputed, because the answer depends on a price list and a
  -- variation that may both change later.
  price_cents bigint not null default 0 check (price_cents >= 0),
  -- Carried onto the kitchen ticket so the heat level is visible without a
  -- lookup. Null for options that are not heat.
  heat_percent_snapshot int
);
create index order_item_options_order_item_idx
  on order_item_options (order_item_id);

-- Every transition writes one row here, including the initial placement.
-- Status changes happen only inside the staff RPCs, never as a bare table
-- update, so this trail cannot be bypassed.
create table order_status_events (
  id bigserial primary key,
  order_id uuid not null references orders(id) on delete cascade,
  from_status order_status,
  to_status order_status not null,
  actor_profile_id uuid,
  reason text,
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx
  on order_status_events (order_id, created_at);
