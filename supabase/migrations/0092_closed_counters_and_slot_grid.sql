-- 0092: what a closed counter offers, and a slot grid that holds at midnight.
--
-- 1. get_pickup_slots offered windows while a branch was shut, as long as each
--    window fell inside opening hours. place_order refuses any order while the
--    branch is shut (branch_accepts_orders), so a customer at a counter that
--    opens at 10:00 could choose a 10:15 window at 9:30, fill in the form, and
--    be refused with STORE_CLOSED. Spec section 11 settles which of the two is
--    right: a closed store blocks placement and the UI shows the next opening
--    time. So the grid now agrees with place_order, and both readers report
--    when the branch next opens.
--
-- 2. The grid is anchored to local midnight, which only lines up from one day
--    to the next when the slot length divides 24 hours. A 25 minute slot gave
--    23:45, 00:10, ... before midnight and 00:25, 00:50, ... after it, so a
--    page loaded before midnight offered windows place_order no longer
--    recognised, and bookings either side of midnight overlapped without
--    sharing a capacity. Slot lengths must now divide 1440.

-- ---------------------------------------------------------------------------
-- The next moment a branch opens.
-- ---------------------------------------------------------------------------
--
-- Every opening is the opens_at of some weekday's row, so the candidates are
-- those times over the next eight local days, and the answer is the earliest
-- one after p_after. Eight rather than seven so that a branch whose only open
-- day is today, already past, still finds next week's.
create or replace function branch_next_open_at(
  p_branch_id uuid,
  p_after timestamptz default now()
)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select min(candidate.opens)
  from branches b
  cross join generate_series(0, 7) as d(offset_days)
  join store_hours h
    on h.branch_id = b.id
   and not h.is_closed
   and h.weekday = extract(dow from ((p_after at time zone b.timezone)::date + d.offset_days))::smallint
  cross join lateral (
    select (((p_after at time zone b.timezone)::date + d.offset_days) + h.opens_at)
      at time zone b.timezone as opens
  ) candidate
  where b.id = p_branch_id
    and b.is_active
    and candidate.opens > p_after
$$;

comment on function branch_next_open_at(uuid, timestamptz) is
  'The next instant after p_after at which the branch opens by its weekly '
  'hours, or null when it has none. Since 0092.';

revoke execute on function branch_next_open_at(uuid, timestamptz)
  from public, anon, authenticated;

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

  -- Shut at this minute: no windows at all, and the next opening instead.
  --
  -- Before 0092 the grid only checked that each window fell inside opening
  -- hours, so a branch opening in an hour offered its first windows now, while
  -- place_order refused the order with STORE_CLOSED (branch_accepts_orders
  -- requires the branch to be open at the moment of ordering). The customer
  -- filled in the whole form and was then told the branch "has closed since
  -- this page loaded". Spec section 11 is the rule: a closed store blocks
  -- placement, and the screen shows the next opening time.
  if not branch_is_open_at(v_branch_id, p_at) then
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
      'unavailableReason', 'closed_now',
      'opensAt', branch_next_open_at(v_branch_id, p_at)
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
    'unavailableReason', v_reason,
    'opensAt', case when v_reason = 'closed_now' then branch_next_open_at(v_branch_id, p_at) end
  );
end;
$$;

create or replace function get_orderable_branches(
  p_at timestamptz default now()
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'slug', b.slug,
        'name', b.name,
        'shortName', b.short_name,
        'format', b.format::text,
        'addressLine', b.address_line,
        'city', b.city,
        'phones', to_jsonb(b.phones),
        'timezone', b.timezone,
        'slotMinutes', b.pickup_slot_minutes,
        'prepMinutes', b.prep_minutes_default,
        -- The same gate place_order will apply. A picker that offered a branch
        -- this returns false for would be offering an order the transaction
        -- refuses.
        'acceptsOrdersNow', branch_accepts_orders(b.id, p_at),
        'isOpenNow', branch_is_open_at(b.id, p_at),
        -- Since 0092, so the store picker can say when a shut counter opens
        -- rather than only that it will.
        'opensAt', case
          when branch_is_open_at(b.id, p_at) then null
          else branch_next_open_at(b.id, p_at)
        end
      )
      order by b.sort_order, b.slug
    ),
    '[]'::jsonb
  )
  from branches b
  where b.is_active
$$;

-- NOT VALID: enforced on every write from now on, without failing this
-- migration over a row written before it. A branch saved with another length
-- keeps working as it did, and has to move to a valid one on its next edit.
alter table branches
  add constraint branches_slot_minutes_divide_day
  check (1440 % pickup_slot_minutes = 0) not valid;
