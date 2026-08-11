-- 0026_twenty_four_hour_store_hours.sql
-- Represent owner-confirmed 24-hour schedules without a one-minute closure.
--
-- This migration must land after 0025. Central Bloc's 24/7 confirmation exposed
-- that equal times had been treated as an input mistake, making the data model
-- capable only of a 23:59 approximation. Equality now has one unambiguous
-- meaning for an open day: it is open continuously until the same time on the
-- next day. Closed days remain explicit through is_closed.

alter table store_hours
  drop constraint if exists store_hours_window_not_empty;

comment on table store_hours is
  'Weekly opening hours per branch. closes_at earlier than opens_at crosses '
  'midnight; equal times on an open day mean a continuous 24-hour day.';

create or replace function branch_is_open_at(
  p_branch_id uuid,
  p_at timestamptz default now()
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_timezone text;
  v_local timestamp;
  v_time time;
  v_dow smallint;
  v_row store_hours%rowtype;
begin
  select timezone into v_timezone
    from branches
    where id = p_branch_id and is_active;
  if v_timezone is null then
    return false;
  end if;

  v_local := p_at at time zone v_timezone;
  v_time := v_local::time;
  v_dow := extract(dow from v_local)::smallint;

  select * into v_row
    from store_hours
    where branch_id = p_branch_id and weekday = v_dow;

  if found and not v_row.is_closed then
    -- 00:00 to 00:00, or any equal pair, is the explicit representation of a
    -- 24-hour day. It must be tested before the crossing-midnight branch.
    if v_row.closes_at = v_row.opens_at then
      return true;
    end if;
    if v_row.closes_at > v_row.opens_at then
      if v_time >= v_row.opens_at and v_time < v_row.closes_at then
        return true;
      end if;
    elsif v_time >= v_row.opens_at then
      return true;
    end if;
  end if;

  select * into v_row
    from store_hours
    where branch_id = p_branch_id and weekday = ((v_dow + 6) % 7)::smallint;

  if found
    and not v_row.is_closed
    and v_row.closes_at < v_row.opens_at
    and v_time < v_row.closes_at
  then
    return true;
  end if;

  return false;
end;
$$;

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday, 'is_closed', h.is_closed,
    'opens_at', to_char(h.opens_at, 'HH24:MI'),
    'closes_at', to_char(h.closes_at, 'HH24:MI')
  ) order by h.weekday), '[]'::jsonb)
  into v_before from store_hours h where h.branch_id = p_branch_id;

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
      -- Equal times are now the explicit, not inferred, 24-hour spelling.
    end if;

    insert into store_hours (branch_id, weekday, is_closed, opens_at, closes_at)
    values (p_branch_id, v_weekday::smallint, v_is_closed, v_opens::time, v_closes::time)
    on conflict (branch_id, weekday) do update set
      is_closed = excluded.is_closed,
      opens_at = excluded.opens_at,
      closes_at = excluded.closes_at;
    v_written := v_written + 1;
  end loop;

  delete from store_hours
  where branch_id = p_branch_id and not (weekday = any(v_seen));

  select coalesce(jsonb_agg(jsonb_build_object(
    'weekday', h.weekday, 'is_closed', h.is_closed,
    'opens_at', to_char(h.opens_at, 'HH24:MI'),
    'closes_at', to_char(h.closes_at, 'HH24:MI')
  ) order by h.weekday), '[]'::jsonb)
  into v_after from store_hours h where h.branch_id = p_branch_id;

  if v_before = v_after then
    return v_written;
  end if;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id,
    case when v_written = 0 then 'store.hours_cleared' else 'store.hours_changed' end,
    'store_hours', p_branch_id::text,
    jsonb_build_object('before', v_before, 'after', v_after), p_branch_id
  );

  return v_written;
end;
$$;

revoke execute on function branch_is_open_at(uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function staff_set_store_hours(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function branch_is_open_at(uuid, timestamptz) to anon, authenticated;
grant execute on function staff_set_store_hours(uuid, jsonb) to authenticated;
