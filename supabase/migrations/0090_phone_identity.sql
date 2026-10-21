-- 0090: one customer, one phone number.
--
-- The voucher engine (0064, 0065) recognises a customer by the digits of the
-- phone number they type. Those digits were taken as typed, so the same
-- Philippine mobile written as "0917 123 4567", "+63 917 123 4567",
-- "917 123 4567" or "0063 917 123 4567" was four different customers:
--
--   * max_uses_per_customer could be beaten by retyping the number, and
--   * a code restricted to "0918 000 0000" refused that customer when they
--     typed "+63 918 000 0000".
--
-- normalize_phone_digits now returns one canonical form for a Philippine
-- mobile, 639XXXXXXXXX, and for a Philippine landline, 63 plus the area code
-- and number, and leaves every other number as its digits.
-- place_order used its own inline regexp_replace instead of the function, so it
-- is recreated here, from 0065, calling the function. The checkout form also
-- normalises before it sends (lib/phone.ts normalizeCustomerPhone), so new
-- orders store +639XXXXXXXXX; the function is what makes a direct call to the
-- RPC agree with it.
--
-- place_order also gains one guard, UNPAID_ORDERS_OPEN: at most two unpaid
-- online orders open at once per number. See the comment where it is raised.
--
-- Existing voucher rows are rewritten to the canonical digits at the end, so a
-- redemption made before this migration still counts against the cap.

create or replace function normalize_phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select nullif(
    case
      when d ~ '^00639[0-9]{9}$' then substr(d, 3)
      when d ~ '^639[0-9]{9}$' then d
      when d ~ '^09[0-9]{9}$' then '63' || substr(d, 2)
      when d ~ '^9[0-9]{9}$' then '63' || d
      -- A landline: area codes 2 to 8, so never a 639 mobile. "(032) 318
      -- 2405" and "+63 32 318 2405" are one number, and so is "+63 (032)".
      when d ~ '^0[2-8][0-9]{7,9}$' then '63' || substr(d, 2)
      when d ~ '^630[2-8][0-9]{7,9}$' then '63' || substr(d, 4)
      else d
    end,
    ''
  )
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) as digits
$$;

comment on function normalize_phone_digits(text) is
  'A phone number reduced to the digits this schema recognises a customer by. '
  'A Philippine mobile in any of its written forms becomes 639XXXXXXXXX, a '
  'Philippine landline 63 plus area code and number; any other number is its digits. Null when there are none. Since 0090.';

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
  c_max_unpaid_per_phone constant int := 2;

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
  -- Canonical since 0090, so "0917...", "+63 917..." and "917..." are one
  -- customer to the rate limit and to both voucher caps. Coalesced because the
  -- function returns null for a number with no digits, and the length check
  -- below has to see an empty string rather than skip a null.
  v_digits := coalesce(normalize_phone_digits(v_phone), '');
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

  -- Unpaid online orders hold a pickup window, and a capped promo code, until
  -- the expiry sweep releases them. A customer has no reason to keep more than
  -- a couple open at once, so a number that already has that many waiting on
  -- payment is told to finish one first. This bounds what a script calling this
  -- function directly can tie up per number; the address limit in the Server
  -- Action is the other half, and only applies to requests that come through
  -- the site.
  --
  -- The count and the insert below are two statements, so two requests for
  -- one number arriving together could each count the same one open order and
  -- both get through. The lock makes the second wait for the first to commit
  -- or roll back. It is per number, held only to the end of this transaction,
  -- and taken only on the online path, so nothing else queues behind it.
  if v_method <> 'counter' then
    perform pg_advisory_xact_lock(hashtextextended('place_order:unpaid:' || v_digits, 0));
  end if;
  if v_method <> 'counter' and (
    select count(*)
    from orders o
    join payments p on p.order_id = o.id
    where o.status = 'pending'
      and p.status = 'pending'
      and o.placed_at > v_now - interval '1 hour'
      and normalize_phone_digits(o.customer_phone) = v_digits
  ) >= c_max_unpaid_per_phone then
    raise exception 'UNPAID_ORDERS_OPEN' using errcode = 'P0001';
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
-- Existing rows, to the canonical form.
-- ---------------------------------------------------------------------------
--
-- voucher_customers has a unique index on (voucher_id, phone_digits), so two
-- entries for one voucher that were the same number written two ways would
-- collide. The duplicate is removed first; it named the same customer, so the
-- restriction it expressed survives in the row that stays.
delete from voucher_customers vc
where vc.phone_digits is not null
  and vc.phone_digits <> normalize_phone_digits(vc.phone_digits)
  and exists (
    select 1
    from voucher_customers other
    where other.voucher_id = vc.voucher_id
      and other.phone_digits = normalize_phone_digits(vc.phone_digits)
  );

-- Two non-canonical spellings of one number, neither of them canonical yet.
delete from voucher_customers vc
where vc.phone_digits is not null
  and exists (
    select 1
    from voucher_customers other
    where other.voucher_id = vc.voucher_id
      and other.phone_digits is not null
      and other.phone_digits <> vc.phone_digits
      and normalize_phone_digits(other.phone_digits) = normalize_phone_digits(vc.phone_digits)
      and other.phone_digits < vc.phone_digits
  );

update voucher_customers
  set phone_digits = normalize_phone_digits(phone_digits)
  where phone_digits is not null
    and phone_digits <> normalize_phone_digits(phone_digits);

update voucher_redemptions
  set phone_digits = normalize_phone_digits(phone_digits)
  where phone_digits is not null
    and phone_digits <> normalize_phone_digits(phone_digits);
