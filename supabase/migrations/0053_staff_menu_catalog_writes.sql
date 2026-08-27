-- 0053_staff_menu_catalog_writes.sql
-- Categories, option groups, options, ordering and deletes, as audited RPCs.
--
-- WHY RPCs AND NOT A FORM WRITING TABLES.
--
-- 0010 granted authenticated insert, update and delete on the menu tables on
-- the reasoning that owner tools are CRUD over those rows. 0022 took them all
-- back, because a direct write from a browser session leaves no audit row and
-- answers no permission question the database can see. Every write below
-- resolves current_staff_has_permission('menu:configure') and records what
-- changed. Do not re-grant those table privileges to bring a form back.
--
-- WHY SLUGS ARE MINTED HERE.
--
-- A slug is a URL a customer may have open, and it is what place_order matches
-- a cart line on. The client never sends one. A rename never changes one: the
-- save functions mint a slug on insert only, so renaming Chicken Wings to
-- Buffalo Wings does not 404 every link to it.
--
-- WHY EVERY AUDIT ROW HERE CARRIES A NULL BRANCH.
--
-- The catalog is one catalog for all nine branches, so a category or an option
-- belongs to no counter. 0023 already reads a null branch_id as business wide
-- rather than as unknown, which is the reading these rows want: a manager tied
-- to one site does not see them, and a business-wide manager does. The
-- per-counter menu decision is the hold in 0051, and that one is branch scoped.

-- ---------------------------------------------------------------------------
-- Slugs.
-- ---------------------------------------------------------------------------

-- The text to slug rule, in one place.
--
-- Accents are folded with translate rather than with unaccent, because
-- unaccent is an extension this project does not install and a menu with one
-- Creme Brulee on it does not justify adding one.
--
-- An empty result is possible: a name of nothing but punctuation slugifies to
-- the empty string, and an empty slug is a broken URL rather than a short one.
-- Such a name returns 'item', which menu_unique_slug then makes unique.
create or replace function menu_slugify(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(
    nullif(
      trim(both '-' from left(
        trim(both '-' from regexp_replace(
          translate(
            lower(coalesce(p_value, '')),
            'áàâäãåāéèêëēíìîïīóòôöõōúùûüūñç',
            'aaaaaaaeeeeeiiiiioooooouuuuunc'
          ),
          '[^a-z0-9]+', '-', 'g'
        )),
        70
      )),
      ''
    ),
    'item'
  )
$$;

comment on function menu_slugify(text) is
  'The one text to slug rule for the catalog. Internal: every caller is a '
  'SECURITY DEFINER function in this file.';

-- A slug that is free in p_table, preferring the clean one.
--
-- The clean slug is tried first and a suffix is appended only on collision,
-- because chicken-wings is a better storefront URL than chicken-wings-a1b2c3
-- and every seeded slug is clean. Ten attempts is not a real limit on a six
-- character suffix, it is the guard that turns an impossible loop into a
-- reported error rather than a hung request.
--
-- p_table is interpolated with %I and is never user input: every call site in
-- this file passes a literal.
create or replace function menu_unique_slug(p_table text, p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_base text := menu_slugify(p_name);
  v_candidate text;
  v_taken boolean;
begin
  v_candidate := v_base;

  for v_attempt in 1..10 loop
    execute format('select exists (select 1 from %I where slug = $1)', p_table)
      into v_taken
      using v_candidate;

    if not v_taken then
      return v_candidate;
    end if;

    v_candidate := left(v_base, 63) || '-'
      || substr(md5(gen_random_uuid()::text), 1, 6);
  end loop;

  raise exception 'SLUG_COLLISION' using errcode = 'P0001';
end;
$$;

comment on function menu_unique_slug(text, text) is
  'A free slug for a menu table, clean first and suffixed only on collision. '
  'Internal, and not usable for menu_options, whose slugs are unique within a '
  'group rather than across the table.';

-- ---------------------------------------------------------------------------
-- Categories.
-- ---------------------------------------------------------------------------

-- One call for both create and edit: a null p_id creates, an id edits.
--
-- sort_order on a new row is the current maximum plus ten rather than zero,
-- so a category added today lands at the bottom of the menu instead of tying
-- with the first one and sorting arbitrarily. The gap of ten is what
-- staff_reorder_menu writes too.
create or replace function staff_save_menu_category(
  p_id uuid,
  p_name text,
  p_blurb text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_blurb text := nullif(trim(coalesce(p_blurb, '')), '');
  v_active boolean := coalesce(p_is_active, true);
  v_row menu_categories%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(coalesce(v_blurb, '')) > 200 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into menu_categories (slug, name, blurb, sort_order, is_active)
    values (
      menu_unique_slug('menu_categories', v_name),
      v_name,
      v_blurb,
      coalesce((select max(sort_order) from menu_categories), 0) + 10,
      v_active
    )
    returning * into v_row;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.category.created', 'menu_categories', v_row.id::text,
      jsonb_build_object('after', jsonb_build_object(
        'slug', v_row.slug,
        'name', v_row.name,
        'blurb', v_row.blurb,
        'is_active', v_row.is_active
      )),
      null
    );
    return v_row.id;
  end if;

  select * into v_row from menu_categories where id = p_id for update;
  if not found then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := jsonb_build_object(
    'name', v_row.name, 'blurb', v_row.blurb, 'is_active', v_row.is_active
  );
  v_after := jsonb_build_object(
    'name', v_name, 'blurb', v_blurb, 'is_active', v_active
  );

  -- A no-op writes no audit row, matching staff_set_branch_accepting_orders.
  -- The slug is deliberately absent from both sides: it is not editable.
  if v_before = v_after then
    return v_row.id;
  end if;

  update menu_categories
     set name = v_name, blurb = v_blurb, is_active = v_active
   where id = p_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.category.updated', 'menu_categories', p_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    null
  );

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Option groups.
-- ---------------------------------------------------------------------------

create or replace function staff_save_menu_option_group(
  p_id uuid,
  p_name text,
  p_description text,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_active boolean := coalesce(p_is_active, true);
  v_row menu_option_groups%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(coalesce(v_description, '')) > 300 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into menu_option_groups (slug, name, description, sort_order, is_active)
    values (
      menu_unique_slug('menu_option_groups', v_name),
      v_name,
      v_description,
      coalesce((select max(sort_order) from menu_option_groups), 0) + 10,
      v_active
    )
    returning * into v_row;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.option_group.created', 'menu_option_groups', v_row.id::text,
      jsonb_build_object('after', jsonb_build_object(
        'slug', v_row.slug,
        'name', v_row.name,
        'description', v_row.description,
        'is_active', v_row.is_active
      )),
      null
    );
    return v_row.id;
  end if;

  select * into v_row from menu_option_groups where id = p_id for update;
  if not found then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := jsonb_build_object(
    'name', v_row.name, 'description', v_row.description, 'is_active', v_row.is_active
  );
  v_after := jsonb_build_object(
    'name', v_name, 'description', v_description, 'is_active', v_active
  );
  if v_before = v_after then
    return v_row.id;
  end if;

  update menu_option_groups
     set name = v_name, description = v_description, is_active = v_active
   where id = p_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.option_group.updated', 'menu_option_groups', p_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    null
  );

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Options.
-- ---------------------------------------------------------------------------

create or replace function staff_save_menu_option(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_description text,
  -- p_price_cents null is not a missing price and must never be coalesced to
  -- zero. It means this option is priced by the chosen variation, through
  -- menu_option_variation_prices. Every Level of Hotness row above "No heat"
  -- is null here on purpose. See 0003.
  p_price_cents bigint,
  p_heat_percent int,
  p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_description text := nullif(trim(coalesce(p_description, '')), '');
  v_active boolean := coalesce(p_is_active, true);
  v_row menu_options%rowtype;
  v_base text;
  v_candidate text;
  v_slug text;
  v_needs_slug boolean := false;
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_group_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(coalesce(v_description, '')) > 300 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_price_cents is not null
     and (p_price_cents < 0 or p_price_cents > 10000000) then
    raise exception 'PRICE_RANGE' using errcode = 'P0001';
  end if;
  if p_heat_percent is not null
     and (p_heat_percent < 0 or p_heat_percent > 100) then
    raise exception 'HEAT_RANGE' using errcode = 'P0001';
  end if;
  if not exists (select 1 from menu_option_groups where id = p_group_id) then
    raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_id is null then
    v_base := menu_slugify(v_name);
    v_needs_slug := true;
  else
    select * into v_row from menu_options where id = p_id for update;
    if not found then
      raise exception 'OPTION_NOT_FOUND' using errcode = 'P0001';
    end if;
    -- A rename keeps the slug. Only a move to another group can force a new
    -- one, and only when the group it lands in already has that slug.
    v_base := v_row.slug;
    v_slug := v_row.slug;
    v_needs_slug := v_row.group_id is distinct from p_group_id;
  end if;

  -- menu_unique_slug cannot serve this call site. menu_options is unique on
  -- (group_id, slug), not on slug alone, so classic-buffalo may exist once in
  -- Wing Flavour and again in Level of Hotness without a collision. The same
  -- clean-first rule, scoped to the group.
  if v_needs_slug then
    v_candidate := v_base;
    v_slug := null;

    for v_attempt in 1..10 loop
      if not exists (
        select 1 from menu_options
        where group_id = p_group_id and slug = v_candidate
      ) then
        v_slug := v_candidate;
        exit;
      end if;
      v_candidate := left(v_base, 63) || '-'
        || substr(md5(gen_random_uuid()::text), 1, 6);
    end loop;

    if v_slug is null then
      raise exception 'SLUG_COLLISION' using errcode = 'P0001';
    end if;
  end if;

  if p_id is null then
    insert into menu_options (
      group_id, slug, name, description, price_cents, heat_percent,
      sort_order, is_active
    )
    values (
      p_group_id, v_slug, v_name, v_description, p_price_cents, p_heat_percent,
      coalesce(
        (select max(sort_order) from menu_options where group_id = p_group_id),
        0
      ) + 10,
      v_active
    )
    returning * into v_row;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.option.created', 'menu_options', v_row.id::text,
      jsonb_build_object('after', jsonb_build_object(
        'group_id', v_row.group_id,
        'slug', v_row.slug,
        'name', v_row.name,
        'description', v_row.description,
        'price_cents', v_row.price_cents,
        'heat_percent', v_row.heat_percent,
        'is_active', v_row.is_active
      )),
      null
    );
    return v_row.id;
  end if;

  v_before := jsonb_build_object(
    'group_id', v_row.group_id,
    'slug', v_row.slug,
    'name', v_row.name,
    'description', v_row.description,
    'price_cents', v_row.price_cents,
    'heat_percent', v_row.heat_percent,
    'is_active', v_row.is_active
  );
  v_after := jsonb_build_object(
    'group_id', p_group_id,
    'slug', v_slug,
    'name', v_name,
    'description', v_description,
    'price_cents', p_price_cents,
    'heat_percent', p_heat_percent,
    'is_active', v_active
  );
  if v_before = v_after then
    return v_row.id;
  end if;

  update menu_options
     set group_id = p_group_id,
         slug = v_slug,
         name = v_name,
         description = v_description,
         price_cents = p_price_cents,
         heat_percent = p_heat_percent,
         is_active = v_active
   where id = p_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.option.updated', 'menu_options', p_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    null
  );

  return v_row.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The option image.
-- ---------------------------------------------------------------------------

-- All five columns are written together, because a URL without dimensions
-- renders a broken tile in the flavour grid the same way it does on a product
-- tile. Six parameters and not seven: menu_options has no image_treatment.
create or replace function staff_set_menu_option_image(
  p_option_id uuid,
  p_image_url text,
  p_width int,
  p_height int,
  p_blur_data_url text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row menu_options%rowtype;
  v_url text := nullif(trim(coalesce(p_image_url, '')), '');
  v_source text := nullif(trim(coalesce(p_source, '')), '');
  v_blur text := nullif(trim(coalesce(p_blur_data_url, '')), '');
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_option_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into v_row from menu_options where id = p_option_id for update;
  if not found then
    raise exception 'OPTION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_row.image_url is not distinct from v_url
     and v_row.image_width is not distinct from p_width
     and v_row.image_height is not distinct from p_height
     and v_row.image_blur_data_url is not distinct from v_blur
     and v_row.image_source is not distinct from v_source then
    return;
  end if;

  update menu_options
     set image_url = v_url,
         image_width = p_width,
         image_height = p_height,
         image_blur_data_url = v_blur,
         image_source = v_source
   where id = p_option_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.option.image_changed', 'menu_options', p_option_id::text,
    jsonb_build_object(
      'option_name', v_row.name,
      'before', jsonb_build_object('image_url', v_row.image_url),
      'after', jsonb_build_object(
        'image_url', v_url,
        'image_width', p_width,
        'image_height', p_height
      )
    ),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Ordering.
-- ---------------------------------------------------------------------------

-- The position in the array is the order, so the screen sends what it shows
-- and never computes a sort_order itself.
--
-- Four entities and not three. menu_option_groups carries its own sort_order
-- and the option screen lists groups in it, so leaving it out would ship an
-- order nobody could change.
--
-- The gaps of ten match what the save functions write for a new row.
create or replace function staff_reorder_menu(p_entity text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_table text := case p_entity
    when 'category' then 'menu_categories'
    when 'item' then 'menu_items'
    when 'option' then 'menu_options'
    when 'optionGroup' then 'menu_option_groups'
  end;
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_table is null or p_ids is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if array_length(p_ids, 1) is null then
    return;
  end if;

  -- One statement, so no reader inside this transaction sees half an order.
  execute format(
    'update %I t
        set sort_order = (o.ord * 10)::int
       from unnest($1::uuid[]) with ordinality as o(id, ord)
      where t.id = o.id',
    v_table
  ) using p_ids;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.reordered', v_table, null,
    jsonb_build_object('entity', p_entity, 'ids', to_jsonb(p_ids)),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Deletes.
-- ---------------------------------------------------------------------------

-- Each guard raises its own code, so the screen can say what is in the way
-- rather than "could not delete".
--
-- The deleted row's name goes into the diff. After the delete the id resolves
-- to nothing, and a trail of bare uuids is unreadable.
create or replace function staff_delete_menu_entity(p_entity text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text;
  v_slug text;
begin
  if not current_staff_has_permission('menu:configure') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_id is null
     or p_entity is null
     or p_entity not in ('category', 'item', 'option', 'optionGroup') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_entity = 'category' then
    select name, slug into v_name, v_slug
    from menu_categories where id = p_id for update;
    if not found then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
    end if;
    -- menu_items.category_id is ON DELETE RESTRICT, so this is the same answer
    -- the constraint would give, in a sentence a screen can print.
    if exists (select 1 from menu_items where category_id = p_id) then
      raise exception 'CATEGORY_HAS_ITEMS' using errcode = 'P0001';
    end if;

    delete from menu_categories where id = p_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.category.deleted', 'menu_categories', p_id::text,
      jsonb_build_object('name', v_name, 'slug', v_slug), null
    );

  elsif p_entity = 'item' then
    select name, slug into v_name, v_slug
    from menu_items where id = p_id for update;
    if not found then
      raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
    end if;
    -- order_items.item_id has no delete action, and neither does its
    -- variation_id. Checking item_id covers both: a line that names a
    -- variation of this item names the item as well.
    if exists (select 1 from order_items where item_id = p_id) then
      raise exception 'ITEM_IN_ORDERS' using errcode = 'P0001';
    end if;

    -- A cart is temporary data and must not block a delete the way an order
    -- does. cart_item_options cascades off cart_items. The variation clause is
    -- insurance: a line whose variation belongs to this item but whose item_id
    -- says otherwise would fail on the foreign key with no readable code.
    delete from cart_items
    where item_id = p_id
       or variation_id in (select id from item_variations where item_id = p_id);

    delete from menu_items where id = p_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.item.deleted', 'menu_items', p_id::text,
      jsonb_build_object('name', v_name, 'slug', v_slug), null
    );

  elsif p_entity = 'option' then
    select name, slug into v_name, v_slug
    from menu_options where id = p_id for update;
    if not found then
      raise exception 'OPTION_NOT_FOUND' using errcode = 'P0001';
    end if;
    if exists (select 1 from order_item_options where option_id = p_id) then
      raise exception 'OPTION_IN_ORDERS' using errcode = 'P0001';
    end if;

    delete from menu_options where id = p_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.option.deleted', 'menu_options', p_id::text,
      jsonb_build_object('name', v_name, 'slug', v_slug), null
    );

  else
    select name, slug into v_name, v_slug
    from menu_option_groups where id = p_id for update;
    if not found then
      raise exception 'GROUP_NOT_FOUND' using errcode = 'P0001';
    end if;
    -- The link first, because it is the one the manager can undo.
    if exists (select 1 from menu_item_option_groups where group_id = p_id) then
      raise exception 'GROUP_STILL_LINKED' using errcode = 'P0001';
    end if;
    -- Deleting the group cascades to its options, and an option a past order
    -- carries cannot go. Same code as the single option delete: the reason is
    -- the same one.
    if exists (
      select 1
      from order_item_options oio
      join menu_options o on o.id = oio.option_id
      where o.group_id = p_id
    ) then
      raise exception 'OPTION_IN_ORDERS' using errcode = 'P0001';
    end if;

    delete from menu_option_groups where id = p_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.option_group.deleted', 'menu_option_groups', p_id::text,
      jsonb_build_object('name', v_name, 'slug', v_slug), null
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, in the same migration that creates the functions, per 0010.
-- ---------------------------------------------------------------------------
--
-- The revoke names anon and authenticated and not only public, because
-- Supabase ships a default privilege granting execute to all three. A revoke
-- from public alone removes a privilege nobody held. See 0015.

revoke execute on function menu_slugify(text)
  from public, anon, authenticated;
revoke execute on function menu_unique_slug(text, text)
  from public, anon, authenticated;
revoke execute on function staff_save_menu_category(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function staff_save_menu_option_group(uuid, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function staff_save_menu_option(uuid, uuid, text, text, bigint, int, boolean)
  from public, anon, authenticated;
revoke execute on function staff_set_menu_option_image(uuid, text, int, int, text, text)
  from public, anon, authenticated;
revoke execute on function staff_reorder_menu(text, uuid[])
  from public, anon, authenticated;
revoke execute on function staff_delete_menu_entity(text, uuid)
  from public, anon, authenticated;

-- menu_slugify and menu_unique_slug are granted to nobody. Every caller above
-- is SECURITY DEFINER, so inside those functions the effective user is the
-- owner and the call succeeds without the caller holding execute on them.
grant execute on function staff_save_menu_category(uuid, text, text, boolean)
  to authenticated;
grant execute on function staff_save_menu_option_group(uuid, text, text, boolean)
  to authenticated;
grant execute on function staff_save_menu_option(uuid, uuid, text, text, bigint, int, boolean)
  to authenticated;
grant execute on function staff_set_menu_option_image(uuid, text, int, int, text, text)
  to authenticated;
grant execute on function staff_reorder_menu(text, uuid[]) to authenticated;
grant execute on function staff_delete_menu_entity(text, uuid) to authenticated;
