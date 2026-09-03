-- 0061_staff_permissions_batch.sql
--
-- Saving a member's permissions as one decision instead of thirteen.
--
-- WHY THIS REPLACES 0060'S FUNCTION RATHER THAN JOINING IT.
--
-- 0060 gave the panel a switch that wrote as soon as it was pressed. That put
-- one audit row per switch, which is a clean log, but it also meant there was
-- no moment at which the Super Admin had decided and not yet committed: a
-- half-finished thought about somebody's access was already live, and there
-- was nothing to cancel. The panel now collects the changes and saves them
-- together, and the whole point of that is the guarantee this function makes:
-- all of them land or none of them do.
--
-- A Save button in front of thirteen separate calls would not have been that.
-- It would fail on the seventh and leave a member holding four of the changes
-- somebody made and not the other three, which is worse than saving eagerly,
-- because at least the eager version never lied about what had happened. One
-- function call is one transaction, so the guarantee comes from putting the
-- loop in here rather than in the browser.
--
-- admin_set_staff_permission (singular) is dropped rather than kept. Nothing
-- calls it once the panel batches, and a privileged function nobody uses is a
-- grant to keep track of for no benefit. 0059 has the note about why a leftover
-- signature is worth caring about: create or replace matches on argument types,
-- so an old signature left behind stays callable by anything holding its grant.
--
-- WHAT IS UNCHANGED FROM 0060.
--
-- The rule about what a desired state means. Landing on what the role and the
-- branch already give deletes the override row rather than storing agreement,
-- so the person goes back to inheriting; a branch-assigned manager's
-- menu:configure is off by default and switching it on writes a row. Both are
-- per permission and both still hold, they just happen in a loop now.
--
-- WHAT IS NEW BESIDES THE BATCHING.
--
-- A permission whose stored row already matches what the caller is asking for
-- is skipped, and writes no audit row. 0060 audited every call, so a stale page
-- re-sending a value that was already true logged a change that did not happen.
-- The comparison is between the row that should exist and the row that does,
-- which also cleans up a redundant row left by an older hand edit: a row saying
-- true where the role already says true is not the absence of a row, and the
-- panel reads it as inherited, so it should go.

drop function if exists admin_set_staff_permission(uuid, text, boolean);

create or replace function admin_set_staff_permissions(
  p_profile_id uuid,
  p_changes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target profiles%rowtype;
  v_permission text;
  v_value jsonb;
  v_granted boolean;
  v_default boolean;
  v_current boolean;
  v_wanted boolean;
  v_action text;
  v_outcomes jsonb := '{}'::jsonb;
begin
  if current_role_kind() is distinct from 'admin'::user_role then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_profile_id is null or p_changes is null
    or jsonb_typeof(p_changes) is distinct from 'object'
  then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_changes = '{}'::jsonb then
    raise exception 'NO_CHANGES' using errcode = 'P0001';
  end if;

  if p_profile_id = v_actor_id then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;

  select * into v_target from profiles where id = p_profile_id for update;
  if not found then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target.role = 'admin' then
    raise exception 'CANNOT_CHANGE_ADMIN' using errcode = 'P0001';
  end if;

  -- Every key is checked before any row is written. A set naming one
  -- permission that does not exist is a bad request in full, not a good one
  -- with a bad line in it, and finding that out halfway through would mean the
  -- caller had to work out which half landed. Inside one function nothing
  -- would actually be left behind, since the raise rolls the statement back,
  -- but validating up front is what makes that obvious to the next reader
  -- rather than a property they have to derive.
  for v_permission, v_value in select * from jsonb_each(p_changes) loop
    if not known_permission(v_permission) then
      raise exception 'UNKNOWN_PERMISSION' using errcode = 'P0001';
    end if;
    if jsonb_typeof(v_value) is distinct from 'boolean' then
      raise exception 'INVALID_INPUT' using errcode = 'P0001';
    end if;
  end loop;

  for v_permission, v_value in select * from jsonb_each(p_changes) loop
    v_granted := v_value::boolean;

    v_default := case
      when v_target.branch_id is not null and business_wide_permission(v_permission) then false
      else role_default_permission(v_target.staff_role, v_permission)
    end;

    select o.granted into v_current
    from staff_permission_overrides o
    where o.profile_id = p_profile_id and o.permission = v_permission;

    -- The row that should exist, which is null when the desired state is what
    -- the role and branch already give.
    v_wanted := case when v_granted = v_default then null else v_granted end;

    -- is not distinct from, because both sides are nullable and null here
    -- means "no row" rather than "unknown". A plain = would call every
    -- inherited permission a change and audit it.
    if v_wanted is not distinct from v_current then
      v_outcomes := v_outcomes || jsonb_build_object(v_permission, 'unchanged');
      continue;
    end if;

    if v_wanted is null then
      delete from staff_permission_overrides
      where profile_id = p_profile_id and permission = v_permission;
      v_action := 'workspace.permission_inherited';
      v_outcomes := v_outcomes || jsonb_build_object(v_permission, 'inherited');
    else
      insert into staff_permission_overrides
        (profile_id, permission, granted, updated_by, updated_at)
      values (p_profile_id, v_permission, v_wanted, v_actor_id, now())
      on conflict (profile_id, permission) do update set
        granted = excluded.granted,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
      v_action := case
        when v_wanted then 'workspace.permission_granted'
        else 'workspace.permission_revoked'
      end;
      v_outcomes := v_outcomes || jsonb_build_object(
        v_permission, case when v_wanted then 'granted' else 'revoked' end
      );
    end if;

    -- One row per permission, not one per save. Which permission changed is
    -- the whole content of the entry, and a single row saying "permissions
    -- changed" would need the diff read to answer the question the log is
    -- opened to answer.
    --
    -- before and after describe the override row: null on either side means
    -- "no row, inheriting from the role". Deliberately not to_jsonb of the
    -- profile, which is what the access RPCs write; profiles carries a phone
    -- column and a diff that never holds the row cannot leak it.
    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff)
    values (
      v_actor_id,
      v_action,
      'staff_permission_overrides',
      p_profile_id::text,
      jsonb_build_object(
        'permission', v_permission,
        'before', to_jsonb(v_current),
        'after', to_jsonb(v_wanted),
        'role_default', v_default
      )
    );
  end loop;

  return v_outcomes;
end;
$$;

comment on function admin_set_staff_permissions(uuid, jsonb) is
  'Saves a set of permission changes for one staff account in one '
  'transaction. p_changes maps a permission to the desired state, not to an '
  'instruction: landing on what the role and branch already give deletes the '
  'override row. Returns the outcome per permission, one of granted, revoked, '
  'inherited or unchanged.';

revoke execute on function admin_set_staff_permissions(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function admin_set_staff_permissions(uuid, jsonb)
  to authenticated;
