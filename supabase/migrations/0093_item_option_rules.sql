-- 0093: the selection rules on an item's option groups.
--
-- menu_item_option_groups carries min_select and max_select per link, and
-- place_order enforces them, but staff_save_menu_item only ever wrote the
-- group ids. A link it created took the column defaults, optional and at most
-- one choice, and no screen could change that. So unlinking and relinking
-- Wing Flavour on wings made flavour optional, and an add-ons group could never
-- allow more than one pick.
--
-- staff_save_menu_item gains p_option_rules, the rule per linked group, saved
-- in the same transaction and the same audit row as the rest of the item. A
-- new link with no rule sent starts from the rule its group already has on
-- other items.
--
-- The signature changes, so the old function is dropped rather than left as a
-- second overload PostgREST would have to choose between.

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
    ), '[]'::jsonb),
    -- Since 0093, so a change to a group's rule alone is a change the audit
    -- trail records rather than a save that looks like a no-op.
    'option_rules', coalesce((
      select jsonb_agg(
        jsonb_build_object('group_id', l.group_id, 'min_select', l.min_select, 'max_select', l.max_select)
        order by l.sort_order, l.group_id
      )
      from menu_item_option_groups l
      where l.item_id = i.id
    ), '[]'::jsonb)
  )
  from menu_items i
  where i.id = p_item_id
$$;

drop function if exists staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[]);

create function staff_save_menu_item(
  p_id uuid,
  p_category_id uuid,
  p_name text,
  p_code text,
  p_description text,
  p_is_featured boolean,
  p_is_active boolean,
  p_variations jsonb,
  p_option_group_ids uuid[],
  p_option_rules jsonb default null
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
      --
      -- item_id is in the where clause so this statement is correct read on
      -- its own. The VARIATION_NOT_ON_ITEM check above already refuses a
      -- foreign id, and this makes the update say so too.
      update item_variations
         set label = trim(v_row.element ->> 'label'),
             short_label = trim(v_row.element ->> 'shortLabel'),
             price_cents = trunc((v_row.element -> 'priceCents' #>> '{}')::numeric)::bigint,
             is_default = (v_row.element ->> 'isDefault')::boolean,
             is_active = (v_row.element ->> 'isActive')::boolean,
             sort_order = (v_row.position * 10)::int
       where id = (v_row.element ->> 'id')::uuid
         and item_id = v_item_id;
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

  -- Ruling R4, and the reason is at the top of 0054: a size the payload does
  -- not name comes off the menu, and its row stays for the orders that
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

  -- A new link starts from the rule its group already has on other items,
  -- the most common one, rather than from the column defaults (optional, at
  -- most one). Before 0093 the defaults were all a new link could get, and no
  -- screen could change them, so re-linking Wing Flavour to wings made the
  -- flavour optional and wings could be ordered without one. p_option_rules,
  -- below, then overrides whatever the editor sent explicitly.
  insert into menu_item_option_groups (item_id, group_id, sort_order, is_required, min_select, max_select)
  select v_item_id, o.group_id, (o.ord * 10)::int,
         coalesce(typical.min_select, 0) > 0,
         coalesce(typical.min_select, 0),
         coalesce(typical.max_select, 1)
  from unnest(v_groups) with ordinality as o(group_id, ord)
  left join lateral (
    select l.min_select, l.max_select
    from menu_item_option_groups l
    where l.group_id = o.group_id and l.item_id <> v_item_id
    group by l.min_select, l.max_select
    order by count(*) desc, l.min_select desc
    limit 1
  ) typical on true
  where not exists (
    select 1 from menu_item_option_groups l
    where l.item_id = v_item_id and l.group_id = o.group_id
  );

  -- The selection rule per linked group, as the editor shows it. Rules for a
  -- group that is not linked are ignored rather than refused: the link list is
  -- the authority on what is linked, and this only describes those links.
  if p_option_rules is not null then
    if jsonb_typeof(p_option_rules) <> 'array' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(p_option_rules) r
      where jsonb_typeof(r->'minSelect') <> 'number'
         or jsonb_typeof(r->'maxSelect') <> 'number'
         or (r->>'minSelect')::int < 0
         or (r->>'maxSelect')::int < 1
         or (r->>'maxSelect')::int > 20
         or (r->>'minSelect')::int > (r->>'maxSelect')::int
    ) then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;

    update menu_item_option_groups l
       set min_select = (r->>'minSelect')::int,
           max_select = (r->>'maxSelect')::int,
           is_required = (r->>'minSelect')::int > 0
      from jsonb_array_elements(p_option_rules) r
     where l.item_id = v_item_id
       and l.group_id::text = r->>'groupId';
  end if;

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

revoke execute on function staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[], jsonb)
  from public, anon, authenticated;
grant execute on function staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[], jsonb)
  to authenticated;
