-- 0056_menu_management_corrections.sql
-- Corrections to the menu management migrations, as a new file.
--
-- WHY THESE ARE NOT EDITS TO 0051 THROUGH 0055.
--
-- 0051 through 0055 were applied to the live nybb-staging database on
-- 2026-08-27, on the owner's instruction. A migration that has run somewhere
-- is never edited, so every correction below lands here instead. Each one is
-- a recreation of a function whose body is otherwise copied verbatim from the
-- migration that first created it, with only the named change made, so the
-- diff a reviewer has to check is one clause at a time.
--
-- WHAT EACH CORRECTION FIXES.
--
-- 1. staff_set_menu_option_image (from 0053) gains the dimension guard its
--    sibling staff_set_menu_item_image already carries (0054). The standing
--    defence was that the workspace client always sends all five columns.
--    That is a client-side argument for a database guard whose whole point is
--    that the client is not the only caller: the function is granted to
--    authenticated and reachable directly at POST /rest/v1/rpc/... with any
--    manager's own token. 0054's own comment says whoever reconciles the two
--    should add it here rather than remove it there.
--
-- 2. staff_save_menu_item (from 0054) gains "and item_id = v_item_id" on its
--    update of item_variations. The statement was already safe, but only by
--    reference to the VARIATION_NOT_ON_ITEM check thirty lines above it. Now
--    it is locally correct on its own.
--
-- 3. staff_set_menu_item_hold (from 0051) stores a null unavailable_until for
--    an indefinite hold rather than whatever the caller sent alongside it.
--    menu_item_is_available ignores that column for an indefinite hold, so
--    this was stray data rather than a bug, but a future reader looking at
--    the row would draw the wrong conclusion from it.
--
-- 4. 0055's bucket row is re-asserted with its limits applied on conflict
--    instead of skipped. 0055 used "on conflict (id) do nothing", so in any
--    environment where scripts/ingest-legacy-images.ts created menu-images
--    first, neither the 2 MB ceiling nor the image/webp list would ever have
--    taken effect. Staging was checked by hand after 0055 was applied and
--    already carries both (public, file_size_limit 2097152, allowed_mime_types
--    ["image/webp"]), so the bucket did not pre-exist there. This makes the
--    intended settings hold wherever the two run in the other order.
--
-- 5. staff_reorder_menu loses its execute grant. It is built, audited and
--    tested, and no TypeScript in the repository calls it, because no screen
--    on this branch has a sort-order control. The function and its tests stay
--    exactly where they are, deliberately, for the screen that will call it.
--    Until that screen exists the write surface should be the nine functions
--    something actually reaches.
--
-- 6. The audit read policy admits a null branch_id to anyone holding
--    audit:view. The owner's answer, 2026-08-27, to the question the review
--    raised: a manager assigned to one counter holds menu:configure with no
--    branch scope at all, changes every price at all nine counters, and then
--    could not see one of those changes in the audit log, including their own,
--    because every catalog audit row carries a null branch and
--    staff_can_access_branch reads 'mango-avenue' = null as NULL rather than
--    true. See the block above section 6 below for what else this admits.
--
-- WHY THERE ARE NO GRANTS BELOW EXCEPT THE REVOKE.
--
-- Every signature here is byte-identical to the one in the migration that
-- created it. create or replace preserves existing privileges only when the
-- signature is unchanged; a changed one silently mints a second overload
-- carrying Supabase's default execute to public. So the grants from 0051,
-- 0053 and 0054 carry through untouched, and nothing needs re-granting.

-- ---------------------------------------------------------------------------
-- 1. The option image, with the dimension guard.
-- ---------------------------------------------------------------------------

-- Body copied from 0053, with the ruling R20 guard from 0054 added and
-- nothing else changed. A url without its dimensions renders a broken tile in
-- the flavour grid the same way it does on a product tile, which is what this
-- function's own header said and then did not check.
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
  if v_url is not null
     and (p_width is null or p_height is null or p_width < 1 or p_height < 1) then
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
-- 2. The item save, with the variation update scoped to the item.
-- ---------------------------------------------------------------------------

-- Body copied from 0054, with "and item_id = v_item_id" added to the
-- item_variations update and nothing else changed.
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
-- 3. The hold, with no end date stored on an indefinite one.
-- ---------------------------------------------------------------------------

-- Body copied from 0051, with one declared value added and used in the three
-- places the end date is written or compared. Nothing else changed.
--
-- v_until is what gets stored, and it is null for an indefinite hold whatever
-- the caller sent. menu_item_is_available never looks at unavailable_until
-- for kind = 'indefinite', so a value there changed no behaviour; it was a row
-- that read as if it expired when it does not. The no-op comparison and the
-- audit diff use v_until too, so the trail and the row agree.
create or replace function staff_set_menu_item_hold(
  p_item_id uuid,
  p_branch_id uuid,
  p_kind text,
  p_unavailable_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_existing menu_item_branch_holds%rowtype;
  v_item_name text;
  v_until timestamptz := case
    when p_kind = 'indefinite' then null
    else p_unavailable_until
  end;
begin
  if not current_staff_has_permission('menu:availability') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_item_id is null or p_branch_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_kind is not null and p_kind not in ('today', 'until', 'indefinite') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select name into v_item_name from menu_items where id = p_item_id;
  if v_item_name is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A timed hold with no end would be an indefinite one wearing the wrong
  -- label, and one that has already passed is available the instant it is set.
  -- Both are data entry slips, so refuse rather than guess which was meant.
  if p_kind in ('today', 'until') then
    if p_unavailable_until is null then
      raise exception 'HOLD_NEEDS_AN_END' using errcode = 'P0001';
    end if;
    if p_unavailable_until <= v_now then
      raise exception 'HOLD_END_IN_PAST' using errcode = 'P0001';
    end if;
  end if;

  select * into v_existing
  from menu_item_branch_holds
  where item_id = p_item_id and branch_id = p_branch_id
  for update;

  if p_kind is null then
    if not found then
      return;
    end if;
    delete from menu_item_branch_holds
    where item_id = p_item_id and branch_id = p_branch_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.item.released', 'menu_items', p_item_id::text,
      jsonb_build_object(
        'item_name', v_item_name,
        'before', jsonb_build_object(
          'kind', v_existing.kind,
          'unavailable_until', v_existing.unavailable_until
        )
      ),
      p_branch_id
    );
    return;
  end if;

  -- A no-op writes no audit row, matching staff_set_branch_accepting_orders.
  if found
     and v_existing.kind = p_kind
     and v_existing.unavailable_until is not distinct from v_until then
    return;
  end if;

  insert into menu_item_branch_holds
    (item_id, branch_id, kind, unavailable_until, created_by)
  values
    (p_item_id, p_branch_id, p_kind, v_until, v_actor_id)
  on conflict (item_id, branch_id) do update
    set kind = excluded.kind,
        unavailable_until = excluded.unavailable_until,
        created_by = excluded.created_by;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.held', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_item_name,
      'before', case when v_existing.item_id is null then null else jsonb_build_object(
        'kind', v_existing.kind,
        'unavailable_until', v_existing.unavailable_until
      ) end,
      'after', jsonb_build_object(
        'kind', p_kind,
        'unavailable_until', v_until
      )
    ),
    p_branch_id
  );
end;
$$;

-- Any indefinite hold already written by the old body carries an end date the
-- availability rule ignores. Clearing it makes the stored rows say what the
-- function now writes. The hold_has_an_end check allows a null here precisely
-- because kind is 'indefinite', so this cannot fail on the constraint.
--
-- The matching audit_logs rows are deliberately left alone. An audit row is a
-- record of what was submitted at the time, and rewriting one to look tidier
-- is the opposite of what the trail is for.
update menu_item_branch_holds
   set unavailable_until = null
 where kind = 'indefinite'
   and unavailable_until is not null;

-- ---------------------------------------------------------------------------
-- 4. The bucket limits, applied whether or not the bucket already existed.
-- ---------------------------------------------------------------------------

-- 0055 argued at length for the 2 MB ceiling and the single mime type as the
-- thing standing between a menu:configure session and arbitrary bytes of any
-- type in a public bucket, then wrote "on conflict (id) do nothing", which
-- drops both silently wherever scripts/ingest-legacy-images.ts created the
-- bucket first (it asks for 5MB and no type list). Staging was verified by
-- hand after 0055 ran and already carries the intended settings, so this is
-- not a live correction there; it is what makes the next environment match.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0056 skipped the bucket limits: no storage schema in this database';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('menu-images', 'menu-images', true, 2097152, array['image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. staff_reorder_menu stops being callable until something calls it.
-- ---------------------------------------------------------------------------

-- The function stays, and so do its four SQL tests. It is the right shape for
-- the reorder controls the list screens will grow, it takes an ordered array
-- so the screen sends what it shows, and rebuilding it later from a deleted
-- file would be pure waste. What it does not have today is a caller: no
-- TypeScript in the repository names it and no screen has a sort-order
-- control, so the grant exposed a function nothing could reach. Restoring it
-- is one line in the migration that ships the screen.
--
-- anon and public are named alongside authenticated for the same reason 0051
-- gives: Supabase's default privileges grant execute to all three, and a
-- revoke from public alone removes a privilege nobody held.
revoke execute on function staff_reorder_menu(text, uuid[])
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. A business wide audit row is readable by anyone holding audit:view.
-- ---------------------------------------------------------------------------

-- THE PROBLEM THIS ANSWERS.
--
-- current_staff_has_permission gives menu:configure to manager with no branch
-- scope at all (0050). Every catalog write RPC in 0053 and 0054 writes a null
-- branch_id, because one catalog serves all nine counters and 0023 already
-- reads a null branch as business wide. The read policy from 0023 is
-- audit:view and current_staff_can_access_branch(branch_id), and that resolves
-- to "p.branch_id is null or p.branch_id = p_branch_id" (0037). For a manager
-- assigned to a counter and a row with no branch that is 'mango-avenue' = null,
-- which is NULL, which is not true, so the row is filtered out. Meanwhile
-- staff_set_menu_item_hold writes a real branch_id, so the same person sees
-- their own "marked sold out" rows and not their own "changed the price"
-- rows. That reads as a bug to the person using it.
--
-- The owner's ruling, 2026-08-27: a null branch_id already means business
-- wide by 0023's own definition, and business wide records are not one site's
-- secret. So admit them, and close the asymmetry from the price side rather
-- than by making holds business wide. Holds keep their real branch and a
-- branch manager keeps seeing only their own counter's, which is unchanged.
--
-- WHAT ELSE THIS ADMITS, ENUMERATED FROM THE MIGRATIONS RATHER THAN ASSUMED.
--
-- The policy cannot tell a deliberately business wide row from an accidentally
-- unscoped one, so every action that writes a null branch_id is in scope. All
-- of them, found by reading every insert into audit_logs in every migration
-- (both the bare and the public-qualified spelling) and checking against the
-- audit_logs_set_branch trigger, which fills a branch only when target_table
-- is 'orders':
--
--   a. Sixteen menu.* catalog actions, from 0053, 0054 and this file. The
--      target. menu.item.held and menu.item.released are not among them: they
--      carry a real branch and are unaffected.
--   b. store.order_intake_changed (0025), explicitly null because pausing
--      intake is business wide. A branch manager seeing why their own counter
--      stopped taking orders is an improvement.
--   c. workspace.kitchen_role_retired (0050), a one off migration event.
--   d. workspace.access_granted, access_reactivated, access_revoked,
--      role_changed and access_confirmed (0050, superseding 0019), and
--      staff.super_admin_bootstrapped and
--      staff.super_admin_revoked_by_configuration (0022). All seven target
--      'profiles' and none supplies a branch_id, so all seven are null.
--
-- Group (d) was not part of the question as it was put, and it is the part to
-- look at before this is applied. Those diffs carry to_jsonb(profiles_row),
-- and profiles has a phone column (0007). 0023's own comment says it scoped
-- the profiles read policy precisely so that "the same widening that let a
-- manager read another site's trail also let them read another site's staff,
-- phone numbers included" could not happen. This policy does not touch the
-- profiles policy, so the actor name beside such a row still will not resolve
-- for a branch manager, but the diff inside the row would carry another
-- counter's staff record. If that is not wanted, the narrower form is to add
-- "and target_table <> 'profiles'" to the null arm, and that is the owner's
-- call to make, not this migration's.
--
-- Everything genuinely per counter already carries a real branch and is
-- untouched: store.hours_changed, store.hours_cleared,
-- store.branch_settings_changed, every refund.* and every order.*.
--
-- audit:view is manager and admin only in 0050's permission lists, never
-- cashier, so this changes what a manager sees and nothing at all about what
-- a cashier sees.
--
-- Restated whole rather than altered, because a policy has no alter that can
-- add a disjunct. The permission half is unchanged from 0023.
drop policy if exists "authorized staff read audit log" on audit_logs;
create policy "authorized staff read audit log" on audit_logs
  for select using (
    current_staff_has_permission('audit:view')
    and (branch_id is null or current_staff_can_access_branch(branch_id))
  );
