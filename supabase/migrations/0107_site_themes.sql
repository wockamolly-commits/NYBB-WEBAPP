-- 0107_site_themes.sql
--
-- Seasonal themes: which look the public website wears, and who may change it.
--
-- WHAT A THEME IS.
--
-- A palette, some decoration and an optional banner and animation, picked from
-- a fixed list in lib/themes/presets.ts. It changes how the storefront looks
-- and never what it says: no menu row, price or page copy is touched by
-- anything here. That is why there is no draft step. The Workspace preview is
-- the safety net, and applying goes live at once.
--
-- WHY AN APPEND ONLY TABLE.
--
-- Each apply is a new row and the newest row is the live theme. A singleton
-- column on app_settings would have been one fewer table, but it would have
-- shared a table whose writes are governed by settings:manage, and it would
-- have kept no history beyond the audit log. Here the history IS the table:
-- "what did the site look like last Christmas" is a select.
--
-- WHY THE WRITE IS AN RPC AND NOT AN INSERT POLICY.
--
-- Every other staff write in this schema goes through a security definer
-- function that checks the permission, validates, writes and audits in one
-- transaction (0060, 0066). authenticated holds no insert grant on site_themes
-- at all, so a staff session holding settings:manage, menu:configure or any
-- other permission cannot reach the table directly. themes:manage is checked
-- inside admin_apply_site_theme and nowhere else matters.
--
-- WHY themes:manage IS NO ROLE'S DEFAULT.
--
-- The theme is the whole public site's face, every counter at once. No job
-- role gets it by default; the Super Admin has it implicitly (role = 'admin')
-- and hands it to a person with an override row from the Workspace access
-- panel. It is also business wide, for the same reason menu:configure is: a
-- manager pinned to one counter must not change what all of them look like.

-- ---------------------------------------------------------------------------
-- 1. The permission exists.
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
    'team:manage', 'refunds:manage', 'themes:manage'
  ]::text[])
$$;

create or replace function business_wide_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_permission = any(array['menu:configure', 'vouchers:manage', 'themes:manage']::text[])
$$;

-- ---------------------------------------------------------------------------
-- 2. The table.
--
-- Columns rather than one jsonb blob, so the database refuses a malformed
-- theme rather than storing it for parseTheme to throw away. The id list is
-- THEME_IDS in lib/themes/presets.ts; tests/unit/theme-presets.test.ts reads
-- this check back and fails if the two disagree.
--
-- banner_text is '' rather than null for "use the suggested text". An empty
-- string is a deliberate choice the person made in the form, not an absent
-- value, so it is stored as one (AGENTS.md rule 6 cuts both ways).
-- ---------------------------------------------------------------------------

create table site_themes (
  id bigserial primary key,
  theme_id text not null check (theme_id in (
    'default', 'new-year', 'sinulog', 'chinese-new-year', 'valentines',
    'summer', 'independence-day', 'back-to-school', 'halloween', 'christmas'
  )),
  banner_show boolean not null default false,
  banner_text text not null default '' check (char_length(banner_text) <= 140),
  effects boolean not null default true,
  applied_by uuid references profiles(id),
  applied_at timestamptz not null default now()
);

create index site_themes_latest_idx on site_themes (id desc);

alter table site_themes enable row level security;

-- No policies and no grants: nobody reads or writes this table directly. The
-- storefront reads through get_site_theme, the Workspace through
-- admin_get_site_theme, and the only write is admin_apply_site_theme.
revoke all on table site_themes from public, anon, authenticated;
revoke all on sequence site_themes_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The storefront's read.
--
-- Security definer for the reason get_public_settings is (0008): a public page
-- must not need a service role client to learn what colour it is. It hands
-- over the look and nothing about who chose it. No row yet is the everyday
-- look, answered here rather than left for every caller to remember.
-- ---------------------------------------------------------------------------

create or replace function get_site_theme()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'id', t.theme_id,
        'banner', jsonb_build_object('show', t.banner_show, 'text', t.banner_text),
        'effects', t.effects
      )
      from site_themes t
      order by t.id desc
      limit 1
    ),
    jsonb_build_object(
      'id', 'default',
      'banner', jsonb_build_object('show', false, 'text', ''),
      'effects', true
    )
  )
$$;

revoke execute on function get_site_theme() from public, anon, authenticated;
grant execute on function get_site_theme() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The Workspace's read: the live theme plus who applied it and when.
--
-- Named from the profile row here, inside the definer, because the profiles
-- read policy (0023) admits audit:view and not themes:manage, and a theme
-- manager must be able to see who put the current look up.
-- ---------------------------------------------------------------------------

create or replace function admin_get_site_theme()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row site_themes%rowtype;
  v_name text;
begin
  if not current_staff_has_permission('themes:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  select * into v_row from site_themes order by id desc limit 1;
  if not found then
    return null;
  end if;

  select p.display_name into v_name from profiles p where p.id = v_row.applied_by;

  return jsonb_build_object(
    'id', v_row.theme_id,
    'banner', jsonb_build_object('show', v_row.banner_show, 'text', v_row.banner_text),
    'effects', v_row.effects,
    'applied_at', v_row.applied_at,
    'applied_by', v_name
  );
end;
$$;

revoke execute on function admin_get_site_theme() from public, anon, authenticated;
grant execute on function admin_get_site_theme() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The write.
--
-- Takes the whole setting every time, the way admin_upsert_voucher takes the
-- whole voucher. The default theme is stored with its banner off whatever was
-- sent, so restoring the everyday look can never leave a banner behind.
--
-- Audited with a readable action: theme.apply or theme.restore, and the theme
-- id in target_id so the audit screen can name it. branch_id stays null, which
-- the audit read policy (0056) admits to a business wide session only: the
-- theme is the whole business's, and so is its trail.
-- ---------------------------------------------------------------------------

create or replace function admin_apply_site_theme(
  p_theme_id text,
  p_banner_show boolean,
  p_banner_text text,
  p_effects boolean
)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_before jsonb;
  v_id bigint;
  v_text text := coalesce(btrim(p_banner_text), '');
  v_show boolean := coalesce(p_banner_show, false);
begin
  if not current_staff_has_permission('themes:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_theme_id is null or p_effects is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if char_length(v_text) > 140 then
    raise exception 'BANNER_TOO_LONG' using errcode = 'P0001';
  end if;

  if p_theme_id = 'default' then
    v_show := false;
    v_text := '';
  end if;

  v_before := get_site_theme();

  begin
    insert into site_themes (theme_id, banner_show, banner_text, effects, applied_by)
    values (p_theme_id, v_show, v_text, p_effects, v_actor_id)
    returning id into v_id;
  exception when check_violation then
    raise exception 'UNKNOWN_THEME' using errcode = 'P0001';
  end;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when p_theme_id = 'default' then 'theme.restore' else 'theme.apply' end,
    'site_themes',
    p_theme_id,
    jsonb_build_object('before', v_before, 'after', get_site_theme())
  );

  return v_id;
end;
$$;

revoke execute on function admin_apply_site_theme(text, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function admin_apply_site_theme(text, boolean, text, boolean) to authenticated;
