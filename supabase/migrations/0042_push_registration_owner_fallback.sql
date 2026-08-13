-- 0042_push_registration_owner_fallback.sql
-- Give register_customer_push_device the owner fallback its siblings already have.
--
-- 0038 checked only the tracking token, and required one to be non-empty
-- before it would even look at the order. get_order_by_tracking (0014) and
-- customer_mark_order_arrived (0029) both authorize the same order two ways:
-- the tracking token, or the caller being its signed-in owner. 0038 was meant
-- to follow that rule and did not, which means a signed-in customer with no
-- tracking token (the shape account history in docs/mobile-app-transition.md
-- will eventually hand them) could never register a device at all, and would
-- be told the same generic failure a wrong token gets, with nothing to tell
-- the two apart.
--
-- Postgres cannot amend a function body in place, and this project's
-- migrations are forward-only, so this restates register_customer_push_device
-- whole, copied from 0038, changing only the order lookup.

create or replace function register_customer_push_device(
  p_short_code text,
  p_tracking_token text,
  p_expo_token text,
  p_platform text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_expo text := btrim(coalesce(p_expo_token, ''));
  v_status public.order_status;
begin
  -- An empty token is no longer refused here. A signed-in owner with no
  -- token at all is a legitimate caller now, and the lookup below already
  -- gives an empty or malformed token a plain miss rather than a match.
  if v_code = '' or v_expo = '' then
    return false;
  end if;
  if p_platform not in ('ios', 'android') then
    return false;
  end if;

  select o.status into v_status
  from public.orders o
  where o.short_code = v_code
    and (
      -- The cast is on the column rather than on the input, so a malformed
      -- token is a miss rather than a raise, the same distinction 0014 and
      -- 0029 refuse to blur.
      o.tracking_token::text = v_token
      -- Or the customer's own session. Written for the same reason 0014 and
      -- 0029 carry it: a signed-in customer registering a device against an
      -- order they are looking at through their own history has no tracking
      -- token to send, and should not need one.
      or (auth.uid() is not null and o.user_id = auth.uid())
    );

  if not found then
    return false;
  end if;

  -- A collected, refused or cancelled order has nothing left to announce, and
  -- registering against one would leave a row that only ever gets swept.
  if v_status in (
    'claimed'::public.order_status,
    'rejected'::public.order_status,
    'cancelled'::public.order_status,
    'no_show'::public.order_status
  ) then
    return false;
  end if;

  insert into public.push_subscriptions (audience, transport, endpoint, last_seen_at)
  values ('customer', 'expo', v_expo, now())
  on conflict (endpoint) do update set last_seen_at = now();

  insert into public.push_subscription_orders (endpoint, order_code, last_seen_at)
  values (v_expo, v_code, now())
  on conflict (endpoint, order_code) do update set last_seen_at = now();

  return true;
end;
$$;

comment on function register_customer_push_device(text, text, text, text) is
  'Registers an Expo push token against one order for its tracking-token '
  'holder or signed-in owner. Refusals are deliberately indistinguishable.';

-- Re-applied exactly as 0038 has them. CREATE OR REPLACE keeps the existing
-- grants on an unchanged signature, but stating them again keeps this
-- migration readable on its own rather than relying on that.
revoke execute on function
  register_customer_push_device(text, text, text, text) from public, anon, authenticated;
grant execute on function
  register_customer_push_device(text, text, text, text) to anon, authenticated;
