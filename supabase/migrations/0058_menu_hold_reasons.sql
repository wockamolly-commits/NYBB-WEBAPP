-- 0058_menu_hold_reasons.sql
-- Why an item is off, not only that it is.
--
-- menu_item_branch_holds recorded that a counter stopped selling something and
-- never why. The audit trail inherited the gap: "menu.item.held" with a kind
-- and a timestamp, and nothing a manager reading it a week later could use to
-- tell a fryer breakdown from a delivery that did not arrive. Staff asked for
-- the reason, so the reason becomes part of the record rather than something
-- somebody remembers.
--
-- WHY A CHECKED TEXT COLUMN AND NOT AN ENUM. `kind` next to it is a checked
-- text column, and 0050 had to rebuild the staff_role enum to retire one of
-- its values, which is a table rewrite and a migration nobody enjoys. This
-- list will change: a chain that grows into nine counters will want a reason
-- these four do not cover. A check constraint is altered in place.
--
-- WHY NULLABLE. The table is empty today, so `not null` would apply cleanly,
-- and it would still be the wrong column. A hold set before this migration has
-- no reason and never did; null says exactly that, and a default would label
-- those rows with a reason nobody chose. AGENTS.md rule 6 is about numbers but
-- the principle is the same: absent is not a value. New holds are required to
-- carry one, and that requirement lives in the function below, where it can
-- refuse rather than guess.

alter table menu_item_branch_holds
  add column reason text
  constraint hold_reason_is_known check (
    reason is null or reason in ('out_of_stock', 'ingredients', 'equipment', 'temporary')
  );

comment on column menu_item_branch_holds.reason is
  'Why this counter stopped selling the item. Null only on a hold set before '
  '0058: the writer requires one. Labels live in lib/staff/menu-types.ts, and '
  'the stored value is a stable key so renaming what staff read never touches '
  'a row.';

-- ---------------------------------------------------------------------------
-- The writer, with the reason.
-- ---------------------------------------------------------------------------
--
-- DROPPED AND RECREATED, NOT REPLACED, AND THAT IS THE POINT. `create or
-- replace` matches on name and argument types, so adding a fifth parameter
-- creates a SECOND function beside the old one rather than replacing it. Both
-- would then be callable, and the four argument one writes a hold with no
-- reason: the exact thing this migration exists to stop. Dropping it first is
-- what makes the requirement real.
--
-- Dropping also drops its grants, so they are reapplied below. 0015 is the
-- reason the revoke names anon and authenticated and not only public.
--
-- The body is copied from 0056 verbatim. The changes are the parameter, the
-- two guards on it, the reason in the stored row, the reason in the no-op
-- comparison, and the reason in both audit diffs. Nothing else was touched, so
-- the diff a reviewer reads is the change.

drop function if exists staff_set_menu_item_hold(uuid, uuid, text, timestamptz);

create or replace function staff_set_menu_item_hold(
  p_item_id uuid,
  p_branch_id uuid,
  p_kind text,
  p_unavailable_until timestamptz default null,
  p_reason text default null
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

  -- Setting a hold requires a reason; lifting one does not, because the row
  -- and its reason go together. An unknown reason is refused rather than
  -- stored, so the column's check constraint is never the thing that finds
  -- out: this raises a name the workspace can turn into a sentence, and the
  -- constraint stays as the guard against a writer that is not this function.
  if p_kind is not null then
    if p_reason is null then
      raise exception 'HOLD_NEEDS_A_REASON' using errcode = 'P0001';
    end if;
    if p_reason not in ('out_of_stock', 'ingredients', 'equipment', 'temporary') then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
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
          'unavailable_until', v_existing.unavailable_until,
          'reason', v_existing.reason
        )
      ),
      p_branch_id
    );
    return;
  end if;

  -- A no-op writes no audit row, matching staff_set_branch_accepting_orders.
  if found
     and v_existing.kind = p_kind
     and v_existing.unavailable_until is not distinct from v_until
     and v_existing.reason is not distinct from p_reason then
    return;
  end if;

  insert into menu_item_branch_holds
    (item_id, branch_id, kind, unavailable_until, reason, created_by)
  values
    (p_item_id, p_branch_id, p_kind, v_until, p_reason, v_actor_id)
  on conflict (item_id, branch_id) do update
    set kind = excluded.kind,
        unavailable_until = excluded.unavailable_until,
        reason = excluded.reason,
        created_by = excluded.created_by;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.held', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_item_name,
      'before', case when v_existing.item_id is null then null else jsonb_build_object(
        'kind', v_existing.kind,
        'unavailable_until', v_existing.unavailable_until,
        'reason', v_existing.reason
      ) end,
      'after', jsonb_build_object(
        'kind', p_kind,
        'unavailable_until', v_until,
        'reason', p_reason
      )
    ),
    p_branch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, reapplied because the drop above took them with it.
-- ---------------------------------------------------------------------------

revoke execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz, text)
  from public, anon, authenticated;

grant execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz, text)
  to authenticated;

comment on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz, text) is
  'Pause or resume one item at one counter. A null kind lifts the hold and '
  'deletes the row; any other kind requires a reason, which is stored and '
  'written into the audit diff on both the hold and the release.';
