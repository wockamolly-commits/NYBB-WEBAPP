-- 0029_customer_arrival.sql
-- Let the authorized customer signal that they have reached the pickup counter.
--
-- This lands after the tracking reader and its data-free realtime trigger. The
-- customer can identify an order with the same bearer token that reads it, or
-- as that order's signed-in owner. The function deliberately returns false for
-- a bad credential, an absent order, and an order that is not ready, so the
-- action does not become another way to enumerate short codes.

create or replace function customer_mark_order_arrived(
  p_short_code text,
  p_tracking_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_order orders%rowtype;
begin
  if v_code = '' then
    return false;
  end if;

  select * into v_order
  from orders o
  where o.short_code = v_code
    and (
      o.tracking_token::text = v_token
      or (auth.uid() is not null and o.user_id = auth.uid())
    )
  for update;

  -- This signal belongs to the Ready column. Returning the same false for
  -- every refusal avoids making the order status or bearer credential visible
  -- to an unauthorised caller.
  if not found or v_order.status <> 'ready' then
    return false;
  end if;

  -- A customer can tap twice on a slow connection. The first timestamp is the
  -- useful one, so retain it and make the replay harmless.
  update orders
  set customer_arrived_at = coalesce(customer_arrived_at, now())
  where id = v_order.id;

  return true;
end;
$$;

comment on function customer_mark_order_arrived(text, text) is
  'Marks a ready order as arrived for its tracking-token holder or signed-in '
  'owner. Refusals are deliberately indistinguishable.';

revoke execute on function customer_mark_order_arrived(text, text)
  from public, anon, authenticated;
grant execute on function customer_mark_order_arrived(text, text)
  to anon, authenticated;
