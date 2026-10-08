-- 0080_staff_arrival_notice.sql
-- Telling the counter, once, that a customer is standing at it.
--
-- Spec N3 says the "I'm here" button pushes to staff. Until now it only set
-- orders.customer_arrived_at, which the board shows as a badge, and a badge
-- only helps whoever is already looking at the board.
--
-- customer_mark_order_arrived (0029) makes a second tap harmless by keeping
-- the first timestamp, but it still answers true to every tap, so its answer
-- cannot tell the caller whether this is the first one. A push on every true
-- would ring the tablet once per impatient tap. The claim below is the same
-- shape as claim_staff_new_order_notice (0048): the guard is the `where`, so
-- two callers racing each other cannot both win.

alter table orders add column staff_arrival_notified_at timestamptz;

comment on column orders.staff_arrival_notified_at is
  'When the counter was told this customer arrived. Written only by '
  'claim_staff_arrival_notice, which is what makes that telling exactly once.';

create function claim_staff_arrival_notice(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_claimed boolean;
begin
  if p_order_id is null then
    return false;
  end if;

  -- Only an order that really has arrived and is still waiting at the counter.
  -- The caller only asks after customer_mark_order_arrived said yes, but this
  -- is the statement that holds the row, so it is the one that checks.
  update public.orders
     set staff_arrival_notified_at = now()
   where id = p_order_id
     and status = 'ready'
     and customer_arrived_at is not null
     and staff_arrival_notified_at is null
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

comment on function claim_staff_arrival_notice(uuid) is
  'Claims the right to tell the counter a customer arrived for one ready order, '
  'once. True means the caller should send; false means somebody already did, '
  'or there is nothing to announce.';

-- Named role by role for the reason 0048 gives. The admin client is the only
-- caller; a browser that could claim this could keep the counter quiet.
revoke execute on function claim_staff_arrival_notice(uuid)
  from public, anon, authenticated, service_role;
grant execute on function claim_staff_arrival_notice(uuid)
  to service_role;
