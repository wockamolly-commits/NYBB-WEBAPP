-- 0004_cart.sql
-- Carts.
--
-- Two carts exist for two different lifetimes. `carts` is the guest cart keyed
-- by an opaque token, kept server-side so a checkout can be resumed on the
-- same device. `customer_carts` is the signed-in cart, one row per account,
-- which is what syncs between a customer's phone and laptop.
--
-- Neither is ever trusted for money. The client sends ids and quantities; the
-- price on the order comes from the database inside place_order. The
-- unit_price_cents columns here exist so the cart UI can render a total
-- without a round trip, and they are recomputed at checkout, never read.

create table carts (
  id uuid primary key default gen_random_uuid(),
  cart_token text unique not null,
  branch_id uuid references branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);
create index carts_expires_at_idx on carts (expires_at);
create trigger carts_set_updated_at
  before update on carts
  for each row execute function set_updated_at();

create table cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references carts(id) on delete cascade,
  item_id uuid not null references menu_items(id),
  variation_id uuid not null references item_variations(id),
  qty int not null check (qty > 0 and qty <= 50),
  -- Display only. See the file header.
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  notes text,
  created_at timestamptz not null default now()
);
create index cart_items_cart_idx on cart_items (cart_id);

-- Chosen options, one row each. A separate table rather than an array column
-- so the option foreign key is real and a deleted option cannot leave a
-- dangling uuid in a cart.
create table cart_item_options (
  cart_item_id uuid not null references cart_items(id) on delete cascade,
  option_id uuid not null references menu_options(id) on delete cascade,
  primary key (cart_item_id, option_id)
);

create table customer_carts (
  -- One cart per account. The primary key is the user id, so the sync path is
  -- a single upsert with no read-modify-write race between a customer's own
  -- devices.
  user_id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  lines jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),

  -- Shape guard. The client always sends an array; without this a malformed
  -- payload stores happily and only explodes later in the UI.
  constraint customer_carts_lines_is_array
    check (jsonb_typeof(lines) = 'array'),

  -- Abuse cap. A Server Action is reachable by direct POST, so a signed-in
  -- caller could otherwise park unbounded jsonb in this row. Fifty lines is
  -- far beyond any real pickup order; the UI caps a single line at 20.
  constraint customer_carts_lines_bounded
    check (jsonb_array_length(lines) <= 50)
);
create trigger customer_carts_set_updated_at
  before update on customer_carts
  for each row execute function set_updated_at();
