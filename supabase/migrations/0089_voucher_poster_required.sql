-- 0089_voucher_poster_required.sql
--
-- Every new promo code has a poster, from the moment it exists.
--
-- Until now the poster was optional (0077) and arrived second: the workspace
-- created the code with admin_upsert_voucher, then attached the artwork with
-- admin_set_voucher_poster as a separate call. A poster that failed to upload
-- left a live code with no artwork, and a code ticked to show on the
-- storefront went out as a plain card with nothing in the popup.
--
-- The rule from 2026-10-16 is that a code is not created without its poster. So creating moves to its own function, admin_create_voucher, which
-- takes the terms and the poster together and writes both in one transaction:
-- if either is refused, neither is written. admin_upsert_voucher keeps every
-- edit it ever did and refuses only the create it no longer owns, so a staff
-- session calling the RPC directly cannot step around the rule either.
--
-- And a poster can be replaced but no longer taken off. A required field that
-- can be emptied the next minute is not required. Codes made before this
-- migration that never had a poster keep working exactly as they did, and can
-- be given one at any time.
--
-- WHY RENAME RATHER THAN RESTATE. admin_upsert_voucher's body (0073) is the
-- longest function in the voucher engine, and restating it to add three lines
-- at the top would be a second copy for somebody to keep in step. Renaming
-- keeps the body byte for byte, keeps its own permission check, and moves it
-- behind wrappers that only add the new rule. The same for the poster setter.
-- The renamed functions lose every grant, so nothing reaches them except the
-- wrappers below, which run as their owner.

-- ---------------------------------------------------------------------------
-- 1. The unchecked bodies, renamed out of reach.
-- ---------------------------------------------------------------------------

alter function admin_upsert_voucher(jsonb) rename to voucher_upsert_unchecked;
alter function admin_set_voucher_poster(uuid, text, integer, integer, text)
  rename to voucher_set_poster_unchecked;

-- service_role named for the reason 0073 gives.
revoke execute on function voucher_upsert_unchecked(jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function voucher_set_poster_unchecked(uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Editing a code. Creating one is no longer this function's job.
-- ---------------------------------------------------------------------------

create or replace function admin_upsert_voucher(p_voucher jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  -- First, so somebody without the permission is told that rather than
  -- being told about a poster they could never have attached.
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_voucher is not null
     and jsonb_typeof(p_voucher) = 'object'
     and nullif(p_voucher->>'id', '') is null then
    raise exception 'POSTER_REQUIRED' using errcode = 'P0001';
  end if;

  return voucher_upsert_unchecked(p_voucher);
end;
$$;

revoke execute on function admin_upsert_voucher(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function admin_upsert_voucher(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Creating a code, with its poster, in one transaction.
-- ---------------------------------------------------------------------------

-- p_poster is {"url", "width", "height", "blur"}, the four columns 0077 added.
-- Missing altogether is POSTER_REQUIRED. Present but malformed is INVALID_INPUT,
-- raised by the setter's own checks (bucket url, positive size, data: blur),
-- which this does not restate.
create or replace function admin_create_voucher(p_voucher jsonb, p_poster jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id     uuid;
  v_width  text;
  v_height text;
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  if p_voucher is null or jsonb_typeof(p_voucher) is distinct from 'object' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  -- An id means an edit, and edits go through admin_upsert_voucher.
  if nullif(p_voucher->>'id', '') is not null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  if p_poster is null
     or jsonb_typeof(p_poster) is distinct from 'object'
     or nullif(p_poster->>'url', '') is null then
    raise exception 'POSTER_REQUIRED' using errcode = 'P0001';
  end if;

  -- Checked as text before the cast, so a stray string is a named refusal
  -- rather than a cast error the screen cannot word.
  v_width := p_poster->>'width';
  v_height := p_poster->>'height';
  if v_width is null or v_width !~ '^[0-9]{1,6}$'
     or v_height is null or v_height !~ '^[0-9]{1,6}$' then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_id := voucher_upsert_unchecked(p_voucher);

  perform voucher_set_poster_unchecked(
    v_id,
    p_poster->>'url',
    v_width::integer,
    v_height::integer,
    p_poster->>'blur'
  );

  return v_id;
end;
$$;

revoke execute on function admin_create_voucher(jsonb, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function admin_create_voucher(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Replacing a poster. Taking one off is no longer possible.
-- ---------------------------------------------------------------------------

create or replace function admin_set_voucher_poster(
  p_voucher_id uuid,
  p_url        text,
  p_width      integer,
  p_height     integer,
  p_blur       text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not current_staff_has_permission('vouchers:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- All four null was 0077's way of clearing the poster.
  if p_url is null and p_width is null and p_height is null and p_blur is null then
    raise exception 'POSTER_REQUIRED' using errcode = 'P0001';
  end if;

  perform voucher_set_poster_unchecked(p_voucher_id, p_url, p_width, p_height, p_blur);
end;
$$;

revoke execute on function admin_set_voucher_poster(uuid, text, integer, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function admin_set_voucher_poster(uuid, text, integer, integer, text)
  to authenticated;
