-- 0079_promo_push_status.sql
--
-- Two corrections to promo push (0075), both found by looking at the customer
-- side of it.
--
-- 1. A BROWSER CAN NOW ASK WHETHER IT IS OPTED IN.
-- The promos page could not tell a device that had opted in from one that had
-- not, so every reload showed the switch as off and invited a second tap. The
-- page was right to refuse to infer consent from the browser's own state (a
-- push subscription made for an order is not consent to marketing), but the
-- consent row itself is the truth, and asking for it is not an inference.
--
-- The question is keyed by endpoint and answers only yes or no. An endpoint is
-- an unguessable URL minted by the browser's push service, so whoever can ask
-- about one already holds the device. Nothing else about the row is returned.
--
-- 2. A PROMO CANNOT BE ANNOUNCED BEFORE IT STARTS.
-- claim_promo_announcement tested publicise, is_active and the expiry but not
-- starts_at, so a code scheduled for next week could be pushed today. The
-- notification says a promo has started and opens the promos page, where a
-- not-yet-started code is not listed, so a customer would tap through to find
-- nothing. The start joins the other conditions inside the same update, for
-- the reason 0075 gives: a check made before the write is a decision made on
-- a row that can change before it lands.

-- ---------------------------------------------------------------------------
-- 1. Is this browser opted in?
-- ---------------------------------------------------------------------------
create or replace function promo_push_optin_status(p_endpoint text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.push_promo_optins o
    join public.push_subscriptions s on s.endpoint = o.endpoint
    where o.endpoint = btrim(coalesce(p_endpoint, ''))
      and s.audience = 'customer'
  )
$$;

comment on function promo_push_optin_status(text) is
  'True when this browser endpoint has opted in to promo notifications. '
  'Answers yes or no and nothing else, so the promos page can show the truth '
  'after a reload instead of guessing from the browser''s own state.';

revoke execute on function promo_push_optin_status(text)
  from public, anon, authenticated, service_role;
grant execute on function promo_push_optin_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Announcing waits for the start.
-- ---------------------------------------------------------------------------
create or replace function claim_promo_announcement(p_voucher_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claimed boolean;
begin
  if p_voucher_id is null then
    return false;
  end if;

  update public.vouchers
     set announced_at = now()
   where id = p_voucher_id
     and announced_at is null
     and publicise
     and is_active
     and (starts_at is null or starts_at <= now())
     and (expires_at is null or expires_at > now())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

comment on function claim_promo_announcement(uuid) is
  'Claims the right to announce one promo, once. True means the caller holds '
  'it and should send. False means it was already announced, or is not '
  'publicised, switched on, started and unexpired. Every refusal is the same '
  'false.';

-- create or replace keeps existing grants, but they are restated so this file
-- reads complete on its own, as 0075 does.
revoke execute on function claim_promo_announcement(uuid)
  from public, anon, authenticated, service_role;
grant execute on function claim_promo_announcement(uuid) to service_role;
