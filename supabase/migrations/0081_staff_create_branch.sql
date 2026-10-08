-- 0081_staff_create_branch.sql
-- Adding a branch from the workspace, as an audited RPC.
--
-- Spec section 26 describes opening a new counter as: insert a branches row,
-- attach a price list, set hours, flip is_active. Every step after the first
-- already has a screen (0025). This is the first step, so the owner no longer
-- needs somebody with database access to open a shop.
--
-- WHY THE NEW ROW IS SHUT.
--
-- is_active and is_accepting_orders both start false, and no store_hours rows
-- are written, so branch_is_open_at() fails closed for it exactly as it does
-- for every counter nobody has configured. A branch appears on the storefront
-- only after somebody has set its hours and switched it on in Store settings,
-- then resumed it in Store availability. Creating a row is not opening a shop.
--
-- WHY IT IS BUSINESS WIDE.
--
-- A manager tied to one counter can configure that counter, but a new branch
-- is by definition not theirs, and current_staff_can_access_branch() would
-- hide it from them the moment it existed. The same expression 0025 uses for
-- business-wide intake, current_staff_can_access_branch(null), gates this.

-- ---------------------------------------------------------------------------
-- The price list reader.
-- ---------------------------------------------------------------------------

-- price_lists is readable under menu:view (0022), which is a menu permission,
-- not a settings one. The form that creates a branch has to name a list, so it
-- gets its own narrow reader rather than borrowing the menu grant.
create or replace function staff_list_price_lists()
returns table (id uuid, slug text, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  select p.id, p.slug, p.name
  from price_lists p
  order by p.created_at, p.name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The create.
-- ---------------------------------------------------------------------------

-- p_price_list_id may be null while the business has exactly one list, which
-- is the case today and is why the form does not ask. With two or more lists
-- a null is refused rather than resolved, because picking one silently would
-- give the new counter somebody else's prices.
--
-- The slug is derived from the short name and never shown on the form. It is
-- the storefront's key for a counter, so it is made unique here, by suffix,
-- rather than refused: the owner chose a name, not an identifier.
create or replace function staff_create_branch(
  p_name text,
  p_short_name text,
  p_format text,
  p_address_line text,
  p_barangay text,
  p_city text,
  p_phones text[],
  p_price_list_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_short_name text := trim(coalesce(p_short_name, ''));
  v_address text := trim(coalesce(p_address_line, ''));
  v_barangay text := nullif(trim(coalesce(p_barangay, '')), '');
  v_city text := trim(coalesce(p_city, ''));
  v_phones text[];
  v_price_list_id uuid := p_price_list_id;
  v_base_slug text;
  v_slug text;
  v_suffix int := 1;
  v_id uuid;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(null) then
    raise exception 'BUSINESS_WIDE_FORBIDDEN' using errcode = 'P0001';
  end if;

  if v_name = '' or v_short_name = '' or v_address = '' or v_city = ''
     or p_format is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if length(v_name) > 120
     or length(v_short_name) > 40
     or length(v_address) > 200
     or length(coalesce(v_barangay, '')) > 80
     or length(v_city) > 80 then
    raise exception 'FIELD_TOO_LONG' using errcode = 'P0001';
  end if;
  if p_format not in ('street', 'mall', 'food-hall', 'petrol', 'hospital', 'casino') then
    raise exception 'INVALID_FORMAT' using errcode = 'P0001';
  end if;

  -- Blank entries are dropped rather than stored, so a trailing comma on the
  -- form does not publish an empty phone number.
  select coalesce(array_agg(trim(p) order by ord), '{}')
    into v_phones
    from unnest(coalesce(p_phones, '{}')) with ordinality as t(p, ord)
    where trim(p) <> '';
  if cardinality(v_phones) > 4 then
    raise exception 'TOO_MANY_PHONES' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(v_phones) p where length(p) > 30) then
    raise exception 'FIELD_TOO_LONG' using errcode = 'P0001';
  end if;

  -- Two counters with the same short name are two chips nobody can tell
  -- apart, on the board, the ticket and the picker.
  if exists (
    select 1 from branches where lower(short_name) = lower(v_short_name)
  ) then
    raise exception 'DUPLICATE_SHORT_NAME' using errcode = 'P0001';
  end if;

  if v_price_list_id is null then
    if (select count(*) from price_lists) <> 1 then
      raise exception 'PRICE_LIST_REQUIRED' using errcode = 'P0001';
    end if;
    select id into v_price_list_id from price_lists;
  elsif not exists (select 1 from price_lists where id = v_price_list_id) then
    raise exception 'PRICE_LIST_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_short_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug = '' then
    v_base_slug := 'branch';
  end if;
  v_base_slug := left(v_base_slug, 48);
  v_slug := v_base_slug;
  while exists (select 1 from branches where slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix;
  end loop;

  insert into branches (
    slug, name, short_name, format, price_list_id,
    address_line, barangay, city, phones,
    is_active, is_accepting_orders, sort_order
  ) values (
    v_slug, v_name, v_short_name, p_format, v_price_list_id,
    v_address, v_barangay, v_city, v_phones,
    false, false,
    coalesce((select max(sort_order) from branches), 0) + 1
  )
  returning id into v_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    'store.branch_created',
    'branches',
    v_id::text,
    jsonb_build_object(
      'after', jsonb_build_object(
        'slug', v_slug,
        'name', v_name,
        'short_name', v_short_name,
        'format', p_format,
        'address_line', v_address,
        'barangay', v_barangay,
        'city', v_city,
        'phones', to_jsonb(v_phones),
        'price_list_id', v_price_list_id
      )
    ),
    v_id
  );

  return v_id;
end;
$$;

comment on function staff_create_branch(text, text, text, text, text, text, text[], uuid) is
  'Adds a branch switched off, with no hours, so it stays shut until it is '
  'configured in Store settings. Business-wide staff only, audited as '
  'store.branch_created.';

revoke execute on function staff_list_price_lists()
  from public, anon, authenticated;
revoke execute on function staff_create_branch(text, text, text, text, text, text, text[], uuid)
  from public, anon, authenticated;

grant execute on function staff_list_price_lists() to authenticated;
grant execute on function staff_create_branch(text, text, text, text, text, text, text[], uuid)
  to authenticated;
