-- 0108_site_content.sql
--
-- Editable page content: the landing page's copy, About, the Privacy Policy
-- and the Terms of Service, edited from /workspace/content.
--
-- WHAT IS STORED.
--
-- One jsonb body per page, shaped by lib/content/schema.ts. The database
-- checks that it is an object of a sane size and leaves the shape to the
-- application, which parses every body it reads and falls back to the
-- built-in text (lib/content/defaults.ts) for anything it cannot read. The
-- page list is checked here, so a body can never be filed under a page the
-- site does not have.
--
-- DRAFT, THEN PUBLISH. Unlike a seasonal theme (0107), which changes how the
-- site looks, this changes what it says, including a legal notice. So edits
-- are saved to a private draft first, previewed on the real page design, and
-- only then published.
--
--   site_page_drafts     one row per page at most: the work in progress.
--   site_page_versions   append only: every publish is a new row and the
--                        newest per page is live. A null body is "the
--                        built-in text", which is how "restore the original"
--                        is recorded without deleting history.
--
-- WHY RPCs AND NO GRANTS. The pattern of 0060, 0066 and 0107: every write is
-- a security definer function that checks the permission, validates, writes
-- and audits in one transaction. No role holds any privilege on either table.
--
-- WHY content:manage IS NO ROLE'S DEFAULT AND IS BUSINESS WIDE. The pages are
-- the whole business's public voice and its legal notices. No job role gets
-- it; the Super Admin has it implicitly and grants it to a person from the
-- Workspace access panel. A manager pinned to one counter must not be able to
-- rewrite the Privacy Policy for all of them.

-- ---------------------------------------------------------------------------
-- 1. The permission exists, and acts on the whole business.
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
    'team:manage', 'refunds:manage', 'themes:manage', 'content:manage'
  ]::text[])
$$;

create or replace function business_wide_permission(p_permission text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_permission = any(array[
    'menu:configure', 'vouchers:manage', 'themes:manage', 'content:manage'
  ]::text[])
$$;

-- ---------------------------------------------------------------------------
-- 2. The tables.
-- ---------------------------------------------------------------------------

create or replace function site_content_page(p_page text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select p_page = any(array['home', 'about', 'privacy', 'terms']::text[])
$$;

-- A check constraint helper, not an API. Supabase's default privileges grant
-- every new function to anon; this one has no business on the public surface.
revoke execute on function site_content_page(text) from public, anon, authenticated;

create table site_page_versions (
  id bigserial primary key,
  page text not null check (site_content_page(page)),
  body jsonb check (
    body is null or (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144)
  ),
  published_by uuid references profiles(id),
  published_at timestamptz not null default now()
);

create index site_page_versions_latest_idx on site_page_versions (page, id desc);

create table site_page_drafts (
  page text primary key check (site_content_page(page)),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144),
  saved_by uuid references profiles(id),
  saved_at timestamptz not null default now()
);

alter table site_page_versions enable row level security;
alter table site_page_drafts enable row level security;

revoke all on table site_page_versions from public, anon, authenticated;
revoke all on table site_page_drafts from public, anon, authenticated;
revoke all on sequence site_page_versions_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The storefront's read: the live body of one page, or null for "use the
--    built-in text". Never the draft, never who wrote it.
-- ---------------------------------------------------------------------------

create or replace function get_site_page(p_page text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select v.body
  from site_page_versions v
  where v.page = p_page
  order by v.id desc
  limit 1
$$;

revoke execute on function get_site_page(text) from public, anon, authenticated;
grant execute on function get_site_page(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The Workspace's reads: live and draft, with names and times.
--
-- Names are read from profiles inside the definer for the reason 0107 gives:
-- the profiles read policy admits audit:view, not content:manage.
-- ---------------------------------------------------------------------------

create or replace function site_page_state(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_version site_page_versions%rowtype;
  v_draft site_page_drafts%rowtype;
begin
  select * into v_version from site_page_versions where page = p_page order by id desc limit 1;
  select * into v_draft from site_page_drafts where page = p_page;

  return jsonb_build_object(
    'page', p_page,
    'published', v_version.body,
    'published_at', v_version.published_at,
    'published_by', (select display_name from profiles where id = v_version.published_by),
    'draft', v_draft.body,
    'draft_saved_at', v_draft.saved_at,
    'draft_saved_by', (select display_name from profiles where id = v_draft.saved_by)
  );
end;
$$;

-- Internal: reachable only through the two checked readers below.
revoke execute on function site_page_state(text) from public, anon, authenticated;

create or replace function admin_get_site_page(p_page text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_staff_has_permission('content:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_page is null or not site_content_page(p_page) then
    raise exception 'UNKNOWN_PAGE' using errcode = 'P0001';
  end if;
  return site_page_state(p_page);
end;
$$;

revoke execute on function admin_get_site_page(text) from public, anon, authenticated;
grant execute on function admin_get_site_page(text) to authenticated;

create or replace function admin_list_site_pages()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_staff_has_permission('content:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return (
    select jsonb_agg(site_page_state(p) order by ord)
    from unnest(array['home', 'about', 'privacy', 'terms']::text[]) with ordinality as t(p, ord)
  );
end;
$$;

revoke execute on function admin_list_site_pages() from public, anon, authenticated;
grant execute on function admin_list_site_pages() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The writes.
-- ---------------------------------------------------------------------------

create or replace function site_content_guard(p_page text, p_body jsonb, p_body_required boolean)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not current_staff_has_permission('content:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_page is null or not site_content_page(p_page) then
    raise exception 'UNKNOWN_PAGE' using errcode = 'P0001';
  end if;
  if p_body_required and (p_body is null or jsonb_typeof(p_body) <> 'object') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_body is not null and octet_length(p_body::text) > 262144 then
    raise exception 'TOO_LARGE' using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function site_content_guard(text, jsonb, boolean) from public, anon, authenticated;

-- Save the work in progress. Not audited: a draft is private to the
-- Workspace and changes nothing a visitor sees. Publishing is the audited act.
create or replace function admin_save_site_page_draft(p_page text, p_body jsonb)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform site_content_guard(p_page, p_body, true);

  insert into site_page_drafts (page, body, saved_by, saved_at)
  values (p_page, p_body, auth.uid(), now())
  on conflict (page) do update
    set body = excluded.body, saved_by = excluded.saved_by, saved_at = excluded.saved_at;
end;
$$;

revoke execute on function admin_save_site_page_draft(text, jsonb) from public, anon, authenticated;
grant execute on function admin_save_site_page_draft(text, jsonb) to authenticated;

create or replace function admin_discard_site_page_draft(p_page text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform site_content_guard(p_page, null, false);
  delete from site_page_drafts where page = p_page;
end;
$$;

revoke execute on function admin_discard_site_page_draft(text) from public, anon, authenticated;
grant execute on function admin_discard_site_page_draft(text) to authenticated;

-- Publish a body, or with p_body null restore the built-in text. Either way the
-- draft is cleared, since it has either just gone live or just been abandoned
-- in favour of the original.
--
-- Audited with the page in target_id and the new version id in the diff. The
-- body itself is not copied into the audit row: it can be tens of kilobytes,
-- and site_page_versions already holds every published body by that id.
-- branch_id stays null, so only a business wide session reads the trail
-- (0056), the same as the theme's.
create or replace function admin_publish_site_page(p_page text, p_body jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_actor_id uuid := auth.uid();
  v_previous bigint;
  v_id bigint;
begin
  perform site_content_guard(p_page, p_body, false);
  if p_body is not null and jsonb_typeof(p_body) <> 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select id into v_previous from site_page_versions where page = p_page order by id desc limit 1;

  insert into site_page_versions (page, body, published_by)
  values (p_page, p_body, v_actor_id)
  returning id into v_id;

  delete from site_page_drafts where page = p_page;

  insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
  values (
    v_actor_id,
    case when p_body is null then 'content.restore' else 'content.publish' end,
    'site_page_versions',
    p_page,
    jsonb_build_object('page', p_page, 'version', v_id, 'previous_version', v_previous)
  );

  return v_id;
end;
$$;

revoke execute on function admin_publish_site_page(text, jsonb) from public, anon, authenticated;
grant execute on function admin_publish_site_page(text, jsonb) to authenticated;
