-- 0019_workspace_access_admin.sql
-- Audited Super Admin controls for Workspace access.

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
    u.email,
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

revoke insert, update, delete on profiles from authenticated;

revoke execute on function admin_list_workspace_access()
  from public, anon, authenticated;
revoke execute on function admin_set_workspace_access(text, staff_role, boolean)
  from public, anon, authenticated;
grant execute on function admin_list_workspace_access() to authenticated;
grant execute on function admin_set_workspace_access(text, staff_role, boolean)
  to authenticated;
