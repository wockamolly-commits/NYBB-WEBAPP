-- 0014_order_tracking.sql
-- The customer's own view of their order, and the only way a guest has one.
--
-- 0005 wrote the reasoning into the schema and this is where it is honoured:
-- short_code is drawn from a 31-character alphabet six characters long, so it
-- can be read aloud across a counter, which by construction means it can be
-- guessed at scale. The order carries a name, a phone number and, once staff
-- exist, a lifecycle. So the short code identifies the order and the
-- tracking_token authorizes reading it, and the two are required together.
--
-- WHY IT RETURNS NULL RATHER THAN RAISING.
--
-- A wrong token and a code that never existed must be indistinguishable from
-- the outside. If a missing order said "no such order" and a bad token said
-- "not yours", the short code space could be scraped for which codes are real
-- before anybody bothered attacking a token. Same reasoning as the voucher
-- policy in 0009: one answer for both, so there is nothing to learn from the
-- difference.
--
-- WHAT IT IS NOT.
--
-- It is not a status *feed*. It returns whatever is true when it is called,
-- and the page renders per request like every other route here. Realtime lands
-- with the staff board in Phase 2, which is also the first time any status
-- past 'pending' can be reached at all.

create or replace function get_order_by_tracking(
  p_short_code text,
  p_tracking_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Upper-cased and trimmed, because this arrives from a URL a person may
  -- have typed off a screenshot, and NY-ABC234 is the same order as ny-abc234.
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_order orders%rowtype;
  v_branch branches%rowtype;
  v_slot pickup_slots%rowtype;
  v_payment payments%rowtype;
  v_items jsonb;
begin
  if v_code = '' then
    return null;
  end if;

  select * into v_order
  from orders o
  where o.short_code = v_code
    and (
      -- The token is the guest's key. The cast is on the column rather than on
      -- the input so a malformed token is a miss rather than an error: an
      -- invalid uuid cast would raise, and a raise is a different answer from
      -- a null, which is the whole distinction this function refuses to make.
      o.tracking_token::text = v_token
      -- Or the customer's own session, once customer sign-in exists. Written
      -- now because it costs one line and because a signed-in customer opening
      -- their order history should not need a token they never saw.
      or (auth.uid() is not null and o.user_id = auth.uid())
    );

  if not found then
    return null;
  end if;

  select * into v_branch from branches where id = v_order.branch_id;
  select * into v_payment from payments where order_id = v_order.id;
  if v_order.pickup_slot_id is not null then
    select * into v_slot from pickup_slots where id = v_order.pickup_slot_id;
  end if;

  -- The snapshots, not the menu. An order placed last Tuesday says what was
  -- actually sold, at the price actually charged, however the menu has been
  -- edited since. That is what the *_snapshot columns in 0005 are for, and
  -- joining back to menu_items here would quietly undo them.
  select coalesce(jsonb_agg(item.line order by item.name, item.id), '[]'::jsonb)
    into v_items
  from (
    select
      oi.id,
      oi.item_name_snapshot as name,
      jsonb_build_object(
        'name', oi.item_name_snapshot,
        'variationLabel', oi.variation_label_snapshot,
        'quantity', oi.qty,
        'unitPriceCents', oi.unit_price_cents,
        'lineTotalCents', oi.line_total_cents,
        'notes', oi.notes,
        'options', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'group', oio.group_name_snapshot,
                'name', oio.name_snapshot,
                'priceCents', oio.price_cents,
                'heatPercent', oio.heat_percent_snapshot
              )
              order by oio.price_cents, oio.name_snapshot
            )
            from order_item_options oio
            where oio.order_item_id = oi.id
          ),
          '[]'::jsonb
        )
      ) as line
    from order_items oi
    where oi.order_id = v_order.id
  ) item;

  return jsonb_build_object(
    'shortCode', v_order.short_code,
    'status', v_order.status,
    'placedAt', v_order.placed_at,
    -- The four digit counter handoff code (spec section 10, N2). It is the
    -- reason this page needs a token at all: anybody holding this URL can read
    -- the code that claims the order.
    'pickupCode', v_order.pickup_code,
    -- The end is derived from the branch's current slot length, because
    -- pickup_slots stores a start and a capacity and nothing else: the grid is
    -- a function of the branch, exactly as get_pickup_slots computes it. The
    -- one case where that is imprecise is an order placed before somebody
    -- changed pickup_slot_minutes, which would redraw a past window by a few
    -- minutes. Storing an end on the row would fix it and is not worth a
    -- column until a branch has actually changed its granularity.
    'pickup', case
      when v_slot.id is null then null
      else jsonb_build_object(
        'startsAt', v_slot.slot_start,
        'endsAt', v_slot.slot_start
          + make_interval(mins => v_branch.pickup_slot_minutes)
      )
    end,
    'branch', jsonb_build_object(
      'slug', v_branch.slug,
      'name', v_branch.name,
      'shortName', v_branch.short_name,
      'timezone', v_branch.timezone,
      'addressLine', v_branch.address_line,
      'city', v_branch.city,
      'phones', to_jsonb(v_branch.phones)
    ),
    'customer', jsonb_build_object(
      'name', v_order.customer_name,
      'phone', v_order.customer_phone,
      'email', v_order.customer_email
    ),
    'items', v_items,
    'subtotalCents', v_order.subtotal_cents,
    'discountCents', v_order.discount_cents,
    'totalCents', v_order.total_cents,
    'notes', v_order.notes,
    'payment', case
      when v_payment.id is null then null
      else jsonb_build_object(
        'method', v_payment.method,
        'status', v_payment.status,
        'amountCents', v_payment.amount_cents,
        'paidAt', v_payment.paid_at
      )
    end,
    -- Every timestamp the lifecycle stamps, so the page can say what happened
    -- and when rather than only what is true now. Nulls are meaningful: they
    -- are the steps that have not happened.
    'timeline', jsonb_build_object(
      'acceptedAt', v_order.accepted_at,
      'preparingAt', v_order.preparing_at,
      'readyAt', v_order.ready_at,
      'claimedAt', v_order.claimed_at,
      'rejectedAt', v_order.rejected_at,
      'rejectedReason', v_order.rejected_reason,
      'cancelledAt', v_order.cancelled_at,
      'cancelledReason', v_order.cancelled_reason,
      'customerArrivedAt', v_order.customer_arrived_at,
      'noShowAt', v_order.no_show_at
    )
  );
end;
$$;

comment on function get_order_by_tracking(text, text) is
  'One order, for the customer holding its tracking token or signed in as its '
  'owner. Returns null for a wrong token and for a code that does not exist, '
  'because telling those two apart would make the short code space scrapable.';

-- ---------------------------------------------------------------------------
-- Grants, in the migration that creates the function, per 0010.
-- ---------------------------------------------------------------------------
--
-- The public surface goes from six to seven. This one returns a customer's own
-- name and phone number, which is why it is the only read here that requires
-- a secret to reach it.
revoke execute on function get_order_by_tracking(text, text) from public;
grant execute on function get_order_by_tracking(text, text) to anon, authenticated;
