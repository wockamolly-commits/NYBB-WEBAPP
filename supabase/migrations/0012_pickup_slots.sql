-- 0012_pickup_slots.sql
-- The pickup slot reader: which windows a customer may choose, and how much
-- room is left in each. Spec section 10, N1.
--
-- Must land BEFORE the code that calls it. Unlike the menu there is no static
-- fallback here and there must never be one: a hardcoded window is a promise
-- about a kitchen nobody asked, and the honest answer while store_hours is
-- empty is "no windows, and here is why".
--
-- WHY THE WINDOWS ARE GENERATED ON READ.
--
-- pickup_slots rows are created when somebody actually books, not materialized
-- ahead. Materializing means a cron job, a horizon to keep topped up, and rows
-- that go stale the moment the owner edits opening hours. Generating on read
-- means the grid is always a function of current hours, and the only rows that
-- exist are the ones with a reservation against them.
--
-- WHY THIS CALLS branch_is_open_at RATHER THAN READING store_hours ITSELF.
--
-- 0002 says it plainly: that function is the one definition of "open", and
-- every surface reads hours through it. Re-deriving windows from store_hours
-- here would be a second definition, and the two would disagree the first time
-- somebody touched a midnight-crossing shift. So this walks the grid and asks
-- the same question the storefront copy and place_order ask. It costs two
-- calls per candidate window, which for an eight hour horizon at fifteen
-- minutes is 64 cheap index lookups on a page nobody loads in a loop. If that
-- ever matters, cache the answer, do not fork the definition.

-- ---------------------------------------------------------------------------
-- Which branch the picker is for.
-- ---------------------------------------------------------------------------
--
-- The same shape of problem as resolve_price_list_id, and deliberately NOT the
-- same answer. A menu with no branch still has to price itself, so that
-- function falls back to the only price list. A slot picker with no branch has
-- nothing to offer: hours belong to a branch, and inventing them is exactly
-- the guess spec section 28 forbids. So this returns null and the caller says
-- so out loud.
create or replace function resolve_pickup_branch_id(p_branch_slug text default null)
returns uuid
language sql
stable
set search_path = public
as $$
  select b.id
  from branches b
  where b.is_active
    and (p_branch_slug is null or b.slug = p_branch_slug)
  order by b.sort_order, b.slug
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- The reader.
-- ---------------------------------------------------------------------------
--
-- Returns one jsonb document, matching lib/slots/types.ts one for one, in the
-- same camelCase style as get_storefront_menu so both readers parse the same
-- way.
--
-- `unavailableReason` is the point of the whole return shape. An empty list on
-- its own is indistinguishable from a broken page, and today the list IS
-- empty: no branch is active and store_hours has no rows, because the pilot
-- branch and its real weekday hours are open questions 1 and 2 in spec section
-- 28. The screen has to be able to say which of those is true.
create or replace function get_pickup_slots(
  p_branch_slug text default null,
  p_at timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch branches%rowtype;
  v_branch_id uuid;
  v_horizon_hours int;
  v_accepting boolean;
  v_has_hours boolean;
  v_timezone text;
  v_local_now timestamp;
  v_day_start timestamp;
  v_earliest timestamptz;
  v_horizon_end timestamptz;
  v_step_seconds int;
  v_first_k int;
  v_last_k int;
  v_slots jsonb;
  v_reason text;
begin
  v_branch_id := resolve_pickup_branch_id(p_branch_slug);
  if v_branch_id is null then
    return jsonb_build_object(
      'branch', null,
      'generatedAt', p_at,
      'horizonHours', null,
      'slots', '[]'::jsonb,
      'unavailableReason', 'no_branch'
    );
  end if;

  select * into v_branch from branches where id = v_branch_id;

  select s.slot_horizon_hours, s.accepting_orders
    into v_horizon_hours, v_accepting
    from app_settings s
    where s.id = 1;

  -- No settings row is a broken install, not an open shop.
  v_horizon_hours := coalesce(v_horizon_hours, 8);
  v_accepting := coalesce(v_accepting, false);

  if not v_accepting or not v_branch.is_accepting_orders then
    v_reason := 'not_accepting';
  else
    select exists (
      select 1 from store_hours h
      where h.branch_id = v_branch_id and not h.is_closed
    ) into v_has_hours;

    if not v_has_hours then
      v_reason := 'no_hours';
    end if;
  end if;

  if v_reason is not null then
    return jsonb_build_object(
      'branch', jsonb_build_object(
        'slug', v_branch.slug,
        'name', v_branch.name,
        'shortName', v_branch.short_name,
        'timezone', v_branch.timezone,
        'slotMinutes', v_branch.pickup_slot_minutes,
        'prepMinutes', v_branch.prep_minutes_default
      ),
      'generatedAt', p_at,
      'horizonHours', v_horizon_hours,
      'slots', '[]'::jsonb,
      'unavailableReason', v_reason
    );
  end if;

  v_timezone := v_branch.timezone;
  v_step_seconds := v_branch.pickup_slot_minutes * 60;

  -- The first window a customer could actually collect from. Food has to be
  -- cooked before it is handed over, so the earliest window starts a full prep
  -- time from now, not now.
  v_earliest := p_at + make_interval(mins => v_branch.prep_minutes_default);
  v_horizon_end := p_at + make_interval(hours => v_horizon_hours);

  -- The grid is anchored to the branch's own local midnight, NOT to now.
  --
  -- This is load bearing. pickup_slots is unique on (branch_id, slot_start),
  -- and place_order books by that value, so two customers arriving a minute
  -- apart have to compute the same boundaries or they will book two rows for
  -- one window and the capacity check will never bind. Anchoring to midnight
  -- also means the windows read the way a person expects: 7:00, 7:15, 7:30,
  -- not 7:04 because that is when somebody happened to load the page.
  v_local_now := p_at at time zone v_timezone;
  v_day_start := date_trunc('day', v_local_now);

  v_first_k := ceil(
    extract(epoch from (v_earliest - (v_day_start at time zone v_timezone)))
    / v_step_seconds
  );
  -- Minus one, because the horizon bounds when a customer may collect, and
  -- collection happens across the whole window. An eight hour horizon read at
  -- noon ends with the window closing at 20:00, not one opening at 20:00 and
  -- running past it.
  v_last_k := floor(
    extract(epoch from (v_horizon_end - (v_day_start at time zone v_timezone)))
    / v_step_seconds
  ) - 1;

  select coalesce(jsonb_agg(candidate.slot order by candidate.starts_at), '[]'::jsonb)
    into v_slots
  from (
    select g.starts_at,
           jsonb_build_object(
             'startsAt', g.starts_at,
             'endsAt', g.ends_at,
             'capacity', coalesce(ps.capacity, v_branch.pickup_slot_capacity),
             'reserved', coalesce(ps.reserved, 0),
             'remaining', greatest(
               coalesce(ps.capacity, v_branch.pickup_slot_capacity)
                 - coalesce(ps.reserved, 0),
               0
             )
           ) as slot
    from (
      select
        (v_day_start + make_interval(secs => k * v_step_seconds))
          at time zone v_timezone as starts_at,
        (v_day_start + make_interval(secs => (k + 1) * v_step_seconds))
          at time zone v_timezone as ends_at
      from generate_series(v_first_k, greatest(v_last_k, v_first_k - 1)) as k
    ) g
    left join pickup_slots ps
      on ps.branch_id = v_branch_id and ps.slot_start = g.starts_at
    -- The whole window has to sit inside opening hours, not just its first
    -- minute. A shop closing at 22:00 must not offer 21:45 to 22:00 as a
    -- window it will still be staffed for at 21:59, so the end is tested one
    -- second before it, which is the last instant the customer could arrive.
    where branch_is_open_at(v_branch_id, g.starts_at)
      and branch_is_open_at(v_branch_id, g.ends_at - interval '1 second')
  ) candidate;

  if jsonb_array_length(v_slots) = 0 then
    -- Hours exist, but none of them land in the horizon. Shut now, open later.
    v_reason := 'closed_now';
  elsif not exists (
    select 1
    from jsonb_array_elements(v_slots) s
    where (s->>'remaining')::int > 0
  ) then
    v_reason := 'fully_booked';
  end if;

  return jsonb_build_object(
    'branch', jsonb_build_object(
      'slug', v_branch.slug,
      'name', v_branch.name,
      'shortName', v_branch.short_name,
      'timezone', v_branch.timezone,
      'slotMinutes', v_branch.pickup_slot_minutes,
      'prepMinutes', v_branch.prep_minutes_default
    ),
    'generatedAt', p_at,
    'horizonHours', v_horizon_hours,
    'slots', v_slots,
    'unavailableReason', v_reason
  );
end;
$$;

comment on function get_pickup_slots(text, timestamptz) is
  'Pickup windows for the next app_settings.slot_horizon_hours, generated on '
  'read from store_hours and branches.pickup_slot_minutes. Never invents a '
  'window: with no active branch or no opening hours it returns an empty list '
  'and a reason saying which.';

-- ---------------------------------------------------------------------------
-- Grants.
-- ---------------------------------------------------------------------------
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so a
-- SECURITY DEFINER function without this pair is callable by any anonymous
-- visitor with the definer's privileges. 0010 revoked the ones that existed
-- then; every function added after it carries its own revoke in the same
-- migration that creates it.
revoke execute on function
  resolve_pickup_branch_id(text),
  get_pickup_slots(text, timestamptz)
  from public;

-- The public read surface goes from four functions to five. This one exposes
-- opening times and remaining capacity, both of which a customer standing at
-- the counter can see anyway.
grant execute on function get_pickup_slots(text, timestamptz)
  to anon, authenticated;

-- resolve_pickup_branch_id stays server-side. It is a helper called from
-- inside a SECURITY DEFINER function, where the effective user is the owner,
-- and place_order will call it the same way.
