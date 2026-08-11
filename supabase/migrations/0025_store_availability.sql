-- 0025_store_availability.sql
-- The owner tools for store availability and hours, as audited RPCs.
--
-- WHY THIS IS A SET OF FUNCTIONS RATHER THAN TABLE WRITES.
--
-- 0010 granted authenticated insert, update and delete on branches, store_hours
-- and app_settings, on the reasoning that owner tools are CRUD over those rows.
-- 0022 took all three back, deliberately, because a direct write from a browser
-- session leaves no audit row and answers no permission question the database
-- can see. Every write below therefore goes through a SECURITY DEFINER function
-- that resolves the permission with current_staff_has_permission(), checks the
-- branch with current_staff_can_access_branch(), and records what changed.
-- Do not re-grant those table privileges to bring a form back in a hurry.
--
-- WHAT THIS DOES NOT DO: it seeds nothing.
--
-- Central Bloc's real weekday hours and the kitchen's genuine throughput per
-- fifteen minutes at peak are unanswered owner questions (spec section 28,
-- items 3 and 4). That blocks the values, not the editor. store_hours stays
-- empty here, so branch_is_open_at() keeps failing closed and a branch whose
-- hours nobody has confirmed stays shut. Staging carries a temporary 11:00 to
-- 22:00 schedule for checkout testing, entered by hand and authorized for that
-- purpose only. It is not a confirmed schedule, it must never be seeded, and
-- nothing here promotes it.
--
-- THERE IS STILL ONE DEFINITION OF OPEN.
--
-- branch_is_open_at() is it, per 0002. The reader below calls that function for
-- the live state rather than comparing times itself, exactly as
-- get_pickup_slots() does. Nothing in this file, and nothing on the screens it
-- serves, re-derives whether a shop is open from store_hours rows.

-- ---------------------------------------------------------------------------
-- The reader.
-- ---------------------------------------------------------------------------

-- One row per branch the caller may work, with its whole week attached.
--
-- Two permissions can read it because two screens need it: the shift screen
-- (/workspace/availability, store:availability) and the configuration screen
-- (/workspace/settings, settings:manage). Neither an opening time nor a slot
-- capacity is a secret; the storefront publishes the first and infers the
-- second. What is scoped is the same thing every operational read scopes by,
-- the caller's branch.
create or replace function staff_list_store_availability()
returns table (
  branch_id uuid,
  slug text,
  name text,
  short_name text,
  timezone text,
  is_active boolean,
  is_accepting_orders boolean,
  prep_minutes_default int,
  pickup_slot_minutes int,
  pickup_slot_capacity int,
  is_open_now boolean,
  accepts_orders_now boolean,
  hours jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  if not (
    current_staff_has_permission('store:availability')
    or current_staff_has_permission('settings:manage')
  ) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  select
    b.id,
    b.slug,
    b.name,
    b.short_name,
    b.timezone,
    b.is_active,
    b.is_accepting_orders,
    b.prep_minutes_default,
    b.pickup_slot_minutes,
    b.pickup_slot_capacity,
    branch_is_open_at(b.id, v_now),
    branch_accepts_orders(b.id, v_now),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'weekday', h.weekday,
            'is_closed', h.is_closed,
            'opens_at', to_char(h.opens_at, 'HH24:MI'),
            'closes_at', to_char(h.closes_at, 'HH24:MI')
          )
          order by h.weekday
        )
        from store_hours h
        where h.branch_id = b.id
      ),
      '[]'::jsonb
    )
  from branches b
  where current_staff_can_access_branch(b.id)
  order by b.sort_order, b.short_name;
end;
$$;

comment on function staff_list_store_availability() is
  'Branch availability for the workspace, scoped to the branches the caller '
  'works. is_open_now comes from branch_is_open_at() rather than from the '
  'hours rows beside it, so the screen and the checkout gate cannot disagree.';

-- ---------------------------------------------------------------------------
-- The shift switch.
-- ---------------------------------------------------------------------------

-- Pausing intake at one counter. This is the control somebody reaches for
-- mid-shift when the fryers are backed up, which is why it carries the
-- operational permission rather than the configuration one, and why it is one
-- switch on its own screen rather than a field inside a settings form.
--
-- A no-op writes no audit row. An entry saying a switch was set to the value
-- it already held describes nothing that happened, and a trail full of them is
-- harder to read than one without.
create or replace function staff_set_branch_accepting_orders(
  p_branch_id uuid,
  p_accepting boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
begin
  if not current_staff_has_permission('store:availability') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null or p_accepting is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_branch.is_accepting_orders = p_accepting then
    return p_accepting;
  end if;

  update branches set is_accepting_orders = p_accepting where id = p_branch_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    case when p_accepting
      then 'store.orders_resumed'
      else 'store.orders_paused'
    end,
    'branches',
    p_branch_id::text,
    jsonb_build_object(
      'before', jsonb_build_object('is_accepting_orders', v_branch.is_accepting_orders),
      'after', jsonb_build_object('is_accepting_orders', p_accepting)
    ),
    p_branch_id
  );

  return p_accepting;
end;
$$;

-- ---------------------------------------------------------------------------
-- The branch configuration.
-- ---------------------------------------------------------------------------

-- One form, one call, one audit row: whether the branch is live on the
-- platform at all, how long the kitchen needs, how wide a pickup window is and
-- how many orders fit in one.
--
-- The bounds are sanity rails rather than policy. They exist because a typed
-- zero or a mis-keyed 1500 in slot minutes is a shop that silently stops
-- offering pickup windows, and the table CHECKs would only catch the zero.
create or replace function staff_set_branch_settings(
  p_branch_id uuid,
  p_is_active boolean,
  p_prep_minutes int,
  p_slot_minutes int,
  p_slot_capacity int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null
     or p_is_active is null
     or p_prep_minutes is null
     or p_slot_minutes is null
     or p_slot_capacity is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_prep_minutes < 1 or p_prep_minutes > 240 then
    raise exception 'PREP_MINUTES_RANGE' using errcode = 'P0001';
  end if;
  if p_slot_minutes < 5 or p_slot_minutes > 120 then
    raise exception 'SLOT_MINUTES_RANGE' using errcode = 'P0001';
  end if;
  if p_slot_capacity < 1 or p_slot_capacity > 200 then
    raise exception 'SLOT_CAPACITY_RANGE' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := jsonb_build_object(
    'is_active', v_branch.is_active,
    'prep_minutes_default', v_branch.prep_minutes_default,
    'pickup_slot_minutes', v_branch.pickup_slot_minutes,
    'pickup_slot_capacity', v_branch.pickup_slot_capacity
  );
  v_after := jsonb_build_object(
    'is_active', p_is_active,
    'prep_minutes_default', p_prep_minutes,
    'pickup_slot_minutes', p_slot_minutes,
    'pickup_slot_capacity', p_slot_capacity
  );
  if v_before = v_after then
    return;
  end if;

  update branches set
    is_active = p_is_active,
    prep_minutes_default = p_prep_minutes,
    pickup_slot_minutes = p_slot_minutes,
    pickup_slot_capacity = p_slot_capacity
  where id = p_branch_id;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    'store.branch_settings_changed',
    'branches',
    p_branch_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    p_branch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The weekly schedule.
-- ---------------------------------------------------------------------------

-- The whole week arrives at once and replaces the whole week. Seven days
-- written one at a time would let a schedule sit half applied between two
-- requests, and the half that had landed would be answering customers.
--
-- An empty array is a legal argument and it means "no published hours", which
-- deletes every row and shuts the branch. That is not a hole in the validation,
-- it is the state this project starts in and has to be able to return to: the
-- alternative is an owner who can guess at hours but cannot take a guess back.
--
-- Times arrive as HH:MM strings and are checked with a regex before the cast.
-- Postgres has no cast that returns null instead of raising, so an unchecked
-- '25:00' would surface as a type error with no sentence the screen could put
-- in front of anybody.
create or replace function staff_set_store_hours(
  p_branch_id uuid,
  p_hours jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_branch branches%rowtype;
  v_entry jsonb;
  v_weekday int;
  v_is_closed boolean;
  v_opens text;
  v_closes text;
  v_seen int[] := '{}';
  v_before jsonb;
  v_after jsonb;
  v_written int := 0;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_branch_id is null
     or p_hours is null
     or jsonb_typeof(p_hours) <> 'array'
     or jsonb_array_length(p_hours) > 7 then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_branch from branches where id = p_branch_id for update;
  if not found then
    raise exception 'BRANCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', h.weekday,
        'is_closed', h.is_closed,
        'opens_at', to_char(h.opens_at, 'HH24:MI'),
        'closes_at', to_char(h.closes_at, 'HH24:MI')
      )
      order by h.weekday
    ),
    '[]'::jsonb
  )
  into v_before
  from store_hours h
  where h.branch_id = p_branch_id;

  for v_entry in select * from jsonb_array_elements(p_hours) loop
    if jsonb_typeof(v_entry) <> 'object'
       or jsonb_typeof(v_entry -> 'weekday') <> 'number' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;

    v_weekday := (v_entry ->> 'weekday')::int;
    if v_weekday < 0 or v_weekday > 6 then
      raise exception 'INVALID_WEEKDAY' using errcode = 'P0001';
    end if;
    if v_weekday = any(v_seen) then
      raise exception 'DUPLICATE_WEEKDAY' using errcode = 'P0001';
    end if;
    v_seen := v_seen || v_weekday;

    v_is_closed := coalesce((v_entry ->> 'is_closed')::boolean, false);
    v_opens := nullif(trim(coalesce(v_entry ->> 'opens_at', '')), '');
    v_closes := nullif(trim(coalesce(v_entry ->> 'closes_at', '')), '');

    if v_is_closed then
      v_opens := null;
      v_closes := null;
    else
      if v_opens is null or v_closes is null then
        raise exception 'WINDOW_INCOMPLETE' using errcode = 'P0001';
      end if;
      if v_opens !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
         or v_closes !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
        raise exception 'WINDOW_MALFORMED' using errcode = 'P0001';
      end if;
      -- 0002 rejects a window that opens and closes at the same minute rather
      -- than reading it as a 24-hour day. Say so here, where there is a screen
      -- to say it on, instead of surfacing the constraint name.
      if v_opens::time = v_closes::time then
        raise exception 'WINDOW_EMPTY' using errcode = 'P0001';
      end if;
    end if;

    insert into store_hours (branch_id, weekday, is_closed, opens_at, closes_at)
    values (
      p_branch_id,
      v_weekday::smallint,
      v_is_closed,
      v_opens::time,
      v_closes::time
    )
    on conflict (branch_id, weekday) do update set
      is_closed = excluded.is_closed,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at;
    v_written := v_written + 1;
  end loop;

  -- Any weekday absent from the payload is absent from the schedule. Upserting
  -- and then removing the leftovers, rather than deleting the week and writing
  -- it again, means no reader inside this transaction ever sees a branch with
  -- half a schedule.
  delete from store_hours
  where branch_id = p_branch_id
    and not (weekday = any(v_seen));

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', h.weekday,
        'is_closed', h.is_closed,
        'opens_at', to_char(h.opens_at, 'HH24:MI'),
        'closes_at', to_char(h.closes_at, 'HH24:MI')
      )
      order by h.weekday
    ),
    '[]'::jsonb
  )
  into v_after
  from store_hours h
  where h.branch_id = p_branch_id;

  if v_before = v_after then
    return v_written;
  end if;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    case when v_written = 0
      then 'store.hours_cleared'
      else 'store.hours_changed'
    end,
    'store_hours',
    p_branch_id::text,
    jsonb_build_object('before', v_before, 'after', v_after),
    p_branch_id
  );

  return v_written;
end;
$$;

-- ---------------------------------------------------------------------------
-- The business-wide settings.
-- ---------------------------------------------------------------------------

-- app_settings is the singleton of things that are genuinely global, and both
-- of these are: accepting_orders stops placement everywhere regardless of what
-- any branch says, and slot_horizon_hours bounds how far ahead every picker
-- offers windows.
--
-- The second check is current_staff_can_access_branch(null), which reads oddly
-- and is deliberate. That function is false for a profile tied to a site and
-- true for one that is not, so it is already the project's expression for
-- "business wide, not a counter". 0023 uses it to keep company audit rows away
-- from branch managers. Using the same expression here means a manager assigned
-- to Central Bloc cannot stop ordering at the other eight sites.
create or replace function staff_set_order_intake(
  p_accepting_orders boolean,
  p_slot_horizon_hours int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_settings app_settings%rowtype;
  v_before jsonb;
  v_after jsonb;
begin
  if not current_staff_has_permission('settings:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(null) then
    raise exception 'BUSINESS_WIDE_FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_accepting_orders is null or p_slot_horizon_hours is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_slot_horizon_hours < 1 or p_slot_horizon_hours > 168 then
    raise exception 'SLOT_HORIZON_RANGE' using errcode = 'P0001';
  end if;

  select * into v_settings from app_settings where id = 1 for update;
  if not found then
    raise exception 'SETTINGS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := jsonb_build_object(
    'accepting_orders', v_settings.accepting_orders,
    'slot_horizon_hours', v_settings.slot_horizon_hours
  );
  v_after := jsonb_build_object(
    'accepting_orders', p_accepting_orders,
    'slot_horizon_hours', p_slot_horizon_hours
  );
  if v_before = v_after then
    return;
  end if;

  update app_settings set
    accepting_orders = p_accepting_orders,
    slot_horizon_hours = p_slot_horizon_hours
  where id = 1;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    'store.order_intake_changed',
    'app_settings',
    '1',
    jsonb_build_object('before', v_before, 'after', v_after),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants.
--
-- Explicit even though 0022 already took back the Supabase default privilege
-- for future functions in this schema. A function shipped without its grant is
-- invisible to the client and reads as a routing bug; a function shipped with
-- the default one is callable by anonymous visitors. Stating both directions
-- costs four lines and removes the question.
-- ---------------------------------------------------------------------------

revoke execute on function staff_list_store_availability()
  from public, anon, authenticated;
revoke execute on function staff_set_branch_accepting_orders(uuid, boolean)
  from public, anon, authenticated;
revoke execute on function staff_set_branch_settings(uuid, boolean, int, int, int)
  from public, anon, authenticated;
revoke execute on function staff_set_store_hours(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function staff_set_order_intake(boolean, int)
  from public, anon, authenticated;

grant execute on function staff_list_store_availability() to authenticated;
grant execute on function staff_set_branch_accepting_orders(uuid, boolean)
  to authenticated;
grant execute on function staff_set_branch_settings(uuid, boolean, int, int, int)
  to authenticated;
grant execute on function staff_set_store_hours(uuid, jsonb) to authenticated;
grant execute on function staff_set_order_intake(boolean, int) to authenticated;
