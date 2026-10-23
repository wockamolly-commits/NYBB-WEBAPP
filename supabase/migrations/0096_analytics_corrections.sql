-- 0096: what the sales report counts.
--
-- Three corrections to order_analytics (0063), each reproduced against the
-- migrations before it was made:
--
--   1. Abandoned online checkouts counted as orders and as customers. Every QR
--      checkout a customer walked away from became a cancelled order and
--      inflated the order count, the hourly bars and the new-customer count,
--      and then made that person's real first order read as "returning".
--
--   2. Refunds were counted inconsistently. A full refund removed the sale
--      from gross entirely; a refund of all but a peso changed nothing. Gross
--      now counts every paid sale, and the refunds come back as their own
--      figure, refunded_cents, so net is gross minus it.
--
--   3. Customers were told apart by the phone number exactly as typed. They
--      are now matched on the canonical number from 0090.

create or replace function order_analytics(
  from_ts timestamptz,
  to_ts timestamptz,
  p_branch_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
  v_assigned_branch uuid;
  v_branch uuid;
begin
  if current_role_kind() not in ('staff', 'admin') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not current_staff_has_permission('analytics:view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select branch_id into v_assigned_branch
  from profiles
  where id = auth.uid() and is_active;

  -- An assigned profile is pinned to its own counter and the argument is
  -- ignored rather than rejected: the page never sends one for that person, so
  -- an error here would only be reached by somebody hand-calling the function,
  -- and answering with their own branch is the safe reading.
  v_branch := coalesce(v_assigned_branch, p_branch_id);

  with scoped as (
    select
      o.id,
      o.status,
      o.total_cents,
      o.discount_cents,
      o.voucher_id,
      o.customer_phone,
      o.placed_at,
      o.preparing_at,
      o.ready_at,
      o.claimed_at,
      extract(hour from o.placed_at at time zone 'Asia/Manila')::int as manila_hour,
      -- Paid, or paid and since refunded. 0063 read only 'paid', so a refund
      -- of the whole amount (which moves the payment to 'refunded') dropped the
      -- sale out of gross, the average and the item mix, while a refund of all
      -- but a peso (which leaves it 'paid') changed nothing. Since 0096 both
      -- count as sales, and refunds are reported once, in refunded_cents.
      exists (
        select 1 from payments p
        where p.order_id = o.id and p.status in ('paid', 'refunded')
      ) as is_paid,
      -- Whether the sale closed. A rejected or cancelled order is one the
      -- branch refused or the customer pulled, and the money on it is owed
      -- back whether or not a refund has settled yet. 0062 filtered those out
      -- of the discount check on exactly that reasoning, and then counted them
      -- as revenue anyway. That contradiction is what this migration removes.
      o.status not in ('rejected', 'cancelled') as is_closed,
      -- The discount check's row filter. A voucher only shows up in the POS
      -- once a cashier has keyed the ticket in, so counting an order still
      -- sitting in New would invent a gap that is not a mistake. There is no
      -- ZenPOS API (spec section 16), so pos_sync.entered_at, stamped by the
      -- manual re-key, is the only honest answer to "does this order exist in
      -- the POS at all". Rejected and cancelled orders are out because that
      -- sale never closed and no receipt was finalised.
      (
        exists (
          select 1 from pos_sync s
          where s.order_id = o.id and s.entered_at is not null
        )
        and o.status not in ('rejected', 'cancelled')
      ) as rung_in_pos
    from orders o
    where o.placed_at >= from_ts
      and o.placed_at < to_ts
      and o.is_test = false
      and (v_branch is null or o.branch_id = v_branch)
      -- An abandoned online checkout is not an order anybody made. Under
      -- payment first every QR checkout a customer walks away from becomes a
      -- cancelled order, and 0063 counted each one in the order count, the
      -- hourly bars and the no-show share, and counted its phone number as a
      -- customer, so the same person's real first order later read as a
      -- returning one. Refused orders stay in: the kitchen saw those.
      and not (o.status = 'cancelled' and o.cancelled_reason in ('payment_timeout', 'payment_failed'))
  ),
  paid_scoped as (
    select id, total_cents from scoped where is_paid and is_closed
  ),
  paid_payment as (
    select distinct on (o.id)
      o.id as order_id,
      o.total_cents
    from paid_scoped o
    join payments p on p.order_id = o.id and p.status in ('paid', 'refunded')
    order by o.id, p.paid_at nulls last
  ),
  totals as (
    select
      count(*) as orders_count,
      count(*) filter (where is_paid and is_closed) as paid_count,
      coalesce((select sum(total_cents) from paid_payment), 0) as gross_sales_cents,
      coalesce(sum(discount_cents) filter (where rung_in_pos), 0) as discounts_given_cents,
      count(*) filter (where voucher_id is not null and rung_in_pos) as discounted_orders,
      count(*) filter (where rung_in_pos) as rung_in_pos_orders,
      count(*) filter (where status = 'no_show') as no_show_count
    from scoped
  ),
  -- Money that went back on sales counted above. Settled refunds only, for the
  -- reason no_show_cost gives. Gross minus this is what the business kept.
  refunded as (
    select coalesce(sum(r.amount_cents), 0) as refunded_cents
    from refunds r
    join paid_scoped s on s.id = r.order_id
    where r.status = 'succeeded'
  ),
  -- All twenty-four bars, including the empty ones. A chart drawing only the
  -- hours that have orders in them silently rescales its own axis, so a quiet
  -- Tuesday looks exactly like a busy one and the shape a manager came for,
  -- which is where the peak sits, is the thing that gets lost.
  by_hour as (
    select
      h.hour,
      count(s.id) as orders,
      coalesce(sum(s.total_cents) filter (where s.is_paid and s.is_closed), 0) as sales_cents
    from generate_series(0, 23) as h(hour)
    left join scoped s on s.manila_hour = h.hour
    group by h.hour
  ),
  -- Reserved against capacity on the windows real customers actually booked.
  --
  -- Counted from the orders rather than read off pickup_slots.reserved, which
  -- is the counter place_order increments and every release path decrements.
  -- That counter cannot tell a test booking from a real one, so 0062 reported
  -- a utilisation built partly out of rows the is_test flag exists to keep out
  -- of the report: on this database it read 21 of 144 places across 24
  -- windows when only 6 of those reservations belonged to a real customer.
  --
  -- Rejected and cancelled orders are left out because both paths hand the
  -- window back (0036, 0032), so counting them would hold a place the branch
  -- has already resold. A window with no real booking left in it is dropped
  -- from both sides: slots are created on demand as customers pick them
  -- (0012), so a row that exists only because a test order chose it was never
  -- a window the kitchen offered anybody.
  slots as (
    select
      count(*) as slot_count,
      coalesce(sum(real_reserved), 0) as reserved,
      coalesce(sum(capacity), 0) as capacity
    from (
      select
        ps.capacity,
        (
          select count(*)
          from orders o
          where o.pickup_slot_id = ps.id
            and o.is_test = false
            and o.status not in ('rejected', 'cancelled')
        ) as real_reserved
      from pickup_slots ps
      where ps.slot_start >= from_ts
        and ps.slot_start < to_ts
        and (v_branch is null or ps.branch_id = v_branch)
    ) booked
    where real_reserved > 0
  ),
  prep as (
    select
      count(*) as sample,
      percentile_cont(0.5) within group (
        order by extract(epoch from (ready_at - preparing_at))
      ) as median_seconds,
      percentile_cont(0.9) within group (
        order by extract(epoch from (ready_at - preparing_at))
      ) as p90_seconds
    from scoped
    where preparing_at is not null
      and ready_at is not null
      and ready_at >= preparing_at
  ),
  wait as (
    select
      count(*) as sample,
      percentile_cont(0.5) within group (
        order by extract(epoch from (claimed_at - ready_at))
      ) as median_seconds,
      percentile_cont(0.9) within group (
        order by extract(epoch from (claimed_at - ready_at))
      ) as p90_seconds
    from scoped
    where ready_at is not null
      and claimed_at is not null
      and claimed_at >= ready_at
  ),
  -- What the no-shows cost. Payment first (spec section 17) means the customer
  -- has already paid, so the loss is whatever went back out as a refund rather
  -- than an uncollected ticket. Only settled refunds count: a pending one has
  -- not left the account yet and a failed one never will.
  no_show_cost as (
    select coalesce(sum(r.amount_cents), 0) as refunded_cents
    from refunds r
    join scoped s on s.id = r.order_id
    where r.status = 'succeeded'
      and s.status = 'no_show'
  ),
  -- New versus returning, counted in people rather than in tickets.
  --
  -- Keyed on the phone number rather than on the account: user_id is null for
  -- a guest and most orders are placed as guests, so keying on the account
  -- would count the same regular as new every week. customer_phone is not null
  -- on every order (0005), which makes it the only identifier covering the
  -- whole channel.
  --
  -- 0062 asked the question once per order, so a regular who ordered six times
  -- in the range counted six. On this database that read "6 returning, 1 new"
  -- for a range containing exactly one customer. Spec section 20 asks for new
  -- versus returning customers, and a customer is a person: each number is
  -- counted once, and the two sides add up to how many people ordered.
  --
  -- Owner ruling, 2026-09-04: returning means this number has ordered before
  -- at any point, not within a window, so the test runs against its first
  -- order inside the range. Deliberately not branch scoped, because somebody
  -- who first ordered at another counter is still a returning customer of the
  -- business; the classification describes the person, not the counter.
  -- On the canonical number since 0096 (normalize_phone_digits, 0090), so
  -- the same mobile typed as 0917... once and +63 917... another time is one
  -- person rather than two.
  first_seen as (
    select normalize_phone_digits(customer_phone) as phone, min(placed_at) as first_in_range
    from scoped
    group by normalize_phone_digits(customer_phone)
  ),
  customers as (
    select
      count(*) filter (where ordered_before) as returning_customers,
      count(*) filter (where not ordered_before) as new_customers
    from (
      select
        exists (
          select 1 from orders prior
          where normalize_phone_digits(prior.customer_phone) = f.phone
            and prior.placed_at < f.first_in_range
            and prior.is_test = false
            and not (
              prior.status = 'cancelled'
              and prior.cancelled_reason in ('payment_timeout', 'payment_failed')
            )
        ) as ordered_before
      from first_seen f
    ) classified
  ),
  sold_options as (
    select
      oio.name_snapshot,
      oio.heat_percent_snapshot,
      oi.qty
    from order_item_options oio
    join order_items oi on oi.id = oio.order_item_id
    join paid_scoped o on o.id = oi.order_id
  ),
  -- Split by the heat column rather than by the group's name, because a
  -- snapshot is free text that survives a rename and a name test would quietly
  -- stop matching the day somebody retitles the group. Today the non-heat side
  -- is the nine wing flavours and nothing else.
  flavour_mix as (
    select name_snapshot as name, sum(qty)::bigint as qty
    from sold_options
    where heat_percent_snapshot is null
    group by name_snapshot
    order by qty desc, name
    limit 12
  ),
  heat_mix as (
    select
      name_snapshot as name,
      heat_percent_snapshot as heat_percent,
      sum(qty)::bigint as qty
    from sold_options
    where heat_percent_snapshot is not null
    group by name_snapshot, heat_percent_snapshot
    order by heat_percent_snapshot, name
  ),
  top_items as (
    select
      oi.item_name_snapshot as item_name,
      sum(oi.qty)::bigint as qty,
      coalesce(sum(oi.line_total_cents), 0) as sales_cents
    from order_items oi
    join paid_scoped o on o.id = oi.order_id
    group by oi.item_name_snapshot
    order by qty desc, sales_cents desc, item_name
    limit 10
  ),
  -- Two different items on one ticket, counted once per order however many of
  -- each were bought. The join on `>` gives each unordered pair one row and one
  -- direction, so "Wings and Fries" and "Fries and Wings" cannot both appear
  -- and split the count that should have put the pairing top of the list.
  order_item_names as (
    select distinct oi.order_id, oi.item_name_snapshot as item_name
    from order_items oi
    join paid_scoped o on o.id = oi.order_id
  ),
  top_pairings as (
    select
      a.item_name as first_item,
      b.item_name as second_item,
      count(*)::bigint as orders
    from order_item_names a
    join order_item_names b
      on b.order_id = a.order_id and b.item_name > a.item_name
    group by a.item_name, b.item_name
    order by orders desc, first_item, second_item
    limit 10
  )
  select json_build_object(
    -- Which counter these numbers are for, which is not always the one the
    -- caller asked for. Null is the whole business.
    'branch_id', v_branch,
    'orders_count', (select orders_count from totals),
    'paid_count', (select paid_count from totals),
    'gross_sales_cents', (select gross_sales_cents from totals),
    'refunded_cents', (select refunded_cents from refunded),
    'avg_order_value_cents', case
      when (select paid_count from totals) > 0
      then round(
        (select gross_sales_cents from totals)::numeric
        / (select paid_count from totals)
      )
      else 0
    end,
    'discounts', json_build_object(
      'given_cents', (select discounts_given_cents from totals),
      'discounted_orders', (select discounted_orders from totals),
      'rung_in_pos_orders', (select rung_in_pos_orders from totals)
    ),
    'by_hour', coalesce(
      (select json_agg(json_build_object(
        'hour', hour,
        'orders', orders,
        'sales_cents', sales_cents
      ) order by hour) from by_hour),
      '[]'::json
    ),
    'slots', json_build_object(
      'windows', (select slot_count from slots),
      'reserved', (select reserved from slots),
      'capacity', (select capacity from slots)
    ),
    'prep_seconds', json_build_object(
      'sample', (select sample from prep),
      'median', (select round(median_seconds) from prep),
      'p90', (select round(p90_seconds) from prep)
    ),
    'wait_seconds', json_build_object(
      'sample', (select sample from wait),
      'median', (select round(median_seconds) from wait),
      'p90', (select round(p90_seconds) from wait)
    ),
    'no_shows', json_build_object(
      'orders', (select no_show_count from totals),
      'refunded_cents', (select refunded_cents from no_show_cost)
    ),
    'customers', json_build_object(
      'new', (select new_customers from customers),
      'returning', (select returning_customers from customers)
    ),
    'flavour_mix', coalesce(
      (select json_agg(json_build_object('name', name, 'qty', qty)) from flavour_mix),
      '[]'::json
    ),
    'heat_mix', coalesce(
      (select json_agg(json_build_object(
        'name', name,
        'heat_percent', heat_percent,
        'qty', qty
      )) from heat_mix),
      '[]'::json
    ),
    'top_items', coalesce(
      (select json_agg(json_build_object(
        'item_name', item_name,
        'qty', qty,
        'sales_cents', sales_cents
      )) from top_items),
      '[]'::json
    ),
    'top_pairings', coalesce(
      (select json_agg(json_build_object(
        'first_item', first_item,
        'second_item', second_item,
        'orders', orders
      )) from top_pairings),
      '[]'::json
    )
  ) into result;

  return result;
end;
$$;

-- The new-versus-returning lookup now matches on the canonical number, so the
-- index it can use is on that expression.
create index if not exists orders_customer_phone_digits_placed_idx
  on orders (normalize_phone_digits(customer_phone), placed_at);
