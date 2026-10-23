-- 0083_staff_edit_branch_details.sql
-- Editing a branch's published details from the workspace.
--
-- 0025 made hours, prep time and pickup capacity editable, and 0082 the map
-- pin. What a customer reads first about a counter (its name, its address,
-- the numbers to call) could still only be changed by a migration, the way
-- 0028 renamed Central Bloc. This is that edit as an audited RPC.
--
-- WHO MAY.
--
-- settings:manage on a branch the caller works, the same rule as hours and
-- the pin. A manager tied to one counter may correct its phone number; adding
-- a branch stays business wide (0081), because a new branch is nobody's yet.
--
-- WHAT DOES NOT CHANGE: the slug. It is the storefront's key for a counter, in
-- the customer's store cookie and in every link, so renaming the shop must not
-- move it. The price list is not here either: changing which prices a counter
-- charges is a pricing decision, not a correction to its details.
--
-- The storefront now reads these fields from the database for every branch
-- (lib/branches/directory.ts), so an edit here reaches the Branches page,
-- the store picker and the order screens without a deploy.

-- ---------------------------------------------------------------------------
-- The reader.
-- ---------------------------------------------------------------------------

create or replace function staff_list_branch_details()
returns table (
  branch_id uuid,
  slug text,
  name text,
  short_name text,
  format text,
  address_line text,
  barangay text,
  city text,
  phones text[]
)
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
  select b.id, b.slug, b.name, b.short_name, b.format, b.address_line,
         b.barangay, b.city, b.phones
  from branches b
  where current_staff_can_access_branch(b.id)
  order by b.sort_order, b.short_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- The edit.
-- ---------------------------------------------------------------------------

-- The same rules as staff_create_branch (0081), restated rather than shared:
-- two functions of a dozen checks each are easier to read than one helper and
-- two callers, and the SQL tests pin both.
create or replace function staff_update_branch_details(
  p_branch_id uuid,
  p_name text,
  p_short_name text,
  p_format text,
  p_address_line text,
  p_barangay text,
  p_city text,
  p_phones text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
  v_name text := trim(coalesce(p_name, ''));
  v_short_name text := trim(coalesce(p_short_name, ''));
  v_address text := trim(coalesce(p_address_line, ''));
  v_barangay text := nullif(trim(coalesce(p_barangay, '')), '');
  v_city text := trim(coalesce(p_city, ''));
  v_phones text[];
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null
     or v_name = '' or v_short_name = '' or v_address = '' or v_city = ''
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

  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from branches
    where id <> p_branch_id and lower(short_name) = lower(v_short_name)
  ) then
    raise exception 'DUPLICATE_SHORT_NAME' using errcode = 'P0001';
  end if;

  v_before := jsonb_build_object(
    'name', v_branch.name,
    'short_name', v_branch.short_name,
    'format', v_branch.format,
    'address_line', v_branch.address_line,
    'barangay', v_branch.barangay,
    'city', v_branch.city,
    'phones', to_jsonb(v_branch.phones)
  );
  v_after := jsonb_build_object(
    'name', v_name,
    'short_name', v_short_name,
    'format', p_format,
    'address_line', v_address,
    'barangay', v_barangay,
    'city', v_city,
    'phones', to_jsonb(v_phones)
  );
  if v_before = v_after then
    return;
  end if;

  update branches set
    name = v_name,
    short_name = v_short_name,
    format = p_format,
    address_line = v_address,
    barangay = v_barangay,
    city = v_city,
    phones = v_phones
  where id = p_branch_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    'store.branch_details_changed',
    'branches',
    p_branch_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    p_branch_id
  );
end;
$$;

revoke execute on function staff_list_branch_details()
  from public, anon, authenticated;
revoke execute on function staff_update_branch_details(uuid, text, text, text, text, text, text, text[])
  from public, anon, authenticated;

grant execute on function staff_list_branch_details() to authenticated;
grant execute on function staff_update_branch_details(uuid, text, text, text, text, text, text, text[])
  to authenticated;
