-- 0013_place_order.sql
-- Checkout. The one place an order comes into existence.
--
-- Everything a customer sends is a name: an item slug, a variation slug, an
-- option slug, a quantity, a pickup minute. Not one peso arrives from the
-- browser and not one peso is added up outside this function. That is spec
-- section 22 item 4, and it is the reason lib/menu/line-pricing.ts carries a
-- comment saying it is the display side of this arithmetic and must lose any
-- argument with it.
--
-- WHAT THIS FUNCTION REFUSES TO REIMPLEMENT.
--
-- Four rules already have exactly one definition each, and this calls all four
-- rather than restating any of them:
--
--   resolve_price_list_id()        which price list applies (0011)
--   resolve_variation_price_cents() what a size costs (0003)
--   resolve_option_price_cents()   what an option adds (0003)
--   branch_accepts_orders()        whether the shop can take this at all (0008)
--   get_pickup_slots()             which windows exist (0012)
--
-- The last one matters most. The picker renders what get_pickup_slots returns
-- and this books against the same call, so the screen cannot offer a minute
-- the transaction would then refuse, and neither can drift from the other when
-- somebody edits opening hours. The alternative, re-deriving the grid here,
-- is the same mistake as keeping hours in two places, and it fails in the
-- worst possible way: a customer is told 7:15pm and the order lands at 7:00.
--
-- WHAT IT DOES OWN.
--
-- Atomicity. A function body is one transaction, so the pickup_slots
-- increment, the order, its items, its options, the payment row and the status
-- event either all exist or none do. Two customers racing for the last 7:00pm
-- window cannot both win: the loser's UPDATE violates
-- pickup_slots_within_capacity and takes their whole order down with it.

-- ---------------------------------------------------------------------------
-- Limits, stated once.
-- ---------------------------------------------------------------------------
--
-- MAX_QUANTITY here is 20, not the 50 that order_items allows. The two are
-- different bounds for different jobs: the table constraint is a sanity limit
-- on any row anybody ever writes, including the staff-entered orders of Phase
-- 2, while 20 is what lib/menu/line-pricing.ts clamps a customer to. This
-- function has to agree with that file, so it enforces that file's number.
--
-- 50 lines matches MAX_LINES in lib/cart/lines.ts, which in turn matches
-- customer_carts_lines_bounded in 0004.

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
  if nullif(p_payload->>'voucher_code', '') is not null
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
    select mi.id, mi.name
      into v_item
      from menu_items mi
      join menu_categories mc on mc.id = mi.category_id and mc.is_active
      where mi.slug = v_line->>'item_slug'
        and mi.is_active;

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
  -- discount_cents stays zero until the voucher engine ships behind its flag.
  -- The column exists now so the total is computed the same way then as now.
  v_total := v_subtotal;

  update orders
    set subtotal_cents = v_subtotal,
        total_cents = v_total
    where id = v_order_id;

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
    'discountCents', 0,
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

comment on function place_order(jsonb, uuid) is
  'Places one pickup order, idempotently on p_attempt_id. The client sends '
  'slugs, quantities and a pickup minute; every peso is resolved here from the '
  'price list the branch points at. Books the pickup window in the same '
  'transaction as the order, so a full window is genuinely unbookable.';

-- ---------------------------------------------------------------------------
-- Grants, in the migration that creates the function, per 0010.
-- ---------------------------------------------------------------------------
--
-- anon as well as authenticated, and that is not an oversight. A guest has to
-- be able to place an order and a signed-in customer has to reach this AS
-- themselves, so that auth.uid() stamps orders.user_id: calling it through a
-- service-role client would make every order a guest order and hand the
-- storefront a key it has no business holding.
revoke execute on function place_order(jsonb, uuid) from public;
grant execute on function place_order(jsonb, uuid) to anon, authenticated;
