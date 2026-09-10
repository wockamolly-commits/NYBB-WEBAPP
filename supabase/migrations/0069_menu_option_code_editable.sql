-- 0069_menu_option_code_editable.sql
-- Let the owner type a flavour's code, the way every other menu field is typed.
--
-- 0068 put the ten numbers NY1 to NY10 on menu_options.code and nothing else
-- could touch them afterwards: staff_save_menu_option lists its columns
-- explicitly and code was not among them, so the workspace could not set one
-- and an eleventh flavour would have been stuck without a number until
-- somebody wrote another migration.
--
-- The existing ten were never at risk. A column absent from an UPDATE's SET
-- list is left alone, which is why this is a gap and not a bug.
--
-- BLANK IS NULL, NOT EMPTY STRING.
-- ---------------------------------------------------------------------------
-- `nullif(trim(...), '')`, the same as 0054 gives an item's code. An empty
-- box means "this flavour has no number on the printed menu". Storing '' for
-- that would put an empty badge above the flavour name on the storefront,
-- because '' is a value and the tile only checks whether one is present.
--
-- The signature gains an argument, so the old seven-argument form is dropped
-- rather than left callable beside the new one: two overloads differing only
-- by an added text parameter is how a caller silently keeps using the old one.

drop function if exists staff_save_menu_option(uuid, uuid, text, text, bigint, int, boolean);

create or replace function staff_save_menu_option(
  p_id uuid,
  p_group_id uuid,
  p_name text,
  p_code text,
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
  -- Blank means "this flavour has no number", which is null. An empty string
  -- would be a code that renders as an empty badge. Same treatment, and the
  -- same reason, as staff_save_menu_item gives p_code in 0054.
  v_code text := nullif(trim(coalesce(p_code, '')), '');
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
  -- NY1, NY10. A code is a handle on the printed menu, not a description.
  if length(coalesce(v_code, '')) > 16 then
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
      group_id, slug, name, code, description, price_cents, heat_percent,
      sort_order, is_active
    )
    values (
      p_group_id, v_slug, v_name, v_code, v_description, p_price_cents, p_heat_percent,
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
        'code', v_row.code,
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
    'code', v_row.code,
    'description', v_row.description,
    'price_cents', v_row.price_cents,
    'heat_percent', v_row.heat_percent,
    'is_active', v_row.is_active
  );
  v_after := jsonb_build_object(
    'group_id', p_group_id,
    'slug', v_slug,
    'name', v_name,
    'code', v_code,
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
         code = v_code,
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
revoke execute on function staff_save_menu_option(uuid, uuid, text, text, text, bigint, int, boolean)
  from public, anon;
grant execute on function staff_save_menu_option(uuid, uuid, text, text, text, bigint, int, boolean)
  to authenticated;

comment on function staff_save_menu_option(uuid, uuid, text, text, text, bigint, int, boolean) is
  'Creates or updates one option behind the menu:configure permission, audited. '
  'p_code is the printed menu''s number for the option (NY1 to NY10 on the wing '
  'flavours); blank arrives as null, meaning the option has no number.';
