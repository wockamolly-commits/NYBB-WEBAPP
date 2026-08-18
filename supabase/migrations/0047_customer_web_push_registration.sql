-- 0047_customer_web_push_registration.sql
-- The customer half of notifications, on Web Push this time.
--
-- 0038 registered a customer device as an Expo push token, because the plan
-- then was a native app. The app was dropped on 2026-08-17 and its route went
-- with it, which left register_customer_push_device applied and unreachable.
-- This is its Web Push sibling: same authorization, different row shape.
--
-- The authorization is copied from 0042 deliberately rather than re-derived.
-- The tracking token authorizes, or the caller being the signed-in owner does,
-- the cast stays on the column so a malformed token is a miss rather than a
-- raise, and a terminal order is refused because it has nothing to announce.
-- Every refusal is the same false: the difference between them is worth
-- something to whoever is probing this.
--
-- WHAT IS NEW HERE, AND WHY IT IS NOT PARANOIA.
-- ===========================================================================
-- push_subscriptions is unique on endpoint and 0038's customer insert ends
-- `on conflict (endpoint) do update`. Until now no browser could call the
-- customer function, so that upsert could never meet a staff row. A browser
-- path makes it reachable: a staff member who opens their own order on the
-- counter tablet would rewrite that tablet's row to audience = 'customer'.
-- staff_push_targets filters on audience = 'staff', so the tablet would stop
-- being told about new orders, silently, on the one device the business cannot
-- afford to have go quiet. This function refuses a foreign endpoint instead.

create or replace function register_customer_push_subscription(
  p_short_code text,
  p_tracking_token text,
  p_endpoint text,
  p_p256dh text,
  p_auth_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth_key, ''));
  v_status public.order_status;
begin
  -- An empty token is not refused here. A signed-in owner with no token is a
  -- legitimate caller, and the lookup below gives an empty or malformed token
  -- a plain miss rather than a match. Both keys are required, because 0038's
  -- check constraint requires them for a web row.
  if v_code = '' or v_endpoint = '' or v_p256dh = '' or v_auth = '' then
    return false;
  end if;

  -- Refuse before touching the order: an endpoint already registered to
  -- another audience is not this customer's device to claim.
  if exists (
    select 1 from public.push_subscriptions s
    where s.endpoint = v_endpoint and s.audience <> 'customer'
  ) then
    return false;
  end if;

  select o.status into v_status
  from public.orders o
  where o.short_code = v_code
    and (
      o.tracking_token::text = v_token
      or (auth.uid() is not null and o.user_id = auth.uid())
    );

  if not found then
    return false;
  end if;

  if v_status in (
    'claimed'::public.order_status,
    'rejected'::public.order_status,
    'cancelled'::public.order_status,
    'no_show'::public.order_status
  ) then
    return false;
  end if;

  -- profile_id stays null: push_subscriptions_audience_target (0007) requires
  -- it to be null for a customer row.
  insert into public.push_subscriptions (
    audience, transport, endpoint, p256dh, auth_key, last_seen_at
  )
  values ('customer', 'web', v_endpoint, v_p256dh, v_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        last_seen_at = now();

  insert into public.push_subscription_orders (endpoint, order_code, last_seen_at)
  values (v_endpoint, v_code, now())
  on conflict (endpoint, order_code) do update set last_seen_at = now();

  return true;
end;
$$;

comment on function register_customer_push_subscription(text, text, text, text, text) is
  'Registers a browser push subscription against one order for its tracking-token '
  'holder or signed-in owner. Refuses an endpoint owned by another audience. '
  'Refusals are deliberately indistinguishable.';

-- Naming every role explicitly is not belt and braces. Supabase ships a
-- default privilege that `revoke from public` does not touch, and 327 passing
-- tests once failed to notice every function here was callable by anon.
-- Handoff trap 14. service_role is named in the revoke too: the dispatch path
-- reads push_subscriptions directly and has no reason to register one, so the
-- default grant it would otherwise keep is removed rather than left unused.
revoke execute on function
  register_customer_push_subscription(text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  register_customer_push_subscription(text, text, text, text, text)
  to anon, authenticated;
