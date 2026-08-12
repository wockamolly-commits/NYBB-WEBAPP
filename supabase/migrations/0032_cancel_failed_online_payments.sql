-- 0032_cancel_failed_online_payments.sql
-- A definitive PayMongo failure cancels the provisional order immediately.
--
-- Apply after 0030_paymongo_payment_lifecycle.sql. Abandoned payment intents
-- still use expire_unpaid_online_orders(); this path handles a provider event
-- that explicitly says the payment failed.

create or replace function apply_paymongo_payment(
  p_intent_id text,
  p_status text,
  p_payment_id text,
  p_raw jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment_id uuid;
  v_order_id uuid;
  v_payment_status payment_status;
  v_order_status order_status;
  v_slot_id uuid;
begin
  if p_status not in ('paid', 'failed') then
    raise exception 'INVALID_PAYMENT_STATUS' using errcode = 'P0001';
  end if;

  select p.id, p.order_id, p.status, o.status, o.pickup_slot_id
    into v_payment_id, v_order_id, v_payment_status, v_order_status, v_slot_id
  from payments p
  join orders o on o.id = p.order_id
  where p.provider = 'paymongo'
    and p.provider_intent_id = p_intent_id
  for update of p, o;

  if v_payment_id is null then
    return;
  end if;

  if p_status = 'paid' then
    if v_payment_status = 'paid' then
      return;
    end if;

    update payments
      set status = 'paid',
          paid_at = now(),
          provider_payment_id = coalesce(nullif(p_payment_id, ''), provider_payment_id),
          raw_webhook = p_raw,
          needs_refund = v_order_status in ('cancelled', 'rejected')
      where id = v_payment_id;
  elsif v_payment_status <> 'paid' then
    update payments
      set status = 'failed', raw_webhook = p_raw
      where id = v_payment_id;

    if v_order_status = 'pending' then
      if v_slot_id is not null then
        update pickup_slots
          set reserved = greatest(reserved - 1, 0)
        where id = v_slot_id;
      end if;

      update orders
        set status = 'cancelled',
            cancelled_at = now(),
            cancelled_reason = 'payment_failed',
            pickup_slot_id = null
        where id = v_order_id
          and status = 'pending';

      insert into order_status_events (order_id, from_status, to_status, reason)
      select order_id, 'pending', 'cancelled', 'payment_failed'
      from payments
      where id = v_payment_id;
    end if;
  end if;
end;
$$;

revoke execute on function apply_paymongo_payment(text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function apply_paymongo_payment(text, text, text, jsonb)
  to service_role;
