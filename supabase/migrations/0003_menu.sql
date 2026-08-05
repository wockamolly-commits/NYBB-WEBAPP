-- 0003_menu.sql
-- The catalog: categories, items, variations, reusable option groups, and the
-- two price-override tables that let a price list and a chosen variation both
-- influence what a line costs.
--
-- The shapes here match lib/catalog/types.ts one for one, on purpose. Phase 0
-- renders from that static file; Phase 1 renders from get_storefront_menu().
-- Swapping the two is a change of source, not a change of shape.

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  -- One line under the category header. A description, not marketing copy.
  blurb text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger menu_categories_set_updated_at
  before update on menu_categories
  for each row execute function set_updated_at();

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references menu_categories(id) on delete restrict,
  slug text unique not null,
  name text not null,
  -- The menu's own item code where one exists: BB1, H3.
  code text,
  description text,

  -- Written by scripts/ingest-legacy-images.ts. The path is a Storage object
  -- key under a randomUUID() prefix rather than a readable name: the image
  -- optimizer caches derivatives for a year keyed on the source path, so a
  -- re-crop under the same name is invisible in the browser. Same reason the
  -- Phase 0 derivatives under public/img carry a content hash.
  image_url text,
  image_width int,
  image_height int,
  image_blur_data_url text,
  image_treatment text check (
    image_treatment is null
    or image_treatment in ('lifestyle', 'cutout', 'transparent', 'scene', 'mark')
  ),
  -- Path inside the legacy archive, kept so a re-ingest can trace provenance
  -- and so an identification made by sight can be audited later.
  image_source text,

  -- A price on the live printed menu that had to be interpreted rather than
  -- read. Recorded against the row so it can be confirmed with the owner
  -- instead of quietly becoming fact. See the pasta and Smokey BBQ rows.
  pricing_note text,

  is_featured boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_idx on menu_items (category_id);
create index menu_items_active_idx on menu_items (is_active, sort_order);
create trigger menu_items_set_updated_at
  before update on menu_items
  for each row execute function set_updated_at();

create table item_variations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references menu_items(id) on delete cascade,
  slug text not null,
  -- "Half, 6 pieces", shown on the product page.
  label text not null,
  -- "HALF", shown on chips and on the kitchen ticket where space is tight.
  short_label text not null,
  -- The default list price. A price_lists row may override it through
  -- item_variation_prices below; see resolve_variation_price_cents().
  price_cents bigint not null check (price_cents >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (item_id, slug)
);
create index item_variations_item_idx on item_variations (item_id);

comment on table item_variations is
  'A single-price item still gets exactly one variation row. Keeping the shape '
  'uniform means the cart, the ticket and place_order never branch on whether '
  'an item has sizes.';

-- Reusable option groups, shared across items. The wing flavour group and the
-- Level of Hotness group are both defined once and linked to the wings item.
create table menu_option_groups (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger menu_option_groups_set_updated_at
  before update on menu_option_groups
  for each row execute function set_updated_at();

create table menu_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references menu_option_groups(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,

  -- The flat upcharge, and it is NULLABLE on purpose. Null means this option
  -- has no flat price at all and the price is a function of the chosen
  -- variation, carried in menu_option_variation_prices. Every Level of Hotness
  -- row above "No heat" is null here. Mirrors CatalogOption.priceCents in
  -- lib/catalog/types.ts, which is `number | null` for the same reason.
  price_cents bigint check (price_cents is null or price_cents >= 0),

  -- 0 to 100, drives the heat meter. Null for options that are not heat.
  heat_percent int check (
    heat_percent is null or (heat_percent between 0 and 100)
  ),

  -- Wing flavours carry their own photography and get their own grid.
  image_url text,
  image_width int,
  image_height int,
  image_blur_data_url text,
  image_source text,

  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, slug)
);
create index menu_options_group_idx on menu_options (group_id);
create trigger menu_options_set_updated_at
  before update on menu_options
  for each row execute function set_updated_at();

create table menu_item_option_groups (
  item_id uuid not null references menu_items(id) on delete cascade,
  group_id uuid not null references menu_option_groups(id) on delete cascade,
  is_required boolean not null default false,
  min_select int not null default 0 check (min_select >= 0),
  max_select int not null default 1 check (max_select > 0),
  sort_order int not null default 0,
  primary key (item_id, group_id),
  check (min_select <= max_select)
);

-- Per-price-list override of a variation's price.
create table item_variation_prices (
  id uuid primary key default gen_random_uuid(),
  variation_id uuid not null references item_variations(id) on delete cascade,
  price_list_id uuid not null references price_lists(id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (variation_id, price_list_id)
);
create index item_variation_prices_price_list_idx
  on item_variation_prices (price_list_id);
create trigger item_variation_prices_set_updated_at
  before update on item_variation_prices
  for each row execute function set_updated_at();

-- The table that exists because NYBB breaks the flat-delta option model.
--
-- The reference prices an add-on as one number on the option row. Here the
-- Level of Hotness costs PHP 30 on a HALF order of wings and PHP 40 on a FULL
-- one, and INSANE costs PHP 40 and PHP 60. The option price is a function of
-- the selected variation, so it needs a row per (option, variation, list).
create table menu_option_variation_prices (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references menu_options(id) on delete cascade,
  variation_id uuid not null references item_variations(id) on delete cascade,
  price_list_id uuid not null references price_lists(id) on delete cascade,
  price_cents bigint not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (option_id, variation_id, price_list_id)
);
create index menu_option_variation_prices_option_idx
  on menu_option_variation_prices (option_id);
create index menu_option_variation_prices_price_list_idx
  on menu_option_variation_prices (price_list_id);
create trigger menu_option_variation_prices_set_updated_at
  before update on menu_option_variation_prices
  for each row execute function set_updated_at();

-- What a variation costs on a given price list.
--
-- Resolution order: the price list override, then the variation's own price.
-- Returns null only when the variation does not exist, and callers must treat
-- null as a hard error rather than as free. A missing item price is a bug, not
-- a discount.
create or replace function resolve_variation_price_cents(
  p_variation_id uuid,
  p_price_list_id uuid
)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select ivp.price_cents
      from item_variation_prices ivp
      where ivp.variation_id = p_variation_id
        and ivp.price_list_id = p_price_list_id
    ),
    (
      select iv.price_cents
      from item_variations iv
      where iv.id = p_variation_id
    )
  )
$$;

-- What an option adds to a line, given the variation it is attached to and the
-- branch's price list.
--
-- The spec calls this the single most likely place for a pricing bug to hide.
-- It is the only definition of the rule, so place_order, get_storefront_menu
-- and the admin preview cannot drift from each other. Resolution order:
--
--   1. a (option, variation, price list) row, if one exists
--   2. the option's flat price_cents
--   3. free
--
-- Step 3 is reachable and correct: "No heat" and every wing flavour are free
-- choices, not missing prices. That is why this function returns 0 where
-- resolve_variation_price_cents returns null. All three paths get a unit test.
create or replace function resolve_option_price_cents(
  p_option_id uuid,
  p_variation_id uuid,
  p_price_list_id uuid
)
returns bigint
language sql
stable
set search_path = public
as $$
  select coalesce(
    (
      select movp.price_cents
      from menu_option_variation_prices movp
      where movp.option_id = p_option_id
        and movp.variation_id = p_variation_id
        and movp.price_list_id = p_price_list_id
    ),
    (
      select mo.price_cents
      from menu_options mo
      where mo.id = p_option_id
    ),
    0
  )
$$;
