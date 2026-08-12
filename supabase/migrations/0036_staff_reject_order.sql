-- 0036_staff_reject_order.sql
-- The refusal a branch has always been able to mean and never been able to say.
--
-- Apply after 0033_staff_refunds.sql. `rejected` has existed in order_status
-- since 0001 and the customer's tracking page has rendered it since Phase 1,
-- but nothing could write it: staff_set_order_status accepts preparing, ready
-- and claimed and refuses everything else. A branch that ran out of wings had
-- to leave the order sitting in New until the expiry sweep took it, which tells
-- the customer their payment timed out. That is a lie about whose fault it was.
--
-- WHY THIS IS ITS OWN FUNCTION RATHER THAN A FOURTH BRANCH IN 0018.
-- ================================================================
-- Every branch of staff_set_order_status moves an order forward along one
-- ladder, and each one is reachable from exactly one rung. This does not: it is
-- reachable from four states, it releases a reserved pickup window, and it
-- takes a reason that ends up on a customer's screen. Folding it in would mean
-- restating that whole function to add an argument only one path uses, and
-- 0024 already had to restate it verbatim once.
--
-- WHY IT DOES NOT REFUND.
-- ================================================================
-- The owner's ruling on 2026-08-12 is that rejecting and refunding are two
-- deliberate steps by a person, not one automatic sequence. So this marks the
-- money as owed and stops. `payments.needs_refund` is the flag 0032 already
-- introduced for the same situation arriving from the other direction, where a
-- payment lands after an order has been rejected, and staff_request_refund does
-- not care what status an order is in, only that its payment is paid. The
-- rejected order stays reachable in the workspace history, which is where the
-- refund control lives.

create or replace function staff_reject_order(
  p_order_id uuid,
  p_reason text
)
returns order_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_order orders%rowtype;
  v_payment payments%rowtype;
  v_owes_refund boolean := false;
begin
  if not current_staff_has_permission('orders:manage') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;

  -- The same closed list as lib/orders/reject-reasons.ts, checked here because
  -- a client-side list is a suggestion. The customer's tracking page turns this
  -- code into a sentence; the database never stores the sentence.
  if p_reason is null or p_reason not in ('sold_out', 'too_busy', 'closing', 'other') then
    raise exception 'REJECT_REASON_INVALID' using errcode = 'P0001';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if not current_staff_can_access_branch(v_order.branch_id) then
    raise exception 'FORBIDDEN_BRANCH' using errcode = 'P0001';
  end if;

  -- A replay is harmless and leaves no second trail, matching 0018.
  if v_order.status = 'rejected' then
    return 'rejected'::order_status;
  end if;

  -- Everything before the handover, and nothing after it. A claimed order has
  -- been eaten; refusing it afterwards is a refund conversation, not a status.
  -- Ready is included on purpose: a kitchen can discover a problem with food
  -- that is already on the counter, and the alternative is handing it over.
  if v_order.status not in ('pending', 'accepted', 'preparing', 'ready') then
    raise exception 'INVALID_TRANSITION:%->rejected', v_order.status
      using errcode = 'P0001';
  end if;

  -- Give the window back before anything else can take it. A rejected order
  -- holding a slot is capacity the branch has refused and cannot resell, and
  -- the same greatest(reserved - 1, 0) guard 0032 uses keeps a double release
  -- from driving the count negative.
  if v_order.pickup_slot_id is not null then
    update pickup_slots
      set reserved = greatest(reserved - 1, 0)
    where id = v_order.pickup_slot_id;
  end if;

  select * into v_payment from payments where order_id = p_order_id for update;
  if found and v_payment.status = 'paid' then
    v_owes_refund := true;
    update payments set needs_refund = true where id = v_payment.id;
  end if;

  update orders set
    status = 'rejected',
    rejected_at = coalesce(rejected_at, v_now),
    rejected_reason = p_reason,
    pickup_slot_id = null
  where id = p_order_id;

  insert into order_status_events
    (order_id, from_status, to_status, actor_profile_id, reason)
  values
    (p_order_id, v_order.status, 'rejected', v_uid, p_reason);

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, branch_id, diff)
  values (
    v_uid,
    'order.rejected',
    'orders',
    p_order_id::text,
    v_order.branch_id,
    jsonb_build_object(
      'from', v_order.status,
      'to', 'rejected',
      'reason', p_reason,
      'owesRefund', v_owes_refund
    )
  );

  return 'rejected'::order_status;
end;
$$;

revoke execute on function staff_reject_order(uuid, text)
  from public, anon;
grant execute on function staff_reject_order(uuid, text)
  to authenticated;
