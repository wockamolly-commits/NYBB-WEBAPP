-- 0046_franchise_inquiry_triage.sql
-- Letting an admin mark a franchise lead as dealt with.
--
-- 0008 built `handled_at`, `handled_by_profile_id`, and a partial index on
-- `(handled_at) where handled_at is null` for exactly this, so the schema has
-- been waiting for a screen since Phase 0. 0045 gave leads a way in. This gives
-- the person working them a way to say which ones are done.
--
-- Why a function rather than a policy. 0009 created an "admin updates franchise
-- inquiries" policy, but 0022 then revoked UPDATE on the table from
-- authenticated, so that policy currently guards a privilege nobody holds and
-- no update can happen at all. Restoring the table grant would hand an admin
-- session the ability to rewrite a lead's name, email and phone, which is not
-- the power being asked for. This function changes two columns and nothing
-- else.

-- ---------------------------------------------------------------------------
-- Triage.
-- ---------------------------------------------------------------------------
--
-- A toggle rather than a one-way door. Marking the wrong row handled is a
-- misclick, and if the only remedy is a developer with database access then the
-- realistic outcome is that somebody stops using the checkbox rather than that
-- they ask for help.
--
-- Returns boolean: true when a row changed, false when the id matched nothing.
-- A caller who is not an admin gets an exception rather than a false, because
-- that is a caller doing something it was never offered rather than a request
-- that found no row.
create or replace function set_franchise_inquiry_handled(
  p_id uuid,
  p_handled boolean
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_changed integer;
begin
  -- `is not true` rather than `not`, and the difference is an authorization
  -- bypass rather than a style preference. is_admin() is
  -- `current_role_kind() = 'admin'`, and current_role_kind() selects from
  -- profiles, so a caller with NO profiles row (any signed-in customer) gets
  -- NULL rather than false. `if not null then` does not fire, so `not` let
  -- every customer straight through this guard. Reopening a lead sets
  -- handled_by_profile_id to null, which satisfies the foreign key that was
  -- accidentally catching them, so it would have worked.
  if public.is_admin() is not true then
    raise exception 'not authorized to triage franchise inquiries'
      using errcode = '42501';
  end if;

  if p_id is null or p_handled is null then
    return false;
  end if;

  update public.franchise_inquiries
  set
    handled_at = case when p_handled then now() else null end,
    -- Cleared alongside the timestamp. A row that is open again should not
    -- still name the person who closed it, or the next reader assumes they are
    -- the one dealing with it.
    handled_by_profile_id = case when p_handled then v_actor else null end
  where id = p_id;

  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Naming anon and authenticated explicitly is not belt and braces:
-- Supabase ships a default privilege that `revoke from public` does not touch,
-- and 327 passing tests once failed to notice that every function in this
-- schema was callable by anon. Handoff trap 14.
--
-- Granted to authenticated rather than to a narrower role because Postgres has
-- no "admin" role here: admin is a row in `profiles`, and the function checks
-- it. anon is not granted at all, so an unauthenticated caller cannot even
-- reach the check.
-- ---------------------------------------------------------------------------
revoke execute on function
  set_franchise_inquiry_handled(uuid, boolean) from public, anon, authenticated;

grant execute on function
  set_franchise_inquiry_handled(uuid, boolean) to authenticated;
