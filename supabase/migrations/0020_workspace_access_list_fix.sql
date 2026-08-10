-- 0020_workspace_access_list_fix.sql
-- Supabase stores auth.users.email as varchar while the RPC promises text.
-- PL/pgSQL return queries require the source type to match exactly.

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
