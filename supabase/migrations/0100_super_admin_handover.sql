-- 0100: handing the Super Admin over in one step.
--
-- THE RISK.
--
-- The Super Admin is whoever SUPER_ADMIN_EMAIL names (lib/staff/access.ts).
-- Changing that variable stops the app from treating the old address as the
-- Super Admin on its next request, but the database never heard about it. The
-- old profile stayed role = 'admin' and is_active, so the old Super Admin's
-- still valid session could call PostgREST directly, with every right the
-- policies give an admin, until the NEW Super Admin happened to sign in and
-- provision_configured_super_admin (0022) switched the old profile off. If the
-- new one never signed in, the old one never lost access.
--
-- THE FIX, in three parts.
--
-- 1. super_admin_authority: the database's own record of which address is the
--    Super Admin. Service role only. Seeded below from the one active admin
--    profile there is today.
--
-- 2. hand_over_super_admin(new_email): the handover, as one transaction. It
--    records the new address, switches off every active admin profile that is
--    not that address, ends those accounts' Auth sessions so they cannot mint
--    a fresh token, and writes an audit row for each. Every admin check in
--    this schema goes through an active profile (current_role_kind, 0007;
--    current_staff_has_permission, 0060; current_staff_can_access_branch,
--    0037), so the old account loses its database rights the moment this
--    commits, even with an access token that has not expired yet. Nothing
--    waits for anybody to sign in. Run it with scripts/hand-over-super-admin.mjs.
--
-- 3. provision_configured_super_admin now refuses an address the authority
--    does not name. Without this the order of operations would matter: an old
--    deployment still carrying the old SUPER_ADMIN_EMAIL could let the old
--    Super Admin sign in after the handover and switch themselves back on.
--    With it, the database decides, and an environment variable changed
--    without a handover fails closed (nobody is Super Admin) rather than open.
--
-- The procedure is in docs/IMPLEMENTATION-PROMPT.md, section 13.

create table super_admin_authority (
  id smallint primary key default 1 check (id = 1),
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  updated_at timestamptz not null default now()
);

comment on table super_admin_authority is
  'The one address the database accepts as the Super Admin. Written by '
  'hand_over_super_admin only. Since 0100.';

alter table super_admin_authority enable row level security;
revoke all on super_admin_authority from public, anon, authenticated;
grant select on super_admin_authority to service_role;

-- Today's Super Admin, when there is exactly one. With none (a fresh project)
-- or several (which 0022 prevents), the table stays empty and provisioning
-- keeps its old behaviour until the first handover writes it.
insert into super_admin_authority (id, email)
select 1, lower(btrim(u.email))
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin' and p.is_active and u.email is not null
  and (select count(*) from public.profiles where role = 'admin' and is_active) = 1
on conflict (id) do nothing;

create or replace function hand_over_super_admin(p_new_email text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_email text := lower(btrim(coalesce(p_new_email, '')));
  v_new_id uuid;
  v_old public.profiles%rowtype;
  v_revoked int := 0;
  v_sessions_ended boolean := true;
begin
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  -- The same lock provisioning takes, so a sign-in and a handover cannot
  -- interleave.
  perform 1 from public.app_settings where id = 1 for update;

  insert into public.super_admin_authority (id, email, updated_at)
  values (1, v_email, now())
  on conflict (id) do update set email = excluded.email, updated_at = excluded.updated_at;

  select u.id into v_new_id from auth.users u where lower(u.email) = v_email;

  for v_old in
    select p.* from public.profiles p
    where p.role = 'admin'::public.user_role
      and p.is_active
      and p.id is distinct from v_new_id
    for update
  loop
    update public.profiles set is_active = false where id = v_old.id;
    insert into public.audit_logs (actor_profile_id, action, target_table, target_id, diff)
    values (
      null,
      'staff.super_admin_handed_over',
      'profiles',
      v_old.id::text,
      jsonb_build_object('before', jsonb_build_object('is_active', true),
                         'after', jsonb_build_object('is_active', false))
    );
    v_revoked := v_revoked + 1;

    -- Their refresh tokens go with their sessions, so no new access token can
    -- be minted. One already issued expires on its own (an hour at most) and
    -- is worthless meanwhile, because the profile above is no longer active.
    begin
      execute 'delete from auth.sessions where user_id = $1' using v_old.id;
    exception
      when undefined_table or insufficient_privilege then
        v_sessions_ended := false;
    end;
  end loop;

  return jsonb_build_object(
    'revoked', v_revoked,
    'sessionsEnded', v_sessions_ended,
    'newAdminHasAccount', v_new_id is not null
  );
end;
$$;

comment on function hand_over_super_admin(text) is
  'Makes the given address the only Super Admin, at once: records it, switches '
  'off every other active admin profile and ends their sessions. Service role '
  'only. Since 0100.';

revoke execute on function hand_over_super_admin(text) from public, anon, authenticated;
grant execute on function hand_over_super_admin(text) to service_role;

-- 0022's provisioning, unchanged except for the check against the authority.
create or replace function provision_configured_super_admin(
  p_user_id uuid,
  p_display_name text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_target_before public.profiles%rowtype;
  v_old public.profiles%rowtype;
  v_other_active int;
  v_name text;
  v_authority text;
  v_email text;
begin
  perform 1 from public.app_settings where id = 1 for update;

  -- Since 0100. Once a handover has named an address, no other address is
  -- provisioned, whatever SUPER_ADMIN_EMAIL says.
  select a.email into v_authority from public.super_admin_authority a where a.id = 1;
  if v_authority is not null then
    select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user_id;
    if v_email is distinct from v_authority then
      raise exception 'NOT_THE_SUPER_ADMIN' using errcode = 'P0001';
    end if;
  end if;

  select * into v_target_before
  from public.profiles
  where id = p_user_id;

  select count(*)::int into v_other_active
  from public.profiles
  where role = 'admin'::public.user_role
    and is_active
    and id <> p_user_id;

  if v_target_before.id is not null
     and v_target_before.role = 'admin'::public.user_role
     and v_target_before.staff_role is null
     and v_target_before.branch_id is null
     and v_target_before.is_active
     and v_other_active = 0 then
    return;
  end if;

  v_name := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(trim(v_target_before.display_name), ''),
    'Super Admin'
  );

  insert into public.profiles
    (id, role, staff_role, display_name, branch_id, is_active)
  values
    (p_user_id, 'admin', null, v_name, null, false)
  on conflict (id) do update set
    role = 'admin',
    staff_role = null,
    display_name = v_name,
    branch_id = null,
    is_active = false;

  for v_old in
    select * from public.profiles
    where role = 'admin'::public.user_role
      and is_active
      and id <> p_user_id
    for update
  loop
    update public.profiles set is_active = false where id = v_old.id;
    insert into public.audit_logs
      (actor_profile_id, action, target_table, target_id, diff)
    values (
      p_user_id,
      'staff.super_admin_revoked_by_configuration',
      'profiles',
      v_old.id::text,
      jsonb_build_object(
        'before', to_jsonb(v_old),
        'after', jsonb_build_object('is_active', false)
      )
    );
  end loop;

  update public.profiles set is_active = true where id = p_user_id;
  insert into public.audit_logs
    (actor_profile_id, action, target_table, target_id, diff)
  values (
    p_user_id,
    'staff.super_admin_bootstrapped',
    'profiles',
    p_user_id::text,
    jsonb_build_object(
      'before', case
        when v_target_before.id is null then null
        else to_jsonb(v_target_before)
      end,
      'after', jsonb_build_object(
        'role', 'admin',
        'staff_role', null,
        'branch_id', null,
        'is_active', true
      )
    )
  );
end;
$$;

revoke execute on function provision_configured_super_admin(uuid, text)
  from public, anon, authenticated;
grant execute on function provision_configured_super_admin(uuid, text) to service_role;
