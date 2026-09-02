-- 0059_branch_scoped_staff.sql
--
-- Giving a staff account a branch, and making that assignment mean something
-- on the three tables that never got the predicate.
--
-- WHY THIS IS MOSTLY A FORM FIELD.
--
-- The scoping itself has worked since 0037. profiles.branch_id exists, the
-- helper pair staff_can_access_branch and current_staff_can_access_branch
-- exists, and orders, order items, order status events, payments, pickup
-- slots, carts and the audit log all read
--   current_staff_has_permission('...') and current_staff_can_access_branch(...)
-- What was missing is the assignment. admin_set_workspace_access is the only
-- thing allowed to write a profile row (authenticated holds no insert or
-- update on profiles, revoked in 0019), and it wrote branch_id as a literal
-- null on insert and did not mention it at all on conflict. So every account
-- created through the app is business wide, and the two rows that are not were
-- set by hand in Postgres.
--
-- WHAT A NULL BRANCH MEANS. Unchanged, and worth restating because this
-- migration leans on it three more times: null is business wide, not unknown.
-- 0023 established that reading for audit_logs and 0037 wrote it into the
-- helper. current_staff_can_access_branch(null) is therefore true for an
-- unassigned profile and false for an assigned one, because 'branch' = null is
-- null rather than true.
--
-- WHY THE CATALOG IS A BUSINESS WIDE CAPABILITY.
--
-- menu_items, menu_categories, menu_option_groups and the price tables carry
-- no branch. They are one catalog shared by every counter, so a manager pinned
-- to one of them renaming an item or moving a price is doing it to all nine.
-- That is the opposite of what an assignment is for. From here, a permission
-- can be marked business wide: an assigned profile does not get it from its
-- job role, and the Super Admin hands it over one person at a time with an
-- override row. menu:configure is the only one today.
--
-- There is no in-app path to that override row yet: 0022 revoked every write
-- on staff_permission_overrides from authenticated, so it is a database edit,
-- the same way branch assignment was until this migration. Adding a screen for
-- it is a separate change, and it is deliberately not this one.
--
-- WHAT WAS LOOKED AT AND LEFT.
--
-- app_settings keeps its is_staff() read policy from 0009. It holds two
-- columns, accepting_orders and slot_horizon_hours, and has no branch, so
-- there is nothing to scope it by. The write is already refused to a branch
-- profile in the action and in 0025. Left alone on purpose, so the next reader
-- does not have to work out whether it was missed.
--
-- The audit row this migration writes keeps a null branch_id, and must. The
-- trigger from 0023 backfills only for target_table = 'orders', and the read
-- policy restated in 0056 admits a null-branch row to a business wide session
-- only. That is what keeps it right: the diff carries to_jsonb of the profile
-- row, profiles has a phone column, and a branch-scoped audit row would hand a
-- branch manager the phone number of everybody assigned to their counter.

-- ---------------------------------------------------------------------------
-- 1. The assignment itself.
--
-- DROPPED, NOT REPLACED, AND THAT IS THE POINT.
--
-- create or replace matches on argument types, so replacing a three argument
-- function with a four argument one creates a second function and leaves the
-- old, branch-blind signature callable by anything holding its grant. 0058
-- hit this with staff_set_menu_item_hold. Drop first, then create.
-- ---------------------------------------------------------------------------

drop function if exists admin_set_workspace_access(text, staff_role, boolean);

create or replace function admin_set_workspace_access(
  p_email text,
  p_staff_role staff_role,
  p_branch_id uuid,
  p_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target_id uuid;
  v_existing profiles%rowtype;
  v_customer_name text;
  v_display_name text;
  v_before jsonb;
  v_action text;
begin
  if current_role_kind() is distinct from 'admin'::user_role then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_email is null or trim(p_email) = '' or p_staff_role is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  -- A null branch is business wide and legal. A branch that does not exist is
  -- a mistake worth its own name: the foreign key would raise here too, but
  -- with a message the workspace cannot turn into a sentence.
  if p_branch_id is not null
    and not exists (select 1 from branches b where b.id = p_branch_id)
  then
    raise exception 'INVALID_BRANCH' using errcode = 'P0001';
  end if;

  select u.id into v_target_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_target_id is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_target_id = v_actor_id then
    raise exception 'CANNOT_CHANGE_SELF' using errcode = 'P0001';
  end if;

  select * into v_existing from profiles where id = v_target_id for update;
  if found and v_existing.role = 'admin' then
    raise exception 'CANNOT_CHANGE_ADMIN' using errcode = 'P0001';
  end if;
  if not p_active and not found then
    raise exception 'ACCESS_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := case when v_existing.id is null then null else to_jsonb(v_existing) end;
  select nullif(trim(cp.display_name), '') into v_customer_name
  from customer_profiles cp
  where cp.id = v_target_id;
  v_display_name := coalesce(
    nullif(trim(v_existing.display_name), ''),
    v_customer_name,
    split_part(lower(trim(p_email)), '@', 1)
  );

  insert into profiles (id, role, staff_role, display_name, branch_id, is_active)
  values (v_target_id, 'staff', p_staff_role, v_display_name, p_branch_id, p_active)
  on conflict (id) do update set
    role = 'staff',
    staff_role = excluded.staff_role,
    display_name = coalesce(nullif(trim(profiles.display_name), ''), excluded.display_name),
    branch_id = excluded.branch_id,
    is_active = excluded.is_active;

  -- The branch arm sits between the account arms and the role arm. A move
  -- between counters on an otherwise unchanged account used to fall through to
  -- access_confirmed, which reads as "nothing happened". The diff carries both
  -- fields either way, so this only decides which word the audit log leads on.
  v_action := case
    when v_before is null then 'workspace.access_granted'
    when not (v_before ->> 'is_active')::boolean and p_active then 'workspace.access_reactivated'
    when (v_before ->> 'is_active')::boolean and not p_active
      then 'workspace.access_revoked'
    when (v_before ->> 'branch_id') is distinct from p_branch_id::text
      then 'workspace.branch_changed'
    when (v_before ->> 'staff_role') is distinct from p_staff_role::text
      then 'workspace.role_changed'
    else 'workspace.access_confirmed'
  end;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    v_action,
    'profiles',
    v_target_id::text,
    jsonb_build_object(
      'before', v_before,
      'after', jsonb_build_object(
        'role', 'staff',
        'staff_role', p_staff_role,
        'branch_id', p_branch_id,
        'is_active', p_active
      )
    )
  );

  return v_target_id;
end;
$$;

comment on function admin_set_workspace_access(text, staff_role, uuid, boolean) is
  'Grants, moves or revokes one Workspace account. p_branch_id null means '
  'business wide, which is the roving manager and the Super Admin; a branch id '
  'pins the account to that counter, which every RLS policy reading '
  'current_staff_can_access_branch then enforces.';

revoke execute on function admin_set_workspace_access(text, staff_role, uuid, boolean)
  from public, anon, authenticated;
grant execute on function admin_set_workspace_access(text, staff_role, uuid, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Business wide permissions.
--
-- The list lives in one function so that adding the next one is a single line
-- here and a single line in BUSINESS_WIDE_PERMISSIONS in lib/staff/roles.ts.
-- tests/sql/staff-business-wide-permissions.test.ts reads both and fails if
-- they disagree, which is the same tripwire 0024 used to stop the app and the
-- database drifting on who may move an order.
-- ---------------------------------------------------------------------------

-- IMMUTABLE IS LOAD BEARING, NOT DECORATION.
--
-- current_staff_has_permission runs inside the RLS qual on orders, payments,
-- order items and six other tables. An immutable function called with a
-- literal argument is constant folded when the statement is planned, so the
-- new arm below costs nothing per row. Marking this stable, or making it
-- security definer, turns it into a per-row call on every orders board read.
create or replace function business_wide_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_permission = any(array['menu:configure']::text[])
$$;

comment on function business_wide_permission(text) is
  'Whether a permission acts on the whole business rather than one counter. A '
  'branch-assigned profile does not receive one of these from its job role and '
  'holds it only through an explicit staff_permission_overrides row.';

revoke execute on function business_wide_permission(text)
  from public, anon, authenticated;
grant execute on function business_wide_permission(text) to authenticated;

-- Restated whole from 0050, with one arm added. The signature is unchanged, so
-- this is a genuine replace rather than the drop above. Every reference is
-- schema qualified because the search_path is pg_catalog, which is why the new
-- call reads public.business_wide_permission and not the bare name.
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
        case p.staff_role
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
-- 3. The three reads that were never scoped.
--
-- A policy cannot be altered to add a conjunct, so each is dropped and stated
-- whole. Without these an assigned cashier still reads every branch row, every
-- counter's opening hours, and which items are sold out at the other eight
-- shops, which is most of what an assignment was supposed to stop.
-- ---------------------------------------------------------------------------

-- is_staff() is kept in front of the branch check on these two for reading,
-- not for authority: current_staff_can_access_branch already requires an
-- active profile whose role is staff or admin, so it answers both halves on
-- its own. The tables carry no permission of their own, and a policy that
-- reads only as a branch test would leave the next reader working out whether
-- a customer could reach it.
drop policy if exists "staff read branches" on branches;
create policy "staff read branches" on branches
  for select using (is_staff() and current_staff_can_access_branch(id));

drop policy if exists "staff read store hours" on store_hours;
create policy "staff read store hours" on store_hours
  for select using (is_staff() and current_staff_can_access_branch(branch_id));

drop policy if exists "staff read holds" on menu_item_branch_holds;
create policy "staff read holds" on menu_item_branch_holds
  for select using (
    current_staff_has_permission('menu:view')
    and current_staff_can_access_branch(branch_id)
  );
