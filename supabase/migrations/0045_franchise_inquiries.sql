-- 0045_franchise_inquiries.sql
-- The missing write path for franchise leads (spec N9).
--
-- NO NEW TABLE. `franchise_inquiries` has existed since 0008, thirty-seven
-- migrations before this one, and nothing has ever written to it. 0009 enabled
-- RLS on it, 0010 granted authenticated a select, and 0022 narrowed reads to
-- admin only. What was never built is the half that matters: a stranger on the
-- public site has no way to insert a row. There is no insert policy and no
-- insert grant, by design, because public writes in this schema go through a
-- SECURITY DEFINER function instead. This adds that function.
--
-- The lead is stored, and notification is a separate concern. There is no
-- mailer in this project: `app_settings.email_enabled` has been false since
-- 0008 and no provider is wired up. A design that only emailed would drop every
-- lead today and nobody would notice until somebody asked why the inquiries
-- stopped. The row is the record.

-- ---------------------------------------------------------------------------
-- Submission.
-- ---------------------------------------------------------------------------
--
-- Returns boolean rather than the row or its id. A lead id is of no use to the
-- browser that submitted it, and handing one back gives an enumeration target
-- for free.
--
-- Trimming and emptiness are re-checked here rather than trusted from the
-- caller. The app validates too, and says something useful when it refuses, but
-- this function is reachable by anon and its callers will not all be the form
-- we shipped.
--
-- `source_ip` and `user_agent` are left null deliberately, and this is a
-- decision rather than an oversight. 0008 provided the columns, but
-- `lib/rate-limit/address.ts` stores a HASH of an address precisely so that the
-- limiter cannot be turned back into a record of who visited. Writing a raw IP
-- onto a lead row would reverse that for no operational gain: nobody working a
-- franchise lead needs the inquirer's IP, and it is personal data that then has
-- to be justified, retained, and eventually deleted. If abuse ever makes them
-- necessary, add them with a retention rule rather than by default.
create or replace function submit_franchise_inquiry(
  p_name text,
  p_email text,
  p_phone text,
  p_city text default null,
  p_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_city text := nullif(btrim(coalesce(p_city, '')), '');
  v_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if v_name = '' or v_email = '' or v_phone = '' then
    return false;
  end if;

  -- Length guards. 0008 put no constraints on these columns, so without this a
  -- scripted caller can store megabytes per request. Refusing with the same
  -- false every other refusal returns keeps one shape for the caller to handle.
  if length(v_name) > 120
    or length(v_email) > 254
    or length(v_phone) > 40
    or (v_city is not null and length(v_city) > 160)
    or (v_message is not null and length(v_message) > 4000)
  then
    return false;
  end if;

  insert into public.franchise_inquiries (name, email, phone, city, message)
  values (v_name, v_email, v_phone, v_city, v_message);

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Naming anon and authenticated explicitly is not belt and braces:
-- Supabase ships a default privilege that `revoke from public` does not touch,
-- and 327 passing tests once failed to notice that every function in this
-- schema was callable by anon. Handoff trap 14.
--
-- Note what is NOT granted: insert on the table itself. The function is the
-- only write path, so the closed table grant from 0010 stays closed.
-- ---------------------------------------------------------------------------
revoke execute on function
  submit_franchise_inquiry(text, text, text, text, text) from public, anon, authenticated;

grant execute on function
  submit_franchise_inquiry(text, text, text, text, text) to anon, authenticated;
