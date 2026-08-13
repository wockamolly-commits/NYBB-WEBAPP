-- 0038_push_registration.sql
-- Registration for the two notification audiences.
--
-- No new tables. 0007 already created push_subscriptions and
-- push_subscription_orders for exactly this feature and nothing has written to
-- them since. The join table is the part worth keeping: it separates a device
-- from the orders that device is following, so a customer ordering twice in an
-- evening registers once and gains a row rather than registering again.
--
-- What 0007 could not know is that the customer half would stop being Web Push.
-- There is no customer web storefront now, so customers are notified in the
-- Expo app instead. An Expo push token is one string with no encryption keypair
-- of its own, so `transport` says which shape a row is and a check constraint
-- keeps the two from being mixed.

alter table push_subscriptions
  add column transport text not null default 'web'
    check (transport in ('web', 'expo'));

alter table push_subscriptions alter column p256dh drop not null;
alter table push_subscriptions alter column auth_key drop not null;

alter table push_subscriptions
  add constraint push_subscriptions_transport_keys check (
    (transport = 'web' and p256dh is not null and auth_key is not null)
    or (transport = 'expo' and p256dh is null and auth_key is null)
  );

comment on column push_subscriptions.transport is
  'web is a browser subscription with a keypair. expo is a native push token in '
  'endpoint, with no keypair, because Expo encrypts on its own leg.';

-- ---------------------------------------------------------------------------
-- Customer registration.
-- ---------------------------------------------------------------------------
--
-- The tracking token is checked here rather than in a route handler, for the
-- same reason get_order_by_tracking checks it here: one place decides who may
-- speak for an order. The cast is on the column so a malformed token is a miss
-- rather than a raise, which is the distinction 0014 refuses to blur.
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
  if v_code = '' or v_token = '' or v_expo = '' then
    return false;
  end if;
  if p_platform not in ('ios', 'android') then
    return false;
  end if;

  select o.status into v_status
  from public.orders o
  where o.short_code = v_code
    and o.tracking_token::text = v_token;

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

-- ---------------------------------------------------------------------------
-- Staff registration.
-- ---------------------------------------------------------------------------
create or replace function register_staff_push_subscription(
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
  v_profile uuid := auth.uid();
begin
  if v_profile is null then
    return false;
  end if;
  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth_key), '') = '' then
    return false;
  end if;

  -- orders:view is the right gate: being told an order exists is the same
  -- privilege as being allowed to see it. current_staff_has_permission is the
  -- resolver every policy reads, so this cannot drift from them.
  if not public.current_staff_has_permission('orders:view') then
    return false;
  end if;

  insert into public.push_subscriptions (
    audience, profile_id, transport, endpoint, p256dh, auth_key, last_seen_at
  )
  values ('staff', v_profile, 'web', p_endpoint, p_p256dh, p_auth_key, now())
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        last_seen_at = now();

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who to tell about a new order at a branch.
-- ---------------------------------------------------------------------------
create or replace function staff_push_targets(p_branch_id uuid)
returns table (endpoint text, p256dh text, auth_key text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.endpoint, s.p256dh, s.auth_key
  from public.push_subscriptions s
  where s.audience = 'staff'
    and s.transport = 'web'
    and s.profile_id is not null
    and public.staff_can_access_branch(s.profile_id, p_branch_id)
$$;

-- ---------------------------------------------------------------------------
-- Grants. Naming anon and authenticated explicitly is not belt and braces:
-- Supabase ships a default privilege that `revoke from public` does not touch,
-- and 327 passing tests once failed to notice that every function in this
-- schema was callable by anon. Handoff trap 14.
-- ---------------------------------------------------------------------------
revoke execute on function
  register_customer_push_device(text, text, text, text) from public, anon, authenticated;
revoke execute on function
  register_staff_push_subscription(text, text, text) from public, anon, authenticated;
revoke execute on function
  staff_push_targets(uuid) from public, anon, authenticated;

grant execute on function
  register_customer_push_device(text, text, text, text) to anon, authenticated;
grant execute on function
  register_staff_push_subscription(text, text, text) to authenticated;
grant execute on function staff_push_targets(uuid) to service_role;
