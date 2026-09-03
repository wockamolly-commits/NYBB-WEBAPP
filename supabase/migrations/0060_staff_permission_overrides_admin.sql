-- 0060_staff_permission_overrides_admin.sql
--
-- The in-app path to a permission override row.
--
-- THIS SUPERSEDES A PARAGRAPH IN 0059.
--
-- 0059 said, of the override row that hands a branch-assigned manager the
-- shared catalog: "There is no in-app path to that override row yet: 0022
-- revoked every write on staff_permission_overrides from authenticated, so it
-- is a database edit, the same way branch assignment was until this migration.
-- Adding a screen for it is a separate change, and it is deliberately not this
-- one." This is that separate change. A reader of 0059 should come here.
--
-- WHAT WAS ALREADY DONE, AND IS NOT REDONE HERE.
--
-- Everything except the write. staff_permission_overrides is from 0007, its
-- two policies are from 0009, and both halves of the app already read it:
-- resolvePermissions() in lib/staff/roles.ts layers the rows over the role
-- defaults and then applies branch scoping, and current_staff_has_permission()
-- below does the same thing in SQL for every RLS qual. getStaffProfile() reads
-- the rows on each request, so a row written here takes effect on the target's
-- next Workspace request with no session to flush.
--
-- Reading the rows needs nothing from this migration either. 0022 revoked
-- insert, update and delete on the table and left select alone, and the "staff
-- reads own overrides" policy from 0009 admits is_admin() to every row, so the
-- team screen selects them through PostgREST like any other table.
--
-- WHY THE ROLE DEFAULTS MOVE INTO THEIR OWN FUNCTION.
--
-- They were written out twice: once in ROLE_PERMISSIONS in lib/staff/roles.ts,
-- and once inline in the case expression inside current_staff_has_permission.
-- admin_set_staff_permission has to know the same list, to work out whether a
-- switch has landed back on the role default, and a third copy in the same
-- schema is a drift waiting to happen. So the list is lifted out into
-- role_default_permission and both callers read it, the way 0059 lifted the
-- business wide list out into business_wide_permission for the same reason.
-- current_staff_has_permission keeps its signature and its behaviour; only the
-- place the array is written changes.
--
-- WHY THE AUDIT DIFF IS THREE FIELDS AND NOT to_jsonb(profile).
--
-- admin_set_workspace_access writes to_jsonb of the whole profile row, and can
-- afford to because 0059 gives its audit row a null branch_id, which the read
-- policy restated in 0056 admits to a business wide session only. The same
-- reasoning applies here and the branch_id is null for the same reason, but
-- there is no call for the profile row in the first place: what changed is one
-- permission. profiles carries a phone column, and a diff that does not hold it
-- cannot leak it however the policies are rewritten later.

-- ---------------------------------------------------------------------------
-- 1. The role defaults, lifted out of current_staff_has_permission.
--
-- IMMUTABLE for the reason business_wide_permission is: this is called from
-- inside the RLS qual on orders, payments, order items and six other tables,
-- and an immutable function with literal arguments is constant folded at plan
-- time. Marking it stable turns every orders board read into a per-row call.
-- ---------------------------------------------------------------------------

create or replace function role_default_permission(
  p_staff_role staff_role,
  p_permission text
)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_staff_role
    when 'cashier'::public.staff_role then p_permission = any(array[
      'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
      'menu:availability', 'pos:manage', 'store:availability'
    ]::text[])
    when 'manager'::public.staff_role then p_permission = any(array[
      'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
      'menu:availability', 'menu:configure', 'pos:manage',
      'analytics:view', 'vouchers:manage', 'store:availability',
      'settings:manage', 'audit:view', 'refunds:manage'
    ]::text[])
    else false
  end
$$;

comment on function role_default_permission(staff_role, text) is
  'What a job role gives before any override row or branch scoping. The '
  'database copy of ROLE_PERMISSIONS in lib/staff/roles.ts; '
  'tests/sql/staff-business-wide-permissions.test.ts fails if the two '
  'disagree.';

revoke execute on function role_default_permission(staff_role, text)
  from public, anon, authenticated;
grant execute on function role_default_permission(staff_role, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The permissions that exist at all.
--
-- So that a typo, or a key from a hand made POST, is refused by name rather
-- than stored as a row that no check will ever read. team:manage is on this
-- list even though the Workspace panel offers no switch for it: it is a real
-- permission that a row may already exist for, and this function answers what
-- the app knows about, not what the screen offers.
-- ---------------------------------------------------------------------------

create or replace function known_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_permission = any(array[
    'dashboard:view', 'orders:view', 'orders:manage', 'menu:view',
    'menu:availability', 'menu:configure', 'pos:manage', 'analytics:view',
    'vouchers:manage', 'store:availability', 'settings:manage', 'audit:view',
    'team:manage', 'refunds:manage'
  ]::text[])
$$;

comment on function known_permission(text) is
  'Whether a string is one of the permissions this app checks. The database '
  'copy of ALL_PERMISSIONS in lib/staff/roles.ts.';

revoke execute on function known_permission(text)
  from public, anon, authenticated;
grant execute on function known_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. current_staff_has_permission, restated whole.
--
-- Same signature, same behaviour, same immutability story. The only change is
-- that the case expression is now a call to role_default_permission. Restated
-- rather than altered because a function body cannot be patched, and stated
-- whole rather than diffed because that is how 0050 and 0059 left it.
-- ---------------------------------------------------------------------------

create or replace function current_staff_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce((
    select case
      when p.role = 'admin'::public.user_role then true
      -- An assigned profile gets a business wide permission from an override
      -- row and nothing else. Checking the override alone is the whole rule:
      -- an override that grants would have won in the branch below anyway, so
      -- there is no case where the job role matters and this arm is wrong.
      when p.branch_id is not null and public.business_wide_permission(p_permission) then
        coalesce((
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ), false)
      else coalesce(
        (
          select o.granted
          from public.staff_permission_overrides o
          where o.profile_id = p.id and o.permission = p_permission
        ),
        public.role_default_permission(p.staff_role, p_permission)
      )
    end
    from public.profiles p
    where p.id = auth.uid() and p.is_active
  ), false)
$$;

revoke execute on function current_staff_has_permission(text)
  from public, anon, authenticated;
grant execute on function current_staff_has_permission(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The write.
--
-- WHY THIS TAKES A DESIRED STATE AND NOT AN INSTRUCTION.
--
-- The caller sends "this person should have refunds: yes". It does not send
-- "insert a row" or "delete a row", because which of those is correct depends
-- on what the role and the branch already give, and that answer lives here.
-- A switch that lands back on the default deletes its row, so the person goes
-- back to inheriting and a later role change carries them with it. Only a
-- genuine disagreement with the role is stored.
--
-- THE CASE THAT MAKES THIS SUBTLE.
--
-- The default is not role_default_permission alone. A manager assigned to a
-- counter does not inherit menu:configure, because the catalog is one shared
-- list, so the effective default for that switch is false and an override row
-- granting it is the only thing that can turn it on. Compare against the role
-- alone and turning it on would read as a return to the Manager default,
-- delete the row rather than write one, and leave the permission off: the
-- screen says yes, the database says no. The branch arm below is that case,
-- and it is the same shape as the one in current_staff_has_permission above.
-- ---------------------------------------------------------------------------

create or replace function admin_set_staff_permission(
  p_profile_id uuid,
  p_permission text,
  p_granted boolean
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target profiles%rowtype;
  v_default boolean;
  v_before jsonb;
  v_outcome text;
  v_action text;
begin
  if current_role_kind() is distinct from 'admin'::user_role then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_profile_id is null or p_permission is null or p_granted is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if not known_permission(p_permission) then
    raise exception 'UNKNOWN_PERMISSION' using errcode = 'P0001';
  end if;

  -- Before the lookup, so that an admin who somehow reaches their own row is
  -- told what they did rather than told the row is missing.
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

  v_default := case
    when v_target.branch_id is not null and business_wide_permission(p_permission) then false
    else role_default_permission(v_target.staff_role, p_permission)
  end;

  -- to_jsonb, not the bare boolean: v_before is jsonb so that "no row" and
  -- "a row saying false" stay different things in the audit diff. They are.
  select to_jsonb(o.granted) into v_before
  from staff_permission_overrides o
  where o.profile_id = p_profile_id and o.permission = p_permission;

  if p_granted = v_default then
    delete from staff_permission_overrides
    where profile_id = p_profile_id and permission = p_permission;
    v_outcome := 'inherited';
    v_action := 'workspace.permission_inherited';
  else
    insert into staff_permission_overrides
      (profile_id, permission, granted, updated_by, updated_at)
    values (p_profile_id, p_permission, p_granted, v_actor_id, now())
    on conflict (profile_id, permission) do update set
      granted = excluded.granted,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;
    v_outcome := case when p_granted then 'granted' else 'revoked' end;
    v_action := case
      when p_granted then 'workspace.permission_granted'
      else 'workspace.permission_revoked'
    end;
  end if;

  -- before and after describe the override row, not the effective permission:
  -- null on either side means "no row, inheriting from the role". The role
  -- default is carried alongside so a reader of the log can work out what the
  -- person actually ended up with without knowing what the role gave that day.
  -- Three fields, and deliberately not the profile row. See the header.
  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    v_action,
    'staff_permission_overrides',
    p_profile_id::text,
    jsonb_build_object(
      'permission', p_permission,
      'before', v_before,
      'after', case when p_granted = v_default then null else to_jsonb(p_granted) end,
      'role_default', v_default
    )
  );

  return v_outcome;
end;
$$;

comment on function admin_set_staff_permission(uuid, text, boolean) is
  'Sets one permission on or off for one staff account. p_granted is the '
  'desired state, not an instruction: landing on what the role and branch '
  'already give deletes the override row, so the person goes back to '
  'inheriting and a later role change carries them with it.';

revoke execute on function admin_set_staff_permission(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function admin_set_staff_permission(uuid, text, boolean)
  to authenticated;
