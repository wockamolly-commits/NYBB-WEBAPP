-- 0054_staff_menu_item_writes.sql
-- An item, its sizes and its option groups in one audited call, plus its
-- photograph and its per size option prices.
--
-- WHY ONE CALL AND NOT THREE.
--
-- The item row, its variations and its option group links are one editing
-- thought. Saved separately, an interrupted edit leaves a size with no price or
-- a required group with no options, and for a menu that means a customer sees
-- something the kitchen cannot sell. One transaction, one audit row.
--
-- WHY VARIATIONS ARE DEACTIVATED AND NOT DELETED.
--
-- order_items carries the variation id alongside its text snapshot. Removing a
-- row a past order points at either breaks the reference or quietly rewrites
-- what somebody was charged for. is_active = false takes a size off the menu
-- and leaves the receipt intact.
--
-- So staff_save_menu_item never deletes an item_variations row, not even one
-- the payload leaves out entirely (ruling R4). The screen expresses a removal
-- as is_active = false and keeps the row in the payload, and a payload that
-- has lost a row is a client bug rather than an instruction. Deactivating the
-- absent ones makes the two cases agree, and makes the worst outcome of that
-- bug a size that has to be switched back on rather than a size that is gone.
--
-- There is deliberately no VARIATION_IN_ORDERS raise here. With no delete path
-- it would be a branch that cannot fire. The destructive act it was written
-- for is deleting the item, which cascades to its variations, and
-- staff_delete_menu_entity in 0053 already stops that with ITEM_IN_ORDERS.
--
-- WHY THE PRICE LIST IS RESOLVED AND NOT PASSED.
--
-- This screen does not edit per list overrides (see the design, section 3.1),
-- so it may only write while there is exactly one list to write to. The honest
-- behaviour on the day a second list appears is to stop, not to write heat
-- prices to whichever list sorted first.
--
-- resolve_price_list_id(null) does not provide that guarantee on its own.
-- Reading 0011: with a null slug it returns the first active branch's list by
-- sort_order and only falls through to its own single-list rule when no branch
-- is active at all. That holds today, with every branch seeded inactive, and
-- stops holding the hour the pilot opens. So staff_set_option_variation_prices
-- counts the lists itself and raises MULTIPLE_PRICE_LISTS, which makes the
-- stated invariant real rather than incidental.

-- ---------------------------------------------------------------------------
-- Two internal helpers.
-- ---------------------------------------------------------------------------

-- A variation slug that is free on this item, preferring the clean one.
--
-- menu_unique_slug cannot serve this call site. It tests a table-wide unique
-- slug, and item_variations is unique on (item_id, slug): almost every item on
-- this menu has a REG, and the wings and the boneless wings both want a HALF.
-- Same clean-first rule as 0053, scoped to the item.
--
-- The slug comes from the short label and not from the label, because the
-- short label is the stable one. "HALF" gives half, where "Half, 6 pieces"
-- would give half-6-pieces and turn a change of portion count into a new URL.
create or replace function menu_variation_unique_slug(
  p_item_id uuid,
  p_short_label text
)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_base text := menu_slugify(p_short_label);
  v_candidate text := v_base;
begin
  for v_attempt in 1..10 loop
    if not exists (
      select 1 from item_variations
      where item_id = p_item_id and slug = v_candidate
    ) then
      return v_candidate;
    end if;
    v_candidate := left(v_base, 63) || '-'
      || substr(md5(gen_random_uuid()::text), 1, 6);
  end loop;

  raise exception 'SLUG_COLLISION' using errcode = 'P0001';
end;
$$;

comment on function menu_variation_unique_slug(uuid, text) is
  'A free variation slug within one item. Internal: its only caller is '
  'staff_save_menu_item.';

-- Everything one save can change, as one jsonb value.
--
-- Read once before the writes and once after, it answers both questions this
-- function has about a change: whether there was one at all, and what to put
-- in the audit diff. Reading the after state back from the tables rather than
-- rebuilding it from the payload is what makes the minted slugs and the
-- computed sort orders appear in the trail.
create or replace function menu_item_snapshot(p_item_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'category_id', i.category_id,
    'slug', i.slug,
    'name', i.name,
    'code', i.code,
    'description', i.description,
    'is_featured', i.is_featured,
    'is_active', i.is_active,
    'variations', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'slug', v.slug,
          'label', v.label,
          'short_label', v.short_label,
          'price_cents', v.price_cents,
          'is_default', v.is_default,
          'is_active', v.is_active,
          'sort_order', v.sort_order
        )
        order by v.sort_order, v.slug
      )
      from item_variations v
      where v.item_id = i.id
    ), '[]'::jsonb),
    'option_group_ids', coalesce((
      select jsonb_agg(l.group_id order by l.sort_order, l.group_id)
      from menu_item_option_groups l
      where l.item_id = i.id
    ), '[]'::jsonb)
  )
  from menu_items i
  where i.id = p_item_id
$$;

comment on function menu_item_snapshot(uuid) is
  'The item, its variations and its option group links as one value, for the '
  'no-op check and the audit diff. Internal.';

-- ---------------------------------------------------------------------------
-- The item, its sizes and its option groups.
-- ---------------------------------------------------------------------------

-- One call for both create and edit: a null p_id creates, an id edits.
--
-- p_variations is an array of
--   {"id": uuid or null, "label", "shortLabel", "priceCents", "isDefault",
--    "isActive"}
-- and the position in the array is the sort order, so the screen sends what it
-- shows and never computes a sort_order itself. Every element is checked
-- before anything is written, because the alternative is a cast error from
-- inside a loop that has already half saved the item, reported to the manager
-- as "invalid input syntax for type bigint".
--
-- The slug is minted on insert only, here as everywhere in the catalog. It is
-- a URL a customer may have open and it is what place_order matches a cart
-- line on, so renaming Chicken Wings to Buffalo Wings must not 404 every link
-- to it.
create or replace function staff_save_menu_item(
  p_id uuid,
  p_category_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_is_featured boolean,
  p_is_active boolean,
  p_variations jsonb,
  p_option_group_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_code text := nullif(trim(coalesce(p_code, '')), '');
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_featured boolean := coalesce(p_is_featured, false);
  v_active boolean := coalesce(p_is_active, true);
  v_created boolean := p_id is null;
  v_item_id uuid;
  v_groups uuid[];
  v_element jsonb;
  v_price numeric;
  v_kept uuid[] := array[]::uuid[];
  v_new_id uuid;
  v_row record;
  v_before jsonb;
  v_after jsonb;
  -- Anchored, so a value with a uuid buried in it is not read as one.
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- The item's own fields.
  if p_category_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- BB1, H3. A code is a handle on the printed menu, not a description.
  if length(coalesce(v_code, '')) > 16 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(coalesce(v_description, '')) > 500 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- The variations, element by element.
  if p_variations is null or jsonb_typeof(p_variations) <> 'array' then
    raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
  end if;
  -- An item with no size is an item with no price. Thirty is not a real menu,
  -- it is the number past which the payload is a bug rather than a menu.
  if jsonb_array_length(p_variations) < 1
     or jsonb_array_length(p_variations) > 30 then
    raise exception 'VARIATIONS_REQUIRED' using errcode = 'P0001';
  end if;

  for v_element in select value from jsonb_array_elements(p_variations) loop
    if coalesce(jsonb_typeof(v_element), 'absent') <> 'object' then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    -- coalesce, because jsonb_typeof of an absent key is null and a null
    -- comparison is not true. Without it a payload missing a key would fall
    -- through every check here and fail on the column's NOT NULL instead.
    if coalesce(jsonb_typeof(v_element -> 'label'), 'absent') <> 'string'
       or length(trim(v_element ->> 'label')) < 1
       or length(v_element ->> 'label') > 80 then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    if coalesce(jsonb_typeof(v_element -> 'shortLabel'), 'absent') <> 'string'
       or length(trim(v_element ->> 'shortLabel')) < 1
       or length(v_element ->> 'shortLabel') > 20 then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    if coalesce(jsonb_typeof(v_element -> 'priceCents'), 'absent') <> 'number' then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    v_price := (v_element -> 'priceCents' #>> '{}')::numeric;
    -- Centavos are whole. A price of 12.5 is a client that divided by
    -- something, and rounding it here would ship the guess.
    if v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    if coalesce(jsonb_typeof(v_element -> 'isDefault'), 'absent') <> 'boolean'
       or coalesce(jsonb_typeof(v_element -> 'isActive'), 'absent') <> 'boolean' then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
    -- An absent id and a null id both mean a new size. Anything else has to be
    -- a uuid before it reaches a cast.
    if coalesce(jsonb_typeof(v_element -> 'id'), 'null') <> 'null'
       and (jsonb_typeof(v_element -> 'id') <> 'string'
            or (v_element ->> 'id') !~ v_uuid_pattern) then
      raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
    end if;
  end loop;

  -- One id twice would have the second write silently win over the first.
  if exists (
    select 1
    from jsonb_array_elements(p_variations) e
    where jsonb_typeof(e.value -> 'id') = 'string'
    group by e.value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'INVALID_VARIATIONS' using errcode = 'P0001';
  end if;

  -- Exactly one default, and it has to be an active one: a default nobody can
  -- order is an item with no default at all, and the product page has to open
  -- on some size.
  if (
    select count(*)
    from jsonb_array_elements(p_variations) e
    where (e.value ->> 'isActive')::boolean
      and (e.value ->> 'isDefault')::boolean
  ) <> 1 then
    raise exception 'ONE_DEFAULT_REQUIRED' using errcode = 'P0001';
  end if;

  if not exists (select 1 from menu_categories where id = p_category_id) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A null array is a client bug, and reading it as "no groups" would unlink
  -- every option group on an item and leave a page nobody can order from. The
  -- empty array is the way to say none.
  if p_option_group_ids is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(g order by ord), array[]::uuid[])
    into v_groups
  from (
    select distinct on (g) g, ord
    from unnest(p_option_group_ids) with ordinality as u(g, ord)
    order by g, ord
  ) deduped;
  if exists (
    select 1
    from unnest(v_groups) g
    where not exists (select 1 from menu_option_groups where id = g)
  ) then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- The item row.
  if v_created then
    -- sort_order on a new row is the current maximum plus ten rather than
    -- zero, so a new item lands at the bottom of its menu instead of tying
    -- with the first one. The gap of ten is what staff_reorder_menu writes.
    insert into menu_items (
      category_id, slug, name, code, description,
      is_featured, is_active, sort_order
    )
    values (
      p_category_id,
      menu_unique_slug('menu_items', v_name),
      v_name, v_code, v_description, v_featured, v_active,
      coalesce((select max(sort_order) from menu_items), 0) + 10
    )
    returning id into v_item_id;
  else
    select id into v_item_id from menu_items where id = p_id for update;
    if not found then
      raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
    end if;

    v_before := menu_item_snapshot(v_item_id);

    update menu_items
       set category_id = p_category_id,
           name = v_name,
           code = v_code,
           description = v_description,
           is_featured = v_featured,
           is_active = v_active
     where id = v_item_id;
  end if;

  -- A sent id has to belong to this item. Checked against the database rather
  -- than against the payload, because the payload is what is in doubt: an id
  -- from another item would otherwise move that item's size onto this one.
  -- On a create there is nothing it could belong to, so any id fails here.
  if exists (
    select 1
    from jsonb_array_elements(p_variations) e
    where jsonb_typeof(e.value -> 'id') = 'string'
      and not exists (
        select 1 from item_variations v
        where v.id = (e.value ->> 'id')::uuid and v.item_id = v_item_id
      )
  ) then
    raise exception 'VARIATION_NOT_ON_ITEM' using errcode = 'P0001';
  end if;

  for v_row in
    select e.value as element, e.ordinality as position
    from jsonb_array_elements(p_variations) with ordinality as e(value, ordinality)
    order by e.ordinality
  loop
    if jsonb_typeof(v_row.element -> 'id') = 'string' then
      -- The slug is not in this list. A size keeps the slug it was minted
      -- with, the same way an item and a category do.
      update item_variations
         set label = trim(v_row.element ->> 'label'),
             short_label = trim(v_row.element ->> 'shortLabel'),
             price_cents = trunc((v_row.element -> 'priceCents' #>> '{}')::numeric)::bigint,
             is_default = (v_row.element ->> 'isDefault')::boolean,
             is_active = (v_row.element ->> 'isActive')::boolean,
             sort_order = (v_row.position * 10)::int
       where id = (v_row.element ->> 'id')::uuid;
      v_kept := v_kept || (v_row.element ->> 'id')::uuid;
    else
      insert into item_variations (
        item_id, slug, label, short_label, price_cents,
        is_default, is_active, sort_order
      )
      values (
        v_item_id,
        menu_variation_unique_slug(v_item_id, trim(v_row.element ->> 'shortLabel')),
        trim(v_row.element ->> 'label'),
        trim(v_row.element ->> 'shortLabel'),
        trunc((v_row.element -> 'priceCents' #>> '{}')::numeric)::bigint,
        (v_row.element ->> 'isDefault')::boolean,
        (v_row.element ->> 'isActive')::boolean,
        (v_row.position * 10)::int
      )
      returning id into v_new_id;
      v_kept := v_kept || v_new_id;
    end if;
  end loop;

  -- Ruling R4, and the reason is at the top of this file: a size the payload
  -- does not name comes off the menu, and its row stays for the orders that
  -- reference it. No delete, on any path.
  update item_variations
     set is_active = false
   where item_id = v_item_id
     and not (id = any(v_kept))
     and is_active;

  -- The links. Deleted and inserted rather than replaced wholesale, because
  -- is_required, min_select and max_select are not on this screen and
  -- re-inserting a link that stays would reset them to the column defaults,
  -- turning a required flavour choice into an optional one.
  delete from menu_item_option_groups
   where item_id = v_item_id and not (group_id = any(v_groups));

  update menu_item_option_groups l
     set sort_order = (o.ord * 10)::int
    from unnest(v_groups) with ordinality as o(group_id, ord)
   where l.item_id = v_item_id and l.group_id = o.group_id;

  insert into menu_item_option_groups (item_id, group_id, sort_order)
  select v_item_id, o.group_id, (o.ord * 10)::int
  from unnest(v_groups) with ordinality as o(group_id, ord)
  where not exists (
    select 1 from menu_item_option_groups l
    where l.item_id = v_item_id and l.group_id = o.group_id
  );

  v_after := menu_item_snapshot(v_item_id);

  -- A no-op writes no audit row, matching staff_save_menu_category. The writes
  -- above have already run and have written the same values back, which costs
  -- an updated_at and nothing else.
  if not v_created and v_before is not distinct from v_after then
    return v_item_id;
  end if;

  -- One row for the whole save. The item, its sizes and its links changed
  -- together, so a reader of the trail should see them together.
  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    case when v_created then 'menu.item.created' else 'menu.item.updated' end,
    'menu_items',
    v_item_id::text,
    case
      when v_created then jsonb_build_object('after', v_after)
      else jsonb_build_object('before', v_before, 'after', v_after)
    end,
    null
  );

  return v_item_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The item image.
-- ---------------------------------------------------------------------------

-- All six columns are written together, and a url may not arrive without its
-- dimensions (ruling R20). lib/menu/storefront.ts only treats a remote image
-- as usable when the src, the width, the height and the blur placeholder are
-- all present; short of that it falls back to the local derivative keyed on
-- image_source, and with neither it renders an empty tile. A url with no size
-- is therefore not a partial save to be completed later, it is a tile the
-- storefront cannot draw.
--
-- staff_set_menu_option_image in 0053 writes the same five columns for an
-- option and does not carry this guard. That asymmetry is not deliberate, and
-- whoever reconciles the two should add it there rather than remove it here.
create or replace function staff_set_menu_item_image(
  p_item_id uuid,
  p_image_url text,
  p_width int,
  p_height int,
  p_blur_data_url text,
  p_treatment text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row menu_items%rowtype;
  v_url text := nullif(trim(coalesce(p_image_url, '')), '');
  v_blur text := nullif(trim(coalesce(p_blur_data_url, '')), '');
  v_treatment text := nullif(trim(coalesce(p_treatment, '')), '');
  v_source text := nullif(trim(coalesce(p_source, '')), '');
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_item_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if v_url is not null
     and (p_width is null or p_height is null or p_width < 1 or p_height < 1) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- Checked here so the answer is a code the screen can print rather than the
  -- CHECK constraint's own message. The list is the one in 0003.
  if v_treatment is not null
     and v_treatment not in ('lifestyle', 'cutout', 'transparent', 'scene', 'mark') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into v_row from menu_items where id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_row.image_url is not distinct from v_url
     and v_row.image_width is not distinct from p_width
     and v_row.image_height is not distinct from p_height
     and v_row.image_blur_data_url is not distinct from v_blur
     and v_row.image_treatment is not distinct from v_treatment
     and v_row.image_source is not distinct from v_source then
    return;
  end if;

  update menu_items
     set image_url = v_url,
         image_width = p_width,
         image_height = p_height,
         image_blur_data_url = v_blur,
         image_treatment = v_treatment,
         image_source = v_source
   where id = p_item_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.image_changed', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_row.name,
      'before', jsonb_build_object('image_url', v_row.image_url),
      'after', jsonb_build_object(
        'image_url', v_url,
        'image_width', p_width,
        'image_height', p_height,
        'image_treatment', v_treatment
      )
    ),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Per size option prices.
-- ---------------------------------------------------------------------------

-- The table that exists because the Level of Hotness costs PHP 30 on a HALF
-- and PHP 40 on a FULL. p_prices is an object keyed by variation id:
--
--   { "b1f2...": 3000, "c3d4...": 4000 }
--
-- A variation the object leaves out, and one it sends as null, both have their
-- row deleted, so clearing a price is expressible. Zero is not that: zero is a
-- real price meaning this heat level is free on this size, and it is stored.
-- Deleting instead would fall through to the option's own price_cents, which
-- for every heat level above "No heat" is null, and null there means "ask the
-- variation", which is the row that was just deleted.
create or replace function staff_set_option_variation_prices(
  p_item_id uuid,
  p_option_id uuid,
  p_prices jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_item_name text;
  v_option_name text;
  v_price_list_id uuid;
  v_pair record;
  v_price numeric;
  v_before jsonb;
  v_after jsonb;
  v_uuid_pattern constant text :=
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_item_id is null or p_option_id is null
     or p_prices is null or jsonb_typeof(p_prices) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- This screen does not edit per price list overrides (design section 3.1),
  -- so it may only write while there is exactly one list to write to.
  -- resolve_price_list_id() does not provide that guarantee: with a null slug
  -- it returns the first active branch's list and only falls through to the
  -- single-list rule when no branch is active at all, so it would quietly pick
  -- a list rather than stop. Checking here makes the stated invariant real.
  if (select count(*) from price_lists) > 1 then
    raise exception 'MULTIPLE_PRICE_LISTS' using errcode = 'P0001';
  end if;

  -- The item row is not written, and it is locked anyway: it is the thing two
  -- managers editing the same item's heat prices have in common, so it is what
  -- makes them take turns.
  select name into v_item_name from menu_items where id = p_item_id for update;
  if not found then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  select name into v_option_name from menu_options where id = p_option_id;
  if not found then
    raise exception 'OPTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Every pairing is checked before any of them is written, so a bad key at
  -- the end of the object does not leave the ones before it applied.
  for v_pair in select key, value from jsonb_each(p_prices) loop
    if v_pair.key !~ v_uuid_pattern then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
    if not exists (
      select 1 from item_variations
      where id = v_pair.key::uuid and item_id = p_item_id
    ) then
      raise exception 'VARIATION_NOT_ON_ITEM' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_pair.value) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_pair.value) <> 'number' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
    v_price := (v_pair.value #>> '{}')::numeric;
    if v_price <> trunc(v_price) or v_price < 0 or v_price > 10000000 then
      raise exception 'PRICE_RANGE' using errcode = 'P0001';
    end if;
  end loop;

  v_price_list_id := resolve_price_list_id(null);

  select coalesce(jsonb_object_agg(v.slug, p.price_cents), '{}'::jsonb)
    into v_before
  from menu_option_variation_prices p
  join item_variations v on v.id = p.variation_id
  where p.option_id = p_option_id
    and p.price_list_id = v_price_list_id
    and v.item_id = p_item_id;

  -- Scoped to this item's variations, so setting the heat prices for the wings
  -- does not clear the same option's prices on another item that carries it.
  delete from menu_option_variation_prices p
  using item_variations v
  where p.option_id = p_option_id
    and p.price_list_id = v_price_list_id
    and v.id = p.variation_id
    and v.item_id = p_item_id
    and coalesce(jsonb_typeof(p_prices -> p.variation_id::text), 'null') = 'null';

  insert into menu_option_variation_prices
    (option_id, variation_id, price_list_id, price_cents)
  select
    p_option_id,
    e.key::uuid,
    v_price_list_id,
    trunc((e.value #>> '{}')::numeric)::bigint
  from jsonb_each(p_prices) e
  where jsonb_typeof(e.value) = 'number'
  on conflict (option_id, variation_id, price_list_id)
  do update set price_cents = excluded.price_cents;

  select coalesce(jsonb_object_agg(v.slug, p.price_cents), '{}'::jsonb)
    into v_after
  from menu_option_variation_prices p
  join item_variations v on v.id = p.variation_id
  where p.option_id = p_option_id
    and p.price_list_id = v_price_list_id
    and v.item_id = p_item_id;

  if v_before is not distinct from v_after then
    return;
  end if;

  -- Keyed by slug rather than by variation id, because the trail is read by a
  -- person and "half" answers the question that a uuid only restates.
  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.option_prices_set', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_item_name,
      'option_id', p_option_id,
      'option_name', v_option_name,
      'price_list_id', v_price_list_id,
      'before', v_before,
      'after', v_after
    ),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, in the same migration that creates the functions, per 0010.
-- ---------------------------------------------------------------------------
--
-- The revoke names anon and authenticated and not only public, because
-- Supabase ships a default privilege granting execute to all three. A revoke
-- from public alone removes a privilege nobody held. See 0015.

revoke execute on function menu_variation_unique_slug(uuid, text)
  from public, anon, authenticated;
revoke execute on function menu_item_snapshot(uuid)
  from public, anon, authenticated;
revoke execute on function staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[])
  from public, anon, authenticated;
revoke execute on function staff_set_menu_item_image(uuid, text, int, int, text, text, text)
  from public, anon, authenticated;
revoke execute on function staff_set_option_variation_prices(uuid, uuid, jsonb)
  from public, anon, authenticated;

-- The two helpers are granted to nobody, as menu_slugify and menu_unique_slug
-- are in 0053. Their only callers are SECURITY DEFINER functions in this file,
-- so inside those the effective user is the owner and the call succeeds
-- without the caller holding execute on them.
grant execute on function staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[])
  to authenticated;
grant execute on function staff_set_menu_item_image(uuid, text, int, int, text, text, text)
  to authenticated;
grant execute on function staff_set_option_variation_prices(uuid, uuid, jsonb)
  to authenticated;
