-- 0065_voucher_engine.sql
-- The rules a voucher is judged by, the read-only preview the checkout screen
-- asks, the placement that actually spends one, and the return that gives it
-- back when the order does not survive.
--
-- LANDS WITH 0064 AND BEFORE THE CODE, per spec section 18 and 0008:150.
-- vouchers_enabled stays false until the whole path is live.
--
-- ONE SET OF RULES, TWO CALLERS.
--
-- resolve_voucher is the only thing in this schema that decides whether a code
-- may be used and what it is worth. preview_voucher asks it so the checkout
-- screen can show a discount before the order exists; place_order asks it again
-- at the moment the order is written, and place_order's answer is the one that
-- is charged. Writing the rules twice, once for the screen and once for the
-- till, is how a system ends up showing a discount it does not honour, which is
-- the failure spec section 18 opens by warning about.
--
-- The preview prices the cart itself, and that IS a second pricing path. It is
-- the same arrangement the menu already has: lib/menu/line-pricing.ts prices
-- the cart in TypeScript for display, and place_order names it as its own twin
-- (0052:648). What is never duplicated is the money that gets charged, which
-- comes only from the order_items rows place_order writes.
--
-- WHY A REDEMPTION IS WRITTEN BEFORE THE MONEY ARRIVES.
--
-- Owner decision, 2026-09-04. The redemption row and the uses_count increment
-- both happen inside place_order's transaction, and the triggers at the foot of
-- this file hand them back if the order is cancelled or rejected. The
-- alternative, counting a use only once a payment clears, cannot hold a cap:
-- several unpaid orders would each read the last remaining use as available and
-- then all pay. Reserving makes the cap true and costs an abandoned checkout
-- nothing, because abandonment already ends at 'cancelled' (0030:193 for a
-- failed or timed-out intent, 0039:63 for the expiry sweep).
--
-- A refund does NOT return the voucher, and neither does a no-show. Both are
-- orders that were placed, paid and used the code; what happened afterwards is
-- a separate question about money, not about whether the promotion was redeemed.

-- ---------------------------------------------------------------------------
-- 1. How much of an order a voucher is allowed to look at.
-- ---------------------------------------------------------------------------
--
-- Reads the order's own line rows, so the figure a discount is calculated from
-- is the figure printed on the receipt. Both scope tables are opt in: a voucher
-- naming no items and no categories sees the whole order, which is the ordinary
-- promo code and the case that should need no configuration.
--
-- Items and categories are ANDed rather than ORed. A voucher naming both is
-- read as "these items, and only where they are also in these categories",
-- which is the narrower and less surprising reading of two restrictions set
-- together. Naming an item outside the named categories yields nothing, and the
-- admin screen says so rather than leaving it to be discovered.
create or replace function voucher_eligible_cents(
  p_voucher_id uuid,
  p_order_id uuid
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(oi.line_total_cents), 0)
  from order_items oi
  join menu_items mi on mi.id = oi.item_id
  where oi.order_id = p_order_id
    and (
      not exists (select 1 from voucher_items vi where vi.voucher_id = p_voucher_id)
      or exists (
        select 1 from voucher_items vi
        where vi.voucher_id = p_voucher_id and vi.item_id = oi.item_id
      )
    )
    and (
      not exists (select 1 from voucher_categories vc where vc.voucher_id = p_voucher_id)
      or exists (
        select 1 from voucher_categories vc
        where vc.voucher_id = p_voucher_id and vc.category_id = mi.category_id
      )
    )
$$;

revoke execute on function voucher_eligible_cents(uuid, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The rules, in the order the brief asks for them.
-- ---------------------------------------------------------------------------
--
-- Returns a verdict rather than raising, because one of its two callers is a
-- preview whose whole job is to report a refusal calmly. place_order raises the
-- reason it gets back, unchanged, so both surfaces name the same failure and
-- lib/checkout/messages.ts has one table to write copy against.
--
-- THE ORDER OF THE CHECKS IS PART OF THE CONTRACT.
--
-- A customer holding an expired code for a branch they are not at should be
-- told it has expired, not that they are at the wrong counter, because the
-- first is the fact that will still be true tomorrow. So the checks run
-- cheapest and most permanent first: existence, then the switch, then time,
-- then who, then where, then what is in the basket, then how much, then how
-- often. Reordering them changes what customers are told, not just how fast it
-- runs.
--
-- WHAT IT DELIBERATELY DOES NOT DO: take a lock. place_order takes the
-- voucher's row before calling this, so the two counts read below are stable
-- for the length of that transaction. The preview takes no lock and does not
-- need one, because it promises nothing.
create or replace function resolve_voucher(
  p_code text,
  p_branch_id uuid,
  p_user_id uuid,
  p_phone_digits text,
  p_eligible_cents bigint,
  p_subtotal_cents bigint,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v          vouchers%rowtype;
  v_discount bigint;
  v_used     int;
begin
  -- 1. It exists. Matched on the upper-cased value, which is what
  -- vouchers_code_key indexes (0008:183), so the lookup and the uniqueness
  -- constraint agree about what counts as the same code.
  select * into v from vouchers where upper(code) = upper(btrim(coalesce(p_code, '')));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NOT_FOUND');
  end if;

  -- 2. It is switched on.
  if not v.is_active then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_INACTIVE');
  end if;

  -- 3. It is inside its window. Both bounds are nullable and neither null means
  -- a date: starts_at null is "live already", expires_at null is "never ends".
  -- Defaulting either on read would change what the row means, which is the
  -- trap AGENTS.md rule 6 is about.
  if v.starts_at is not null and p_now < v.starts_at then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NOT_STARTED');
  end if;
  if v.expires_at is not null and p_now >= v.expires_at then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_EXPIRED');
  end if;

  -- 4. It belongs to this customer, if it belongs to anybody.
  --
  -- Two mechanisms, and they are not duplicates. owner_user_id is the loyalty
  -- instrument from 0008: one voucher issued by the system to one account.
  -- voucher_customers is the admin's restriction list, which understands a
  -- phone number as well as an account because most orders here are guests. A
  -- voucher may carry both, and then both have to pass.
  if v.owner_user_id is not null
    and (p_user_id is null or p_user_id <> v.owner_user_id)
  then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NOT_YOURS');
  end if;

  if exists (select 1 from voucher_customers vc where vc.voucher_id = v.id)
    and not exists (
      select 1 from voucher_customers vc
      where vc.voucher_id = v.id
        and (
          (vc.user_id is not null and vc.user_id = p_user_id)
          or (vc.phone_digits is not null and vc.phone_digits = p_phone_digits)
        )
    )
  then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NOT_YOURS');
  end if;

  -- 5. It is valid at this counter.
  if exists (select 1 from voucher_branches vb where vb.voucher_id = v.id)
    and not exists (
      select 1 from voucher_branches vb
      where vb.voucher_id = v.id and vb.branch_id = p_branch_id
    )
  then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_WRONG_BRANCH');
  end if;

  -- 6. There is something in the basket it applies to. Zero eligible money on a
  -- non-empty order means the item and category scope matched nothing, which is
  -- a different thing to tell somebody than "your order is too small".
  if p_eligible_cents <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NO_ELIGIBLE_ITEMS');
  end if;

  -- 7. The minimum, measured against the eligible lines rather than the whole
  -- order. Owner decision, 2026-09-04: "spend 500 on wings" is the promotion
  -- being written, so the number on the form and the number the discount is
  -- taken from are the same number. The shortfall travels with the code so the
  -- screen can say how much more is needed.
  if p_eligible_cents < v.min_order_cents then
    return jsonb_build_object(
      'ok', false,
      'reason', 'VOUCHER_BELOW_MINIMUM:' || v.min_order_cents::text
    );
  end if;

  -- 8. It has uses left, in total and for this customer.
  if v.max_uses is not null and v.uses_count >= v.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_EXHAUSTED');
  end if;

  -- Counted on the phone number. Owner decision, 2026-09-04, and the same
  -- identity 0062 counts a returning customer by, because orders.user_id is
  -- null on most orders here and a per-customer cap that only understood
  -- accounts would not bind the people it is written for. The redemption row
  -- records user_id too, so tightening this to "either identity" later is a
  -- change to this query and not a migration.
  if p_phone_digits is not null then
    select count(*) into v_used
    from voucher_redemptions r
    where r.voucher_id = v.id and r.phone_digits = p_phone_digits;

    if v_used >= v.max_uses_per_customer then
      return jsonb_build_object('ok', false, 'reason', 'VOUCHER_CUSTOMER_LIMIT');
    end if;
  end if;

  -- 9. Stacking needs no branch here. One voucher per order is the unique index
  -- voucher_redemptions_order_key (0064), so a second one has nowhere to go.

  -- 10. The money.
  --
  -- amount_cents null means percentage and percent_off null means fixed; 0008's
  -- vouchers_one_discount_kind constraint guarantees exactly one is set, so
  -- this branch is total. Floored, so rounding never runs in the customer's
  -- favour beyond the stated percentage, and taken once against the eligible
  -- total rather than per line, which would leak a cent per line.
  if v.amount_cents is not null then
    v_discount := least(v.amount_cents, p_eligible_cents);
  else
    v_discount := floor(p_eligible_cents * v.percent_off / 100.0)::bigint;
    if v.max_discount_cents is not null then
      v_discount := least(v_discount, v.max_discount_cents);
    end if;
  end if;

  -- Never more than the order is worth, so a total cannot go negative and a
  -- voucher cannot become a payout.
  v_discount := least(v_discount, p_subtotal_cents);

  -- A percentage small enough to floor to nothing on a cheap order. Applying it
  -- would put a "voucher applied" line and a PHP 0.00 discount on the screen,
  -- which reads as a bug rather than as arithmetic.
  if v_discount <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'VOUCHER_NO_DISCOUNT');
  end if;

  return jsonb_build_object(
    'ok', true,
    'voucherId', v.id,
    'code', v.code,
    'description', v.description,
    'eligibleCents', p_eligible_cents,
    'discountCents', v_discount
  );
end;
$$;

revoke execute on function resolve_voucher(text, uuid, uuid, text, bigint, bigint, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The preview the checkout screen asks.
-- ---------------------------------------------------------------------------
--
-- Reachable by a guest, because guests order here and a promo code they cannot
-- try is a promo code they cannot use. It writes nothing, reserves nothing and
-- consumes nothing, and place_order re-resolves everything from scratch, so the
-- worst a stale preview can do is show a number that the placement then
-- corrects.
--
-- WHAT IT REFUSES TO GUESS. If any line in the cart cannot be priced, because
-- the menu moved under a tab that had been sitting open, it returns
-- VOUCHER_CART_CHANGED rather than quietly pricing the rest. A discount
-- computed against part of a basket is worse than no discount: it is a number
-- the customer will see change at the till.
--
-- ON ENUMERATION. An unknown code and a code that exists but is not for this
-- customer both come back as a refusal that names no voucher, and the Server
-- Action rate limits the caller's address the way cart writes and order
-- placement already are. Nothing in a successful verdict describes a voucher
-- the caller did not already hold the code for.
create or replace function preview_voucher(
  p_code text,
  p_branch_slug text,
  p_lines jsonb,
  p_phone text
)
returns jsonb
language plpgsql
stable
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

  -- The subtotal travels back so the screen can show what the discount was
  -- taken from without pricing the cart a third time, in the browser.
  return v_verdict || jsonb_build_object('subtotalCents', v_subtotal);
end;
$$;

comment on function preview_voucher(text, text, jsonb, text) is
  'Whether a code may be used on this cart and what it is worth, without '
  'reserving anything. Advisory: place_order resolves it again and its answer '
  'is the one charged.';

revoke execute on function preview_voucher(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function preview_voucher(text, text, jsonb, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Placing an order, now with a discount in it.
-- ---------------------------------------------------------------------------
--
-- Restated whole, the way 0052 restated it from 0013, because a plpgsql body
-- cannot be patched in place. Everything outside section 8 is byte for byte
-- what 0052 shipped; the diff worth reading is the voucher block in section 8
-- and the five declarations at the top.
create or replace function place_order(
  p_payload jsonb,
  p_attempt_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c_max_quantity   constant int := 20;
  c_max_lines      constant int := 50;
  c_rate_limit     constant int := 5;
  c_rate_window    constant int := 60;

  v_now            timestamptz := now();
  v_actor_id       uuid := auth.uid();
  v_actor_kind     text;
  v_fresh          boolean;
  v_prior          checkout_attempts%rowtype;
  v_allowed        boolean;
  v_rate_key       text;

  v_settings       app_settings%rowtype;
  v_branch         branches%rowtype;
  v_branch_id      uuid;
  v_price_list_id  uuid;

  v_name           text;
  v_phone          text;
  v_digits         text;
  v_email          text;
  v_notes          text;
  v_method         payment_method;

  v_slot_start     timestamptz;
  v_slot_id        uuid;
  v_offered        jsonb;
  v_slots          jsonb;

  v_lines          jsonb;
  v_line           jsonb;
  v_option         jsonb;
  v_item           record;
  v_variation      record;
  v_option_row     record;
  v_unmet          record;

  v_qty            int;
  v_variation_cents bigint;
  v_option_cents   bigint;
  v_unit_cents     bigint;
  v_subtotal       bigint := 0;
  v_total          bigint;
  v_option_ids     uuid[];
  v_order_item_id  uuid;

  v_order_id       uuid;
  v_short_code     text;
  v_pickup_code    text;
  v_tracking_token uuid;
  v_tries          int;
  v_result         jsonb;

  v_voucher_code   text;
  v_voucher        jsonb;
  v_voucher_id     uuid;
  v_eligible       bigint := 0;
  v_discount       bigint := 0;
begin
  -- -------------------------------------------------------------------------
  -- 1. Idempotency, before anything else can have a side effect.
  -- -------------------------------------------------------------------------
  --
  -- The browser mints one uuid per checkout and sends it on every retry, so a
  -- double-tapped Place Order button, or a Server Action replayed by a flaky
  -- connection, produces one order and one answer.
  --
  -- ON CONFLICT DO NOTHING is doing two jobs here. The obvious one is the
  -- replay. The subtle one is the double tap that arrives while the first
  -- request is still in flight: the speculative insert waits on the other
  -- transaction rather than racing it, and because this function is VOLATILE
  -- the SELECT below takes a fresh snapshot and sees whatever that transaction
  -- committed.
  if p_attempt_id is null then
    raise exception 'INVALID_ATTEMPT' using errcode = 'P0001';
  end if;

  v_actor_kind := case when v_actor_id is null then 'guest' else 'customer' end;

  insert into checkout_attempts (id, actor_kind, actor_id)
  values (p_attempt_id, v_actor_kind, v_actor_id)
  on conflict (id) do nothing;
  v_fresh := found;

  if not v_fresh then
    select * into v_prior from checkout_attempts where id = p_attempt_id;

    -- Somebody else's attempt id, or the same browser after signing in. Either
    -- way this is not the request that attempt was opened for, and handing
    -- back its result would hand back another person's order.
    if v_prior.actor_kind is distinct from v_actor_kind
      or v_prior.actor_id is distinct from v_actor_id
    then
      raise exception 'CHECKOUT_ATTEMPT_REUSED' using errcode = 'P0001';
    end if;

    -- Claimed but not finished: the first request is still running, or it
    -- failed and rolled back its own row. Retrying is the right advice.
    if v_prior.result is null then
      raise exception 'CHECKOUT_ATTEMPT_INCOMPLETE' using errcode = 'P0001';
    end if;

    return v_prior.result;
  end if;

  -- -------------------------------------------------------------------------
  -- 2. Rate limit, on the strongest identity the database can see for itself.
  -- -------------------------------------------------------------------------
  --
  -- Deliberately not on a key the caller supplies. place_order is granted to
  -- anon, because a guest has to be able to reach it and a signed-in customer
  -- has to reach it as themselves, so anything the payload carries is
  -- something an attacker picks. auth.uid() is verified by Postgres; a phone
  -- number is at least the thing the order will be collected against.
  --
  -- Counted after the replay check, so a retry of a completed attempt is free.
  -- Note what this therefore counts: orders that COMMIT. A rejected attempt
  -- rolls back its own increment along with everything else, which is the
  -- behaviour worth having, because the limit a business cares about is orders
  -- placed rather than requests attempted.
  --
  -- The IP dimension is not here and cannot be: Postgres does not know the
  -- client address. It belongs in the Server Action, which does, and which
  -- needs a service-role client to call rate_limit_hit at all (0010).
  v_phone := nullif(btrim(coalesce(p_payload->>'customer_phone', '')), '');
  v_digits := regexp_replace(coalesce(v_phone, ''), '\D', '', 'g');
  v_rate_key := coalesce(
    'place_order:user:' || v_actor_id::text,
    'place_order:phone:' || nullif(v_digits, ''),
    'place_order:anonymous'
  );

  -- 0008 is explicit that callers fail OPEN on the limiter. A limiter that
  -- takes ordering down with it has done more damage than the abuse it stops.
  begin
    v_allowed := rate_limit_hit(v_rate_key, c_rate_limit, c_rate_window);
  exception
    when others then
      v_allowed := true;
  end;

  if not v_allowed then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Who is ordering, and can this shop take it.
  -- -------------------------------------------------------------------------
  select * into v_settings from app_settings where id = 1;

  v_branch_id := resolve_pickup_branch_id(nullif(p_payload->>'branch_slug', ''));
  if v_branch_id is null then
    raise exception 'NO_BRANCH' using errcode = 'P0001';
  end if;
  select * into v_branch from branches where id = v_branch_id;

  -- One gate, the same one the storefront copy and the slot picker read. When
  -- it says no, the cause is worked out afterwards purely so the screen can
  -- say something more useful than "no".
  if not branch_accepts_orders(v_branch_id, v_now) then
    if not coalesce(v_settings.accepting_orders, false)
      or not v_branch.is_accepting_orders
    then
      raise exception 'NOT_ACCEPTING' using errcode = 'P0001';
    end if;
    raise exception 'STORE_CLOSED' using errcode = 'P0001';
  end if;

  -- Resolved from the branch this function chose, never from the slug the
  -- caller sent, so the price list and the branch cannot come apart.
  v_price_list_id := resolve_price_list_id(v_branch.slug);

  -- -------------------------------------------------------------------------
  -- 4. The customer's details.
  -- -------------------------------------------------------------------------
  v_name := nullif(btrim(coalesce(p_payload->>'customer_name', '')), '');
  if v_name is null then
    raise exception 'MISSING_NAME' using errcode = 'P0001';
  end if;
  v_name := left(v_name, 120);

  if v_phone is null then
    raise exception 'MISSING_PHONE' using errcode = 'P0001';
  end if;
  -- Deliberately loose. Philippine mobiles are eleven digits and landlines
  -- nine or ten with the area code, and a customer typing their own number
  -- with spaces, dashes or +63 is not making a mistake. What this rejects is
  -- a field somebody filled with three characters to get past it.
  if length(v_digits) < 7 or length(v_digits) > 15 then
    raise exception 'INVALID_PHONE' using errcode = 'P0001';
  end if;
  v_phone := left(v_phone, 40);

  v_email := nullif(btrim(coalesce(p_payload->>'customer_email', '')), '');
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = 'P0001';
  end if;

  v_notes := left(nullif(btrim(coalesce(p_payload->>'notes', '')), ''), 500);

  -- Counter is the only rail until PayMongo is flipped on, and the flag is the
  -- authority rather than the checkout screen. A payment method the business
  -- has not been approved for must not be reachable by editing a request.
  v_method := coalesce(nullif(p_payload->>'payment_method', '')::payment_method, 'counter');
  if v_method <> 'counter' and not coalesce(v_settings.paymongo_enabled, false) then
    raise exception 'PAYMENT_METHOD_UNAVAILABLE' using errcode = 'P0001';
  end if;

  -- A code arriving while the voucher engine is dark is refused, not ignored.
  -- Silently dropping it charges full price to somebody who is looking at a
  -- discount, which is the exact failure spec section 18 warns about.
  -- Upper-cased once, here, because vouchers_code_key is a unique index on
  -- upper(code) and every lookup below has to agree with it.
  v_voucher_code := nullif(upper(left(btrim(coalesce(p_payload->>'voucher_code', '')), 40)), '');
  if v_voucher_code is not null
    and not coalesce(v_settings.vouchers_enabled, false)
  then
    raise exception 'VOUCHERS_DISABLED' using errcode = 'P0001';
  end if;

  -- The cart is checked for shape now and priced later, so an empty submission
  -- fails before it reserves a window somebody else could have had.
  v_lines := coalesce(p_payload->'lines', '[]'::jsonb);
  if jsonb_typeof(v_lines) <> 'array' then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_lines) = 0 then
    raise exception 'EMPTY_CART' using errcode = 'P0001';
  end if;
  if jsonb_array_length(v_lines) > c_max_lines then
    raise exception 'TOO_MANY_LINES' using errcode = 'P0001';
  end if;

  -- -------------------------------------------------------------------------
  -- 5. The pickup window, taken from the picker's own answer.
  -- -------------------------------------------------------------------------
  v_slot_start := nullif(p_payload->>'pickup_slot_start', '')::timestamptz;
  if v_slot_start is null then
    raise exception 'MISSING_SLOT' using errcode = 'P0001';
  end if;

  v_slots := get_pickup_slots(v_branch.slug, v_now) -> 'slots';
  select value into v_offered
  from jsonb_array_elements(v_slots) as offered(value)
  where (value->>'startsAt')::timestamptz = v_slot_start;

  -- Not on the grid at all: a stale tab whose windows have since passed, a
  -- minute that never was one, or the shop closing between page load and
  -- submit. All three are the same answer to the customer, which is to pick
  -- again from a fresh list.
  if v_offered is null then
    raise exception 'SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if (v_offered->>'remaining')::int <= 0 then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;

  -- The booking. capacity is copied from the branch only when the row is
  -- created, per 0005: raising the branch default later must not retroactively
  -- oversell a window the kitchen has already planned around, so the conflict
  -- path touches reserved and nothing else.
  --
  -- The remaining check above is a courtesy, not the guard. It reads a number
  -- that another customer can invalidate a millisecond later. This is the
  -- guard, and it is a CHECK constraint inside the same transaction as the
  -- order insert, which is why the loser of a race gets no order rather than
  -- an oversold window.
  begin
    insert into pickup_slots (branch_id, slot_start, capacity, reserved)
    values (v_branch_id, v_slot_start, v_branch.pickup_slot_capacity, 1)
    on conflict (branch_id, slot_start)
      do update set reserved = pickup_slots.reserved + 1
    returning id into v_slot_id;
  exception
    when check_violation then
      raise exception 'SLOT_FULL' using errcode = 'P0001';
  end;

  -- -------------------------------------------------------------------------
  -- 6. The order shell.
  -- -------------------------------------------------------------------------
  --
  -- Both codes are drawn before the insert and checked for collisions first.
  -- The unique indexes remain the real guarantee; this loop only stops the
  -- overwhelmingly likely collision (a short code already in the table) from
  -- becoming a failed checkout. The pickup code only has to be unambiguous
  -- among the orders one counter is holding, which is what the partial unique
  -- index in 0005 says.
  v_tries := 0;
  loop
    v_short_code := generate_short_code();
    exit when not exists (select 1 from orders where short_code = v_short_code);
    v_tries := v_tries + 1;
    if v_tries >= 5 then
      raise exception 'SHORT_CODE_COLLISION' using errcode = 'P0001';
    end if;
  end loop;

  v_tries := 0;
  loop
    v_pickup_code := generate_pickup_code();
    exit when not exists (
      select 1 from orders
      where branch_id = v_branch_id
        and pickup_code = v_pickup_code
        and status in ('pending', 'accepted', 'preparing', 'ready')
    );
    v_tries := v_tries + 1;
    if v_tries >= 10 then
      raise exception 'PICKUP_CODE_COLLISION' using errcode = 'P0001';
    end if;
  end loop;

  insert into orders (
    short_code, status, service_mode,
    branch_id, price_list_id,
    pickup_slot_id, pickup_code,
    user_id, customer_name, customer_phone, customer_email,
    subtotal_cents, discount_cents, total_cents,
    notes, placed_at
  ) values (
    v_short_code, 'pending', 'pickup',
    v_branch_id, v_price_list_id,
    v_slot_id, v_pickup_code,
    v_actor_id, v_name, v_phone, v_email,
    0, 0, 0,
    v_notes, v_now
  )
  returning id, tracking_token into v_order_id, v_tracking_token;

  -- -------------------------------------------------------------------------
  -- 7. The lines, priced here and only here.
  -- -------------------------------------------------------------------------
  for v_line in select value from jsonb_array_elements(v_lines) loop
    -- The is_active filters here are the ones get_storefront_menu applies, on
    -- every level including the category. They have to be identical: a filter
    -- this function is missing sells something the menu is hiding, and one the
    -- menu is missing refuses something a customer can see.
    -- menu_item_is_available adds the same rule for holds: a branch that has
    -- placed a hold on this item must refuse it here exactly when
    -- get_storefront_menu already hid it. The two calls have to move together.
    select mi.id, mi.name
      into v_item
      from menu_items mi
      join menu_categories mc on mc.id = mi.category_id and mc.is_active
      where mi.slug = v_line->>'item_slug'
        and mi.is_active
        and menu_item_is_available(mi.id, v_branch_id, v_now);

    if not found then
      raise exception 'ITEM_UNAVAILABLE:%', v_line->>'item_slug'
        using errcode = 'P0001';
    end if;

    select iv.id, iv.label
      into v_variation
      from item_variations iv
      where iv.item_id = v_item.id
        and iv.slug = v_line->>'variation_slug'
        and iv.is_active;

    if not found then
      raise exception 'VARIATION_UNAVAILABLE:%', v_item.name
        using errcode = 'P0001';
    end if;

    v_qty := nullif(v_line->>'qty', '')::int;
    if v_qty is null or v_qty < 1 or v_qty > c_max_quantity then
      raise exception 'INVALID_QTY:%', v_item.name using errcode = 'P0001';
    end if;

    -- Null is a hard error, never free. 0003 says so in as many words: a
    -- missing item price is a bug, not a discount.
    v_variation_cents := resolve_variation_price_cents(v_variation.id, v_price_list_id);
    if v_variation_cents is null then
      raise exception 'MISSING_PRICE:%', v_item.name using errcode = 'P0001';
    end if;

    insert into order_items (
      order_id, item_id, variation_id,
      item_name_snapshot, variation_label_snapshot,
      unit_price_cents, qty, line_total_cents,
      notes
    ) values (
      v_order_id, v_item.id, v_variation.id,
      v_item.name, v_variation.label,
      0, v_qty, 0,
      left(nullif(btrim(coalesce(v_line->>'notes', '')), ''), 200)
    )
    returning id into v_order_item_id;

    v_option_cents := 0;
    v_option_ids := '{}'::uuid[];

    for v_option in
      select value from jsonb_array_elements(coalesce(v_line->'options', '[]'::jsonb))
    loop
      -- The join through menu_item_option_groups is the check that this group
      -- is offered on THIS item. Without it a customer could attach the wing
      -- flavour group to a coffee, and the ticket would reach the kitchen
      -- describing something nobody sells.
      select mo.id, mo.name, mo.heat_percent, mog.name as group_name
        into v_option_row
        from menu_options mo
        join menu_option_groups mog on mog.id = mo.group_id and mog.is_active
        join menu_item_option_groups mig
          on mig.group_id = mog.id and mig.item_id = v_item.id
        where mog.slug = v_option->>'group_slug'
          and mo.slug = v_option->>'option_slug'
          and mo.is_active;

      if not found then
        raise exception 'OPTION_UNAVAILABLE:%', v_option->>'option_slug'
          using errcode = 'P0001';
      end if;

      -- The same option twice is a double charge for one choice. lineKey() in
      -- lib/cart/lines.ts cannot produce it; a forged payload can.
      if v_option_row.id = any (v_option_ids) then
        raise exception 'DUPLICATE_OPTION:%', v_option->>'option_slug'
          using errcode = 'P0001';
      end if;
      v_option_ids := v_option_ids || v_option_row.id;

      insert into order_item_options (
        order_item_id, option_id,
        group_name_snapshot, name_snapshot,
        price_cents, heat_percent_snapshot
      ) values (
        v_order_item_id, v_option_row.id,
        v_option_row.group_name, v_option_row.name,
        resolve_option_price_cents(v_option_row.id, v_variation.id, v_price_list_id),
        v_option_row.heat_percent
      );
    end loop;

    -- Read back rather than accumulated in the loop above, so the money on the
    -- line is the money in the rows. An option row and a total that disagree
    -- is a receipt nobody can reconcile.
    select coalesce(sum(price_cents), 0)
      into v_option_cents
      from order_item_options
      where order_item_id = v_order_item_id;

    -- Every group the item offers has to be satisfied, which is the SQL twin
    -- of selectionProblem() in lib/menu/line-pricing.ts. A required flavour
    -- left unchosen has to fail here too, or a forged payload orders wings
    -- with no sauce and the kitchen has to guess.
    select mog.name, mig.min_select, mig.max_select, count(mo.id) as chosen
      into v_unmet
      from menu_item_option_groups mig
      join menu_option_groups mog on mog.id = mig.group_id and mog.is_active
      left join menu_options mo
        on mo.group_id = mog.id and mo.is_active and mo.id = any (v_option_ids)
      where mig.item_id = v_item.id
      group by mog.name, mig.min_select, mig.max_select
      having count(mo.id) < mig.min_select or count(mo.id) > mig.max_select
      limit 1;

    if found then
      raise exception 'OPTION_COUNT:%', v_unmet.name using errcode = 'P0001';
    end if;

    v_unit_cents := v_variation_cents + v_option_cents;

    update order_items
      set unit_price_cents = v_unit_cents,
          line_total_cents = v_unit_cents * v_qty
      where id = v_order_item_id;

    v_subtotal := v_subtotal + v_unit_cents * v_qty;
  end loop;

  -- -------------------------------------------------------------------------
  -- 8. Totals, payment, and the trail.
  -- -------------------------------------------------------------------------
  --
  -- THE DISCOUNT IS RESOLVED HERE, FROM THE ROWS, AND NEVER FROM THE REQUEST.
  --
  -- The client sent a code and nothing else, which is spec section 22 item 4:
  -- a forged payload can ask for a different code but not for a different
  -- discount. Every peso below comes from the vouchers row and from the
  -- order_items this function has just written.
  --
  -- The eligible subtotal is read back out of order_items rather than
  -- accumulated in the loop above, for the same reason the option prices are
  -- (section 7): the money a voucher is measured against has to be the money on
  -- the rows, or the receipt and the discount can disagree.
  if v_voucher_code is not null then
    -- The lock, and it is taken BEFORE any rule is read rather than just before
    -- the counter is written.
    --
    -- Both caps are read inside resolve_voucher: the total one from
    -- vouchers.uses_count and the per-customer one by counting redemptions. Two
    -- checkouts that read either of those before either writes would both pass,
    -- and the second cap has no constraint behind it to catch that, because
    -- "this number has ordered once already" is not a property of a single row.
    -- Taking the voucher's row first serialises every redemption of it, so the
    -- counts resolve_voucher reads are counts nothing else is about to change.
    perform 1 from vouchers where upper(code) = v_voucher_code for update;

    select id into v_voucher_id from vouchers where upper(code) = v_voucher_code;
    if v_voucher_id is not null then
      v_eligible := voucher_eligible_cents(v_voucher_id, v_order_id);
    end if;

    v_voucher := resolve_voucher(
      v_voucher_code, v_branch_id, v_actor_id, v_digits, v_eligible, v_subtotal, v_now
    );

    -- resolve_voucher names the refusal and this raises it unchanged, so the
    -- preview at checkout and the placement here cannot give two answers to the
    -- same question. lib/checkout/messages.ts turns it into a sentence.
    if not coalesce((v_voucher->>'ok')::boolean, false) then
      raise exception '%', v_voucher->>'reason' using errcode = 'P0001';
    end if;

    v_voucher_id := (v_voucher->>'voucherId')::uuid;
    v_discount := (v_voucher->>'discountCents')::bigint;
  end if;

  v_total := v_subtotal - v_discount;

  -- A discount can take a total below what the payment rail will accept.
  -- MIN_ONLINE_PAYMENT_CENTS in lib/paymongo/methods.ts is 100 for every online
  -- method, so a large code on a small order produces an intent PayMongo would
  -- refuse. Refusing here, while the customer is still on the form and can
  -- remove the code or add an item, is much better than failing at the provider
  -- after the order exists. Counter orders are unaffected: a peso can be handed
  -- over in person.
  if v_method <> 'counter' and v_total < 100 then
    raise exception 'VOUCHER_TOTAL_TOO_LOW' using errcode = 'P0001';
  end if;

  update orders
    set subtotal_cents = v_subtotal,
        discount_cents = v_discount,
        total_cents = v_total,
        voucher_id = v_voucher_id
    where id = v_order_id;

  -- The redemption, and the reservation it represents.
  --
  -- Written now, inside the transaction that writes the order, rather than when
  -- the money arrives. Spec section 18 puts it this way and the reason is the
  -- cap: a redemption recorded only on payment lets several unpaid orders each
  -- hold the last remaining use and then all pay. The row is returned by the
  -- trigger below if this order is cancelled, rejected or expires, so an
  -- abandoned checkout costs the voucher nothing.
  --
  -- uses_count is incremented through its CHECK against max_uses (0064). The
  -- row is already locked above, so this cannot fail on a race; the catch is
  -- there because a constraint is a better last word than an assumption.
  if v_voucher_id is not null then
    begin
      update vouchers set uses_count = uses_count + 1 where id = v_voucher_id;
    exception
      when check_violation then
        raise exception 'VOUCHER_EXHAUSTED' using errcode = 'P0001';
    end;

    insert into voucher_redemptions (
      voucher_id, order_id, user_id, amount_cents,
      branch_id, phone_digits, subtotal_cents, total_cents
    ) values (
      v_voucher_id, v_order_id, v_actor_id, v_discount,
      v_branch_id, v_digits, v_subtotal, v_total
    );
  end if;

  -- 'due' rather than 'pending', and the distinction is the whole reason 0001
  -- added the value: a counter order is money expected in person and not being
  -- chased, while a pending online intent expires and releases its slot.
  insert into payments (order_id, method, provider, status, amount_cents)
  values (
    v_order_id,
    v_method,
    (case when v_method = 'counter' then 'manual' else 'paymongo' end)::payment_provider,
    (case when v_method = 'counter' then 'due' else 'pending' end)::payment_status,
    v_total
  );

  insert into order_status_events (order_id, from_status, to_status)
  values (v_order_id, null, 'pending');

  -- Created at placement, not when somebody first opens the ticket panel, so
  -- "was this entered in the POS" has an answer for every order rather than
  -- for every order placed after Phase 3. The adapter is chosen here because
  -- the flag can change later and the row records what was true at the time.
  insert into pos_sync (order_id, adapter)
  values (
    v_order_id,
    case when coalesce(v_settings.zenpos_enabled, false) then 'zenpos' else 'manual_rekey' end
  );

  -- -------------------------------------------------------------------------
  -- 9. The answer, captured in the same transaction that earned it.
  -- -------------------------------------------------------------------------
  --
  -- The tracking token travels in the result and into checkout_attempts. A
  -- successful checkout that loses its private tracking link is an order the
  -- guest who placed it can never look at again.
  v_result := jsonb_build_object(
    'orderId', v_order_id,
    'shortCode', v_short_code,
    'trackingToken', v_tracking_token,
    'pickupCode', v_pickup_code,
    'status', 'pending',
    'paymentMethod', v_method,
    'pickupSlotStart', v_slot_start,
    -- Both ends, because a confirmation that says "7:15pm" and a picker that
    -- said "7:15 to 7:30pm" are describing the same window in two voices.
    'pickupSlotEnd', v_offered->>'endsAt',
    'subtotalCents', v_subtotal,
    'discountCents', v_discount,
    'totalCents', v_total,
    'branch', jsonb_build_object(
      'slug', v_branch.slug,
      'name', v_branch.name,
      'shortName', v_branch.short_name,
      'timezone', v_branch.timezone
    )
  );

  update checkout_attempts
    set order_id = v_order_id,
        result = v_result
    where id = p_attempt_id;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Giving the voucher back.
-- ---------------------------------------------------------------------------
--
-- TWO TRIGGERS RATHER THAN FIVE EDITS.
--
-- An order can stop being an order from several places: the staff rejection
-- (0036), the customer or staff cancellation, the PayMongo failure path
-- (0030:193) and the expiry sweep (0039:63). Returning the voucher by editing
-- each of those would mean the next path somebody adds silently keeps the use,
-- and that bug would surface as a promo code that runs out early, weeks later,
-- with nothing pointing at the cause. Hanging it off the status change catches
-- every path, including ones not written yet.
--
-- Splitting it in two is what makes the count safe. The delete decides WHETHER
-- the use comes back; the decrement hangs off the row's disappearance and does
-- not care why. So a second cancellation finds no row and decrements nothing,
-- and the on delete cascade from orders that 0008 already declares returns the
-- use correctly instead of orphaning the counter.
--
-- 'cancelled' and 'rejected' only. A no-show kept the food and a refund is a
-- decision about money that was taken; both are orders that redeemed the code.
create or replace function return_voucher_on_order_failure()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from voucher_redemptions where order_id = new.id;
  return null;
end;
$$;

create trigger orders_return_voucher
  after update of status on orders
  for each row
  when (
    old.status is distinct from new.status
    and new.status in ('cancelled'::order_status, 'rejected'::order_status)
  )
  execute function return_voucher_on_order_failure();

-- greatest(..., 0) is a floor that should never be reached. It is here because
-- the alternative to a counter that cannot go below zero is a check constraint
-- violation raised from inside a cancellation, which would refuse to cancel an
-- order over a bookkeeping fault.
create or replace function release_voucher_use()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update vouchers
    set uses_count = greatest(uses_count - 1, 0)
    where id = old.voucher_id;
  return old;
end;
$$;

create trigger voucher_redemptions_release
  before delete on voucher_redemptions
  for each row execute function release_voucher_use();

-- Neither trigger function is called by anybody: the trigger mechanism runs
-- them as the table owner. Postgres grants EXECUTE to PUBLIC on a new function
-- by default, so without these they would sit in the anon-reachable surface
-- that tests/sql/schema.test.ts pins, which is exactly the check that caught it.
revoke execute on function return_voucher_on_order_failure() from public, anon, authenticated;
revoke execute on function release_voucher_use() from public, anon, authenticated;
