-- 0021_order_tracking_realtime.sql
-- Customer-safe status broadcasts for the order tracking page.
--
-- Guest tracking is authorized by the unguessable tracking token, not by a
-- Supabase session. Anonymous clients therefore cannot subscribe directly to
-- orders through Postgres Changes without weakening the table's RLS policy.
-- This trigger publishes only a change signal to a public topic named with
-- that existing bearer token. The browser receives no row data from Realtime.
-- It refreshes the Server Component, which reads the full order again through
-- get_order_by_tracking().

create or replace function broadcast_order_tracking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform realtime.send(
      jsonb_build_object('changed', true),
      'status_changed',
      'order-tracking:' || new.tracking_token::text,
      false
    );
  end if;

  return new;
end;
$$;

revoke execute on function broadcast_order_tracking_status()
  from public, anon, authenticated, service_role;

create trigger orders_broadcast_tracking_status
  after update of status on orders
  for each row
  when (old.status is distinct from new.status)
  execute function broadcast_order_tracking_status();

comment on function broadcast_order_tracking_status() is
  'Signals a tracking-token Broadcast topic after an order status changes. '
  'The payload contains no order or customer data.';
