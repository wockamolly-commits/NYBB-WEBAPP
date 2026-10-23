-- 0094: database functions that the site rate limits, and a direct call did not.
--
-- The anon key ships to every browser, so anything granted to anon can be
-- called straight at /rest/v1/rpc/..., past the address limits the Server
-- Actions apply. 0088 closed that for the franchise form. This does the same
-- for two more:
--
--   preview_voucher. Unlimited guessing of promo codes, and its refusals told
--   a caller whether a phone number was on a restricted list or had already
--   redeemed a code. Guests now reach it only through the Server Action on the
--   service role. Signed-in customers still call it as themselves, because a
--   personal code needs to recognise them, and are limited per account here.
--   It also now refuses a code that would take an online total below a peso,
--   the floor place_order applies, so the preview cannot approve a code the
--   placement refuses.
--
--   register_promo_push_subscription. Anyone could register any number of
--   subscriptions to any https URL, and announcing a promo POSTs to every one
--   of them. Service role only now, and only browser push service hosts.
--
-- place_order stays callable by anon: it is how a guest's identity-free order
-- reaches the database, and the signed-in path needs auth.uid(). 0090 bounds
-- what a direct caller can hold per phone number instead.

-- The push services browsers actually use. A subscription endpoint is minted
-- by the browser, so a legitimate one is always on one of these hosts.
create or replace function is_browser_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    p_endpoint ~ '^https://(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/',
    false
  )
$$;

revoke execute on function is_browser_push_endpoint(text) from public, anon, authenticated;

create or replace function preview_voucher(
  p_code text,
  p_branch_slug text,
  p_lines jsonb,
  p_phone text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_settings      app_settings%rowtype;
  v_branch_id     uuid;
  v_branch        branches%rowtype;
  v_price_list_id uuid;
  v_code          text;
  v_digits        text;
  v_voucher_id    uuid;
  v_expected      int;
  v_priced        int;
  v_subtotal      bigint;
  v_eligible      bigint;
  v_verdict       jsonb;
begin
  -- A signed-in customer calls this as themselves, so a personal code can
  -- recognise them, and is limited here, per account, because PostgREST does
  -- not tell Postgres who connected. A guest has no account to count against,
  -- so guests reach this only through the Server Action on the service role,
  -- after its address limit (0094 revokes anon). Fails open like 0008 says
  -- every limiter here does.
  if auth.uid() is not null then
    begin
      if not rate_limit_hit('preview_voucher:user:' || auth.uid()::text, 60, 60) then
        return jsonb_build_object('ok', false, 'reason', 'RATE_LIMITED');
      end if;
    exception
      when others then null;
    end;
  end if;

  v_code := nullif(upper(left(btrim(coalesce(p_code, '')), 40)), '');
  if v_code is null then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NOT_FOUND');
  end if;

  -- The flag is the authority, exactly as it is in place_order. A preview that
  -- worked while the engine was dark would put a discount on screen that the
  -- placement then refuses.
  select * into v_settings from app_settings where id = 1;
  if not coalesce(v_settings.vouchers_enabled, false) then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHERS_DISABLED');
  end if;

  v_branch_id := resolve_pickup_branch_id(nullif(p_branch_slug, ''));
  if v_branch_id is null then
    return jsonb_build_object('ok', false, 'reason', 'NO_BRANCH');
  end if;
  select * into v_branch from branches where id = v_branch_id;
  v_price_list_id := resolve_price_list_id(v_branch.slug);

  v_digits := normalize_phone_digits(p_phone);

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'EMPTY_CART');
  end if;
  v_expected := jsonb_array_length(p_lines);

  -- Looked up before the pricing because the scope tables decide which lines
  -- count. A code that does not exist leaves this null, the eligible total
  -- comes out as the whole order, and resolve_voucher refuses it on rule 1
  -- anyway, which keeps the refusal in one place.
  select id into v_voucher_id from vouchers where upper(code) = v_code;

  with input as (
    select
      l.value->>'item_slug' as item_slug,
      l.value->>'variation_slug' as variation_slug,
      nullif(l.value->>'qty', '')::int as qty,
      coalesce(l.value->'options', '[]'::jsonb) as options
    from jsonb_array_elements(p_lines) as l(value)
  ),
  -- The same is_active filters get_storefront_menu and place_order apply, on
  -- every level including the category. A line this drops is a line the cart
  -- screen is about to reconcile away.
  resolved as (
    select mi.id as item_id, mi.category_id, iv.id as variation_id, i.qty, i.options
    from input i
    join menu_items mi on mi.slug = i.item_slug and mi.is_active
    join menu_categories mc on mc.id = mi.category_id and mc.is_active
    join item_variations iv
      on iv.item_id = mi.id and iv.slug = i.variation_slug and iv.is_active
    where i.qty is not null and i.qty > 0
  ),
  priced as (
    select
      r.item_id,
      r.category_id,
      (
        resolve_variation_price_cents(r.variation_id, v_price_list_id)
        + coalesce((
            select sum(resolve_option_price_cents(mo.id, r.variation_id, v_price_list_id))
            from jsonb_array_elements(r.options) as o(value)
            join menu_option_groups mog
              on mog.slug = o.value->>'group_slug' and mog.is_active
            join menu_options mo
              on mo.group_id = mog.id
             and mo.slug = o.value->>'option_slug'
             and mo.is_active
            -- The group has to be one this item offers, the same join
            -- place_order makes for the same reason.
            join menu_item_option_groups mig
              on mig.group_id = mog.id and mig.item_id = r.item_id
          ), 0)
      ) * r.qty as line_total_cents
    from resolved r
  )
  select
    count(*) filter (where p.line_total_cents is not null),
    coalesce(sum(p.line_total_cents), 0),
    coalesce(sum(p.line_total_cents) filter (
      where (
        not exists (select 1 from voucher_items vi where vi.voucher_id = v_voucher_id)
        or exists (
          select 1 from voucher_items vi
          where vi.voucher_id = v_voucher_id and vi.item_id = p.item_id
        )
      )
      and (
        not exists (select 1 from voucher_categories vc where vc.voucher_id = v_voucher_id)
        or exists (
          select 1 from voucher_categories vc
          where vc.voucher_id = v_voucher_id and vc.category_id = p.category_id
        )
      )
    ), 0)
  into v_priced, v_subtotal, v_eligible
  from priced p;

  -- A line that would not price is a cart that has moved. Say so, rather than
  -- discounting a basket that is about to change.
  if coalesce(v_priced, 0) <> v_expected then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_CART_CHANGED');
  end if;

  v_verdict := resolve_voucher(
    v_code, v_branch_id, auth.uid(), v_digits, v_eligible, v_subtotal, now()
  );

  -- The same floor place_order applies to an online order: PayMongo will not
  -- take less than a peso, so a code that brings the total under it is refused
  -- at placement with VOUCHER_TOTAL_TOO_LOW. Said here too, while counter
  -- payments are off and every order is therefore online, so the preview does
  -- not approve a code the placement then refuses.
  if coalesce((v_verdict->>'ok')::boolean, false)
    and not coalesce(v_settings.counter_payments_enabled, false)
    and v_subtotal - coalesce((v_verdict->>'discountCents')::bigint, 0) < 100
  then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_TOTAL_TOO_LOW');
  end if;

  -- The subtotal travels back so the screen can show what the discount was
  -- taken from without pricing the cart a third time, in the browser.
  return v_verdict || jsonb_build_object('subtotalCents', v_subtotal);
end;
$$;

revoke execute on function preview_voucher(text, text, jsonb, text)
  from public, anon, authenticated, service_role;
grant execute on function preview_voucher(text, text, jsonb, text)
  to authenticated, service_role;

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

  -- Only the browser push services. The server POSTs to every endpoint on this
  -- list when a promo is announced, so an endpoint is an address our server
  -- will call; before 0094 any https URL was accepted, including internal
  -- ones. lib/push/endpoints.ts holds the same list for the Server Action.
  if not public.is_browser_push_endpoint(v_endpoint) then
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

revoke execute on function register_promo_push_subscription(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function register_promo_push_subscription(text, text, text)
  to service_role;
