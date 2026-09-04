-- 0062_order_analytics.sql
-- The sales report behind /workspace/analytics, and the first thing in this
-- schema that reads analytics:view.
--
-- Ported from the reference implementation's 0074_order_analytics.sql and
-- 0102_order_analytics_discounts.sql (C:\dev\zombeans-web, read only). What
-- carries over is the shape: aggregate in SQL and return one json document, so
-- the page cannot quietly become a row reader that reduces in Node and stops
-- being correct past the first few hundred orders. What does not carry over is
-- the service-mode breakdown, the delivery fees and the rider metrics, none of
-- which exist here. Spec section 20 is the list of what replaced them.
--
-- THREE RULES INHERITED FROM THE REFERENCE, EACH FOR A REASON.
--
-- 1. Test orders are excluded from every figure, not only the money ones. The
--    is_test column (0005) exists because staff place real rows while setting a
--    counter up, and a first week whose order count is inflated is as
--    misleading as one whose revenue is.
-- 2. Revenue collapses to one representative paid payment per order. The
--    unique index payments_order_id_key (0006) already makes that one row
--    today, so this is belt and braces rather than a live defect: if a second
--    payment row per order is ever allowed, this function keeps counting the
--    order once instead of doubling its revenue on the day the index goes.
-- 3. Prep and wait are reported as median and p90, never as a mean. One order
--    that sat forgotten for three hours moves a mean and says nothing about the
--    shift, which is the number a manager is actually asking for.
--
-- THE CLOCK IS ASIA/MANILA, AND THAT IS THE WHOLE POINT OF THE HOUR CHART.
--
-- Every timestamp in this schema is UTC. The branches are in Cebu, so "the 7pm
-- rush" means 19:00 on the counter's own clock, and bucketing in UTC would move
-- every bar eight hours and put the dinner peak at 11:00. The window bounds
-- arrive from the caller as Manila midnights (lib/staff/manila-dates.ts, the
-- same helpers the order history and the audit log use), and the hour buckets
-- are cut here with `at time zone 'Asia/Manila'`. A literal zone rather than a
-- setting: the Philippines has one zone and has never observed daylight saving,
-- which is the reasoning manila-dates.ts already records for its literal +08:00.
--
-- BRANCH SCOPING IS DECIDED HERE, NOT BY THE CALLER.
--
-- 0059 made a staff profile branch scoped. A manager pinned to a counter holds
-- analytics:view from the Manager role, and this function is SECURITY DEFINER,
-- so it runs past the RLS that scopes every other read that person makes. If
-- the branch came from the argument, that manager could read all nine counters
-- by editing a query string, and the page would be the only thing standing in
-- the way. So the assigned branch wins over p_branch_id outright: an assigned
-- profile cannot widen the scope, cannot point it at another counter, and does
-- not get a picker on screen either. An unassigned profile, and the Super
-- Admin, is business wide, and p_branch_id is that person's filter.
--
-- THE PERMISSION IS CHECKED, NOT ASSUMED.
--
-- The reference guards on current_role_kind() alone, which was right there and
-- is not right here: this schema separates a job role from what it may do, and
-- a cashier holds no analytics:view. 0024 is the precedent, and its lesson was
-- that a function asking a different question from the policies around it is a
-- hole waiting for the first role that does not happen to line up. The role
-- check stays in front of it so an anonymous or customer caller is refused on
-- the plainest possible test.

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
      exists (
        select 1 from payments p
        where p.order_id = o.id and p.status = 'paid'
      ) as is_paid,
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
      ) as rung_in_pos,
      -- New versus returning, keyed on the phone number rather than on the
      -- account. user_id is null for a guest and most orders are placed as
      -- guests, so keying on the account would count the same regular as new
      -- every week. customer_phone is not null on every order (0005), which
      -- makes it the only identifier covering the whole channel. Owner ruling,
      -- 2026-09-04: returning means this number has ordered before at any
      -- point, not within a window. Deliberately not branch scoped, because a
      -- customer who first ordered at another counter is still a returning
      -- customer of the business; the classification describes the person
      -- rather than the counter.
      exists (
        select 1 from orders prior
        where prior.customer_phone = o.customer_phone
          and prior.placed_at < o.placed_at
          and prior.is_test = false
      ) as is_returning
    from orders o
    where o.placed_at >= from_ts
      and o.placed_at < to_ts
      and o.is_test = false
      and (v_branch is null or o.branch_id = v_branch)
  ),
  paid_scoped as (
    select id, total_cents from scoped where is_paid
  ),
  paid_payment as (
    select distinct on (o.id)
      o.id as order_id,
      o.total_cents
    from paid_scoped o
    join payments p on p.order_id = o.id and p.status = 'paid'
    order by o.id, p.paid_at nulls last
  ),
  totals as (
    select
      count(*) as orders_count,
      count(*) filter (where is_paid) as paid_count,
      coalesce((select sum(total_cents) from paid_payment), 0) as gross_sales_cents,
      coalesce(sum(discount_cents) filter (where rung_in_pos), 0) as discounts_given_cents,
      count(*) filter (where voucher_id is not null and rung_in_pos) as discounted_orders,
      count(*) filter (where rung_in_pos) as rung_in_pos_orders,
      count(*) filter (where status = 'no_show') as no_show_count,
      count(*) filter (where is_returning) as returning_customers,
      count(*) filter (where not is_returning) as new_customers
    from scoped
  ),
  -- All twenty-four bars, including the empty ones. A chart drawing only the
  -- hours that have orders in them silently rescales its own axis, so a quiet
  -- Tuesday looks exactly like a busy one and the shape a manager came for,
  -- which is where the peak sits, is the thing that gets lost.
  by_hour as (
    select
      h.hour,
      count(s.id) as orders,
      coalesce(sum(s.total_cents) filter (where s.is_paid), 0) as sales_cents
    from generate_series(0, 23) as h(hour)
    left join scoped s on s.manila_hour = h.hour
    group by h.hour
  ),
  -- Reserved against capacity on the windows the kitchen actually opened.
  -- Slots are created on demand as customers pick them (0012), so a window
  -- nobody chose has no row and is correctly absent from both sides of this
  -- ratio: it measures how full the offered windows ran, not how much of the
  -- day went unsold.
  slots as (
    select
      count(*) as slot_count,
      coalesce(sum(reserved), 0) as reserved,
      coalesce(sum(capacity), 0) as capacity
    from pickup_slots ps
    where ps.slot_start >= from_ts
      and ps.slot_start < to_ts
      and (v_branch is null or ps.branch_id = v_branch)
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
      'new', (select new_customers from totals),
      'returning', (select returning_customers from totals)
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

comment on function order_analytics(timestamptz, timestamptz, uuid) is
  'The sales report for [from_ts, to_ts). Requires analytics:view. Hour buckets '
  'are cut in Asia/Manila. A branch-assigned caller is scoped to its own '
  'counter and p_branch_id is ignored; an unassigned caller may filter with it.';

revoke execute on function order_analytics(timestamptz, timestamptz, uuid)
  from public, anon, authenticated;
grant execute on function order_analytics(timestamptz, timestamptz, uuid)
  to authenticated;

-- The returning-customer test is one correlated lookup per order in the
-- window, on a column nothing indexed. Without this it is a sequential scan of
-- orders per row, which is invisible on a demo database and is the first thing
-- to fall over on a real one.
create index if not exists orders_customer_phone_placed_idx
  on orders (customer_phone, placed_at);
