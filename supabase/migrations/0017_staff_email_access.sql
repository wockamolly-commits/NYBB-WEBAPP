-- 0017_staff_email_access.sql
-- Phase 2 staff authentication lookup.
--
-- The staff cookie is deliberately separate from the customer cookie, but
-- both sessions authenticate against the same Supabase user directory. The
-- login action needs an exact, non-enumerating way to decide whether an email
-- belongs to an active operations profile before it asks Auth to send a code.
-- This function is service-role-only because it joins public profiles to the
-- private auth.users directory.

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

-- Supabase grants new public-schema functions explicitly to its API roles.
-- Revoke those grants by name, not only from PostgreSQL's PUBLIC role.
revoke execute on function resolve_active_staff_email(text)
  from public, anon, authenticated;
grant execute on function resolve_active_staff_email(text) to service_role;
