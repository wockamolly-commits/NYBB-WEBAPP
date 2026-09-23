-- 0075_promo_push_optin.sql
--
-- Telling somebody about a promo, which is a different kind of consent to
-- telling them their food is ready.
--
-- WHY THIS IS NOT A COLUMN ON push_subscriptions. The customer half of that
-- table exists because somebody asked to be told about one order, and
-- push_subscription_orders (0007) records which orders. Marketing is not that.
-- A person who wants to know when their wings are ready has not asked to hear
-- about a discount next Tuesday, and the moment those two facts share a row
-- they become one setting that some later change will flip together. A
-- separate table makes the two consents independently grantable and
-- independently revocable, and makes unsubscribing from promos a delete that
-- cannot touch anybody's order notifications.
--
-- WHY A SEPARATE REGISTRATION. register_customer_push_subscription (0047)
-- takes a short code and a tracking token, because the subscription it creates
-- is about that order. Somebody reading the promos page may never have ordered
-- at all, so there is no code to present, and a marketing subscription that
-- required one would be unavailable to exactly the people an advert is for.
--
-- THE AUDIENCE GUARD IS COPIED FROM 0047 ON PURPOSE. That migration exists
-- because a counter tablet registering as a customer rewrote its own row and
-- fell out of staff_push_targets, silencing the kitchen. Any new function that
-- writes push_subscriptions has to repeat the check or it reopens the hole.

-- ---------------------------------------------------------------------------
-- 1. The consent.
-- ---------------------------------------------------------------------------
create table push_promo_optins (
  endpoint text primary key
    references push_subscriptions(endpoint) on delete cascade,
  opted_in_at timestamptz not null default now()
);

comment on table push_promo_optins is
  'Endpoints that asked to hear about promos. Deliberately separate from '
  'push_subscription_orders: order updates and marketing are two consents, '
  'and revoking one must never revoke the other. The cascade means losing a '
  'device drops its marketing consent with it.';

alter table push_promo_optins enable row level security;

-- No policy for anon or authenticated, so no browser reads this table. The
-- three functions below are the whole interface, and the send path reads it
-- as its own definer.
revoke all on push_promo_optins from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Opting in, which may have to create the subscription first.
-- ---------------------------------------------------------------------------
create or replace function register_promo_push_subscription(
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
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh   text := btrim(coalesce(p_p256dh, ''));
  v_auth     text := btrim(coalesce(p_auth_key, ''));
begin
  if v_endpoint = '' or v_p256dh = '' or v_auth = '' then
    return false;
  end if;

  -- Fails closed on the flag, like every other door into this engine.
  -- Consent to be told about something that cannot exist is consent nobody
  -- can honour, and a subscriber list gathered while the engine was dark
  -- would be a list of people who agreed to an offer the shop was not making.
  if not (
    select coalesce(a.vouchers_enabled, false)
    from public.app_settings a where a.id = 1
  ) then
    return false;
  end if;

  -- 0047's guard, repeated because this is a second write path into the same
  -- table. An endpoint already registered to another audience is a counter
  -- tablet, and it is not this caller's to claim: taking it would drop that
  -- tablet out of staff_push_targets and the kitchen would stop being told
  -- about orders. Refusing is correct and the caller is told nothing useful.
  if exists (
    select 1 from public.push_subscriptions s
    where s.endpoint = v_endpoint and s.audience <> 'customer'
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
        last_seen_at = now()
  where push_subscriptions.audience = 'customer';

  -- Re-opting in is not an error and does not move the date. The timestamp
  -- records when consent was first given, which is the thing worth keeping.
  insert into public.push_promo_optins (endpoint)
  values (v_endpoint)
  on conflict (endpoint) do nothing;

  return true;
end;
$$;

comment on function register_promo_push_subscription(text, text, text) is
  'Registers a browser for promo notifications and records the consent. '
  'Refuses an endpoint belonging to the staff audience. True means the '
  'browser is now opted in.';

-- ---------------------------------------------------------------------------
-- 3. Opting out, which must leave order notifications alone.
-- ---------------------------------------------------------------------------
--
-- It deletes the consent, never the subscription. Somebody who turns promos
-- off while waiting on an order still wants to know when it is ready, and a
-- function that tidied up the subscription row would take that away without
-- being asked.
create or replace function forget_promo_push_subscription(p_endpoint text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
begin
  if v_endpoint = '' then
    return false;
  end if;

  delete from public.push_promo_optins where endpoint = v_endpoint;

  -- True whether or not a row was there. The caller asked to not be
  -- subscribed and afterwards they are not, so reporting failure for an
  -- already-absent row would make a retry look broken.
  return true;
end;
$$;

comment on function forget_promo_push_subscription(text) is
  'Drops one browser promo consent. Leaves push_subscriptions and any order '
  'follows untouched, because those are a different consent.';

-- ---------------------------------------------------------------------------
-- 4. Who to send to.
-- ---------------------------------------------------------------------------
create or replace function promo_push_targets()
returns table (endpoint text, p256dh text, auth_key text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.endpoint, s.p256dh, s.auth_key
  from public.push_subscriptions s
  join public.push_promo_optins o on o.endpoint = s.endpoint
  where s.audience = 'customer'
    and s.transport = 'web'
$$;

-- ---------------------------------------------------------------------------
-- 5. Announcing one promo, exactly once.
-- ---------------------------------------------------------------------------
--
-- The same device and the same reasoning as claim_staff_new_order_notice
-- (0048): the guard is the `where`, because a read followed by a write is two
-- statements with a gap in between, and a second caller arriving in that gap
-- blocks on the row, re-reads it, finds the timestamp set and updates nothing.
--
-- It matters more here than it does for an order. A counter cannot tell a
-- duplicate alert from a second order; a customer receiving the same promo
-- twice on their lock screen can tell perfectly well, and it reads as a shop
-- that does not know what it is doing. Staff will retry the button.
alter table vouchers add column announced_at timestamptz;

comment on column vouchers.announced_at is
  'When this promo was pushed to subscribers. Written only by '
  'claim_promo_announcement, which is what makes that sending exactly once. '
  'Null means it has never been announced, which is the normal state: '
  'publicising a code and announcing it are two deliberate acts.';

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

  -- The publicise and is_active tests are part of the claim rather than a
  -- check the caller makes first, for the same reason the timestamp test is:
  -- anything evaluated before the update is a decision made on a row that can
  -- change before the write lands. A promo that was unpublicised a moment ago
  -- must not be announced by a request already in flight.
  update public.vouchers
     set announced_at = now()
   where id = p_voucher_id
     and announced_at is null
     and publicise
     and is_active
     and (expires_at is null or expires_at > now())
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

comment on function claim_promo_announcement(uuid) is
  'Claims the right to announce one promo, once. True means the caller holds '
  'it and should send. False means it was already announced, or is not '
  'publicised, switched on and unexpired. Every refusal is the same false.';

-- ---------------------------------------------------------------------------
-- 6. Grants.
-- ---------------------------------------------------------------------------
--
-- Every role named explicitly rather than left to `revoke from public`.
-- Supabase ships a default privilege granting EXECUTE to anon that a revoke
-- from public does not touch, which is Handoff trap 14 and the reason 0038 and
-- 0047 both spell this out.
revoke execute on function
  register_promo_push_subscription(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function
  register_promo_push_subscription(text, text, text)
  to anon, authenticated;

revoke execute on function
  forget_promo_push_subscription(text)
  from public, anon, authenticated, service_role;
grant execute on function
  forget_promo_push_subscription(text)
  to anon, authenticated;

-- The send path only. A browser has no business reading the subscriber list,
-- and no business deciding a promo has been announced: claiming it first would
-- let anyone keep an advert from ever going out.
revoke execute on function promo_push_targets()
  from public, anon, authenticated, service_role;
grant execute on function promo_push_targets() to service_role;

revoke execute on function claim_promo_announcement(uuid)
  from public, anon, authenticated, service_role;
grant execute on function claim_promo_announcement(uuid) to service_role;
