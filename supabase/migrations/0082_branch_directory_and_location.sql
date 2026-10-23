-- 0082_branch_directory_and_location.sql
-- The public branch directory, and a workspace control for a branch's pin.
--
-- WHY THE DIRECTORY NEEDS ITS OWN READ.
--
-- The Branches page was built from the static catalog in lib/catalog, the nine
-- counters known at launch, plus whichever database rows get_orderable_branches
-- (0049) returns. That function returns live branches only, so a branch added
-- from the workspace (0081) was invisible on the Branches page until it was
-- switched on and taking orders. The catalog's own offline counters are listed
-- with a phone number, and a new real shop deserves the same.
--
-- Nothing here is private: name, address, phone numbers and the map pin are
-- what the page publishes. is_active is not returned, because the directory's
-- question is "which shops exist", and "which take orders" stays with 0049.
--
-- WHY THE PIN MOVES INTO THE DATABASE.
--
-- branches.lat and lng have existed since 0002 and nothing wrote them; the
-- confirmed pins live in lib/catalog/branches.ts, which only a deploy can
-- change. A branch added from the workspace has no catalog entry at all, so
-- its map fell back to a street address. The pin set here wins over the
-- catalog's wherever both exist, and clearing it falls back to the catalog.

-- ---------------------------------------------------------------------------
-- The directory.
-- ---------------------------------------------------------------------------

create or replace function get_branch_directory()
returns table (
  slug text,
  name text,
  short_name text,
  format text,
  address_line text,
  city text,
  phones text[],
  lat numeric,
  lng numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select b.slug, b.name, b.short_name, b.format, b.address_line, b.city,
         b.phones, b.lat, b.lng
  from branches b
  order by b.sort_order, b.short_name;
$$;

comment on function get_branch_directory() is
  'Every branch as the public Branches page lists it, with its pin. Readable '
  'by anon, because all of it is published. Whether a branch takes orders is '
  'get_orderable_branches(), not this.';

-- ---------------------------------------------------------------------------
-- The pin.
-- ---------------------------------------------------------------------------

-- Both null clears the pin. One null without the other is refused rather than
-- read as "clear", because half a coordinate is a form fault, not a choice.
--
-- The box is the Philippines with a margin. It exists for the slip that a
-- range check on -90..90 cannot see: latitude and longitude typed the wrong way
-- round, which is a valid point in the Indian Ocean. Every counter this
-- business has or plans is in Cebu.
create or replace function staff_set_branch_location(
  p_branch_id uuid,
  p_lat numeric,
  p_lng numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
  v_lat numeric(10, 7) := round(p_lat, 7);
  v_lng numeric(10, 7) := round(p_lng, 7);
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null or ((p_lat is null) <> (p_lng is null)) then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_lat is not null
     and (p_lat < 4.5 or p_lat > 21.5 or p_lng < 116 or p_lng > 127) then
    raise exception 'LOCATION_OUTSIDE_PHILIPPINES' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_branch.lat is not distinct from v_lat
     and v_branch.lng is not distinct from v_lng then
    return;
  end if;

  update branches set lat = v_lat, lng = v_lng where id = p_branch_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    case when v_lat is null
      then 'store.branch_location_cleared'
      else 'store.branch_location_changed'
    end,
    'branches',
    p_branch_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('lat', v_branch.lat, 'lng', v_branch.lng),
      'after', jsonb_build_object('lat', v_lat, 'lng', v_lng)
    ),
    p_branch_id
  );
end;
$$;

revoke execute on function get_branch_directory()
  from public, anon, authenticated;
revoke execute on function staff_set_branch_location(uuid, numeric, numeric)
  from public, anon, authenticated;

grant execute on function get_branch_directory() to anon, authenticated;
grant execute on function staff_set_branch_location(uuid, numeric, numeric)
  to authenticated;
