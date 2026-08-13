-- 0039_expiry_queues_notification.sql
-- The one notification with nobody waiting for it.
--
-- Three of the four notification events happen because somebody made a request,
-- so the send can be attached to that request with after(). This one does not:
-- 0031 schedules the sweep inside Postgres on pg_cron, on purpose, so that
-- expiry does not depend on Vercel's cron limits or an HTTP round trip. That
-- decision is about whether orders get cancelled correctly, which outranks
-- whether a notification is convenient to send, so it stands and the send moves
-- instead.
--
-- So the sweep queues. `notifications` from 0007 is already the right table: it
-- carries status, attempts, sending_started_at and last_error, which is a more
-- complete queue than anything worth writing now.
--
-- The whole function body is restated because `create or replace function`
-- cannot amend one in place. Diff this against 0030 rather than reading it
-- fresh, or a transcription slip in the slot release or the paid-race guard
-- reads as intentional.

create or replace function expire_unpaid_online_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expiry_minutes int;
  v_order_id uuid;
  v_slot_id uuid;
  v_payment_status payment_status;
  v_count integer := 0;
begin
  select online_payment_expiry_minutes into v_expiry_minutes
  from app_settings where id = 1;
  if v_expiry_minutes is null then
    return 0;
  end if;

  for v_order_id, v_slot_id in
    select o.id, o.pickup_slot_id
    from orders o
    join payments p on p.order_id = o.id
    where o.status = 'pending'
      and p.provider = 'paymongo'
      and p.status <> 'paid'
      and o.placed_at < now() - make_interval(mins => v_expiry_minutes)
    for update of o, p skip locked
  loop
    select status into v_payment_status
    from payments where order_id = v_order_id for update;
    if v_payment_status = 'paid' then
      continue;
    end if;

    if v_slot_id is not null then
      update pickup_slots
        set reserved = greatest(reserved - 1, 0)
      where id = v_slot_id;
    end if;

    update orders
      set status = 'cancelled',
          cancelled_at = now(),
          cancelled_reason = 'payment_timeout',
          pickup_slot_id = null
      where id = v_order_id and status = 'pending';

    insert into notifications (channel, target, template, payload)
    select 'push', o.short_code, 'order_cancelled_expired',
           jsonb_build_object('order_id', o.id)
    from orders o where o.id = v_order_id;

    update payments
      set status = 'failed'
      where order_id = v_order_id and status <> 'paid';

    insert into order_status_events (order_id, from_status, to_status, reason)
    values (v_order_id, 'pending', 'cancelled', 'payment_timeout');

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function expire_unpaid_online_orders()
  from public, anon, authenticated;
grant execute on function expire_unpaid_online_orders() to service_role;
