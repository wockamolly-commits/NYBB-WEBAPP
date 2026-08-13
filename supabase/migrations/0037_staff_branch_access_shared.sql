-- 0037_staff_branch_access_shared.sql
-- One definition of branch access, two callers.
--
-- 0022 wrote current_staff_can_access_branch() against auth.uid(). That is
-- correct for a policy, which always runs as somebody. It is unusable from the
-- notification sender, which runs as service_role on a pg_cron schedule with no
-- session at all. Writing a second branch check there would put the same
-- question in two places, which is the exact disagreement 0024 was written to
-- end: the rows a staff member can see and the alerts they receive must not be
-- able to part company.
--
-- So the shared half moves into staff_can_access_branch(profile, branch) and
-- the session function becomes a one-line caller.
--
-- current_staff_can_access_branch is restated whole because
-- `create or replace function` cannot amend a body in place. Diff it against
-- 0022 rather than reading it fresh, or a transcription slip reads as intent.

create or replace function staff_can_access_branch(
  p_profile_id uuid,
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.is_active
      and p.role in ('admin'::public.user_role, 'staff'::public.user_role)
      -- A null branch_id is business wide, not unknown. Same reading 0023
      -- established for audit_logs.
      and (p.branch_id is null or p.branch_id = p_branch_id)
  )
$$;

create or replace function current_staff_can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.staff_can_access_branch(auth.uid(), p_branch_id)
$$;

revoke execute on function staff_can_access_branch(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function current_staff_can_access_branch(uuid)
  from public, anon, authenticated;

-- authenticated needs the profile-scoped one too: a policy expression is
-- evaluated as the querying role, so the session wrapper calling it would fail
-- on the function rather than on the table. That is handoff gotcha 8.
grant execute on function staff_can_access_branch(uuid, uuid)
  to authenticated, service_role;
grant execute on function current_staff_can_access_branch(uuid) to authenticated;

comment on function staff_can_access_branch(uuid, uuid) is
  'Branch access for a named profile. The session wrapper and the notification '
  'sender both read this, so neither can drift from the other.';
