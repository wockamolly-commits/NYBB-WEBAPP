-- 0050_retire_kitchen_role.sql
-- Kitchen is not a Workspace job.
--
-- The kitchen already works from the POS system's own monitor. A Workspace
-- login for it would put a second screen beside the first one showing the same
-- tickets: two places to mark the same order done, work repeated at both, and a
-- queue that stalls whenever the two disagree. The roles this app hands out are
-- Cashier and Manager, which is what lib/staff/roles.ts now says.
--
-- Leaving the value in the type and merely hiding it from the page would have
-- been the smaller change and the wrong one: the enum would still accept
-- 'kitchen' from any caller that is not that page, and the permission resolver
-- would still answer for it. Postgres cannot drop a value from an enum, so the
-- type is rebuilt without it. Everything that names staff_role in a signature
-- has to stand aside while that happens, which is why removing one word is this
-- long a file. Nothing below changes what Cashier or Manager can do.

-- ---------------------------------------------------------------------------
-- 1. Nobody is left holding a role that no longer exists.
--
-- Access is revoked rather than converted. Cashier can pause a counter, change
-- menu availability and work the POS screen, so quietly moving a kitchen
-- account across would hand it more than it ever had. The Super Admin can
-- restore any of these from /workspace/team against a role chosen on purpose.
-- The row still needs a staff_role to satisfy profiles_staff_role_matches_class,
-- and an inactive profile is refused at login whatever that column says.
-- ---------------------------------------------------------------------------

insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
select
  null,
  'workspace.kitchen_role_retired',
  'profiles',
  p.id::text,
  jsonb_build_object(
    'before', to_jsonb(p),
    'after', jsonb_build_object('staff_role', 'cashier', 'is_active', false)
  )
from profiles p
where p.staff_role = 'kitchen';

update profiles
   set staff_role = 'cashier', is_active = false
 where staff_role = 'kitchen';

-- An unaccepted invitation to a job that no longer exists is withdrawn, not
-- upgraded. Rows already accepted or revoked are history, and only have their
-- label rewritten, because a value the type no longer holds cannot be stored.
update staff_invitations
   set status = 'revoked',
       revoked_at = coalesce(revoked_at, now()),
       staff_role = 'cashier'
 where staff_role = 'kitchen' and status = 'pending';

update staff_invitations
   set staff_role = 'cashier'
 where staff_role = 'kitchen';

-- ---------------------------------------------------------------------------
-- 2. Rebuild the type without it.
--
-- These four functions carry staff_role in an argument or a returned column, so
-- they depend on the type and are dropped and recreated unchanged around the
-- swap. current_staff_role() could not have been edited in place in any case:
-- CREATE OR REPLACE will not change a return type.
-- ---------------------------------------------------------------------------

drop function if exists current_staff_role();
drop function if exists resolve_active_staff_email(text);
drop function if exists admin_list_workspace_access();
drop function if exists admin_set_workspace_access(text, staff_role, boolean);

alter type staff_role rename to staff_role_retired;
create type staff_role as enum ('cashier', 'manager');

alter table profiles
  alter column staff_role type public.staff_role
  using staff_role::text::public.staff_role;

alter table staff_invitations
  alter column staff_role drop default;
alter table staff_invitations
  alter column staff_role type public.staff_role
  using staff_role::text::public.staff_role;
alter table staff_invitations
  alter column staff_role set default 'cashier';

drop type staff_role_retired;

comment on type staff_role is
  'The jobs that use this web app. There is no kitchen value: the kitchen works '
  'from the POS monitor, and a second screen for the same tickets duplicates '
  'the work. Mirrors STAFF_JOB_ROLES in lib/staff/roles.ts.';

-- ---------------------------------------------------------------------------
-- 3. Put the four functions back, unchanged apart from the type they name.
-- ---------------------------------------------------------------------------

create or replace function current_staff_role()
returns staff_role
language sql
stable
security definer
set search_path = public
as $$
  select staff_role from profiles where id = auth.uid() and is_active
$$;

revoke execute on function current_staff_role() from public, anon, authenticated;
grant execute on function current_staff_role() to authenticated;

create or replace function resolve_active_staff_email(p_email text)
returns table (
  profile_id uuid,
  profile_role user_role,
  profile_staff_role staff_role
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select p.id, p.role, p.staff_role
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_active
    and lower(u.email) = lower(trim(p_email))
  limit 1
$$;

revoke execute on function resolve_active_staff_email(text)
  from public, anon, authenticated;
grant execute on function resolve_active_staff_email(text) to service_role;

create or replace function admin_list_workspace_access()
returns table (
  profile_id uuid,
  email text,
  display_name text,
  profile_role user_role,
  profile_staff_role staff_role,
  branch_id uuid,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if current_role_kind() is distinct from 'admin'::user_role then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.role,
    p.staff_role,
    p.branch_id,
    p.is_active,
    p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by
    case when p.role = 'admin' then 0 else 1 end,
    p.is_active desc,
    lower(p.display_name),
    lower(u.email);
end;
$$;

revoke execute on function admin_list_workspace_access()
  from public, anon, authenticated;
grant execute on function admin_list_workspace_access() to authenticated;

create or replace function admin_set_workspace_access(
  p_email text,
  p_staff_role staff_role,
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
  values (v_target_id, 'staff', p_staff_role, v_display_name, null, p_active)
  on conflict (id) do update set
    role = 'staff',
    staff_role = excluded.staff_role,
    display_name = coalesce(nullif(trim(profiles.display_name), ''), excluded.display_name),
    is_active = excluded.is_active;

  v_action := case
    when v_before is null then 'workspace.access_granted'
    when not (v_before ->> 'is_active')::boolean and p_active then 'workspace.access_reactivated'
    when (v_before ->> 'is_active')::boolean and not p_active
      then 'workspace.access_revoked'
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
        'is_active', p_active
      )
    )
  );

  return v_target_id;
end;
$$;

revoke execute on function admin_set_workspace_access(text, staff_role, boolean)
  from public, anon, authenticated;
grant execute on function admin_set_workspace_access(text, staff_role, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The permission resolver, with the kitchen arm gone.
--
-- Its body is stored as text, so the old version survived the type swap
-- unexecuted and would have failed on its first call at
-- 'kitchen'::public.staff_role, which is every staff read in the app. The
-- cashier and manager arms are unchanged and still mirror ROLE_PERMISSIONS in
-- lib/staff/roles.ts.
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
