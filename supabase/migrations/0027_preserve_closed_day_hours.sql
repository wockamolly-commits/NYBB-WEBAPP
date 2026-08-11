-- 0027_preserve_closed_day_hours.sql
-- Keep a weekday's configured time window while it is marked closed.
--
-- This migration must land after 0026 and before the matching settings UI is
-- deployed. Earlier versions of staff_set_store_hours() deliberately replaced
-- a closed day's times with null. That made a temporary closure destructive:
-- reopening the day required the manager to enter its normal window again.
-- is_closed is now only the operational status. A closed row may retain either
-- a complete valid window or no window when one has never been configured.

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

    if (v_opens is null) <> (v_closes is null) then
      raise exception 'WINDOW_INCOMPLETE' using errcode = 'P0001';
    end if;
    if not v_is_closed and v_opens is null then
      raise exception 'WINDOW_INCOMPLETE' using errcode = 'P0001';
    end if;
    if v_opens is not null then
      if v_opens !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
         or v_closes !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' then
        raise exception 'WINDOW_MALFORMED' using errcode = 'P0001';
      end if;
      -- Equal times remain the explicit 24-hour spelling introduced by 0026.
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

comment on function staff_set_store_hours(uuid, jsonb) is
  'Atomically replaces a branch week through an audited settings write. Closed '
  'days retain a complete configured window so reopening is non-destructive.';

revoke execute on function staff_set_store_hours(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function staff_set_store_hours(uuid, jsonb) to authenticated;
