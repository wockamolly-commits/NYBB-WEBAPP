import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  customerPayload,
  staffPayload,
  type CustomerPayloadOrder,
  type StaffPayloadOrder,
} from "./payload";
import { sendExpo } from "./expo";
import { sendWeb, type WebTarget } from "./web";
import {
  adminConfigured,
  createAdminClient,
} from "@/lib/supabase/admin-client";

/**
 * Who to tell about one order, and getting the word to them.
 *
 * Both exported functions are called from inside order mutations: a status
 * change, a webhook, a reject. None of that can be allowed to fail because a
 * notification failed, so the whole body of each is one try/catch that logs
 * and returns. `sendExpo` and `sendWeb` already never reject on their own, but
 * everything upstream of them (the client, the lookup, the payload build) can
 * still throw, and this is the last place before the caller that could let one
 * of those through.
 */

/** A relationship embed comes back as an object or an array depending on the
 * shape of the foreign key, so every embed here is normalized the same way
 * `lib/staff/orders.ts` and `lib/customer/payment.ts` already do it. */
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Deletes endpoints a sender reported dead. Shared by both functions rather
 * than duplicated, since "the push service says this registration is gone"
 * means the same thing regardless of which audience it belonged to. The
 * cascade on `push_subscription_orders` in 0007 removes the follow rows.
 */
async function deleteDeadEndpoints(
  admin: SupabaseClient,
  endpoints: string[],
): Promise<void> {
  if (endpoints.length === 0) return;
  const { error } = await admin
    .from("push_subscriptions")
    .delete()
    .in("endpoint", endpoints);
  if (error) {
    console.error("[push] failed to delete dead endpoints", error.message);
  }
}

// A single template literal, not a `+`-built string: supabase-js only parses
// the select shape at the type level when it sees a literal, and lib/staff/
// orders.ts's `orderSelect` establishes the same convention for that reason.
const ORDER_TIMELINE_SELECT = `
  short_code, tracking_token, status,
  accepted_at, preparing_at, ready_at, claimed_at,
  rejected_at, rejected_reason, cancelled_at, cancelled_reason,
  customer_arrived_at, no_show_at,
  payments ( method, status, amount_cents, paid_at )
`;

/**
 * Tells the customer holding the tracking link what just happened.
 *
 * `customerPayload` needs the full timeline and the full payment, not just the
 * fields this event happens to touch: `statusCopy()`, which it delegates to,
 * reads the refund status and both cancellation reasons regardless of which
 * status triggered the notification. Selecting anything narrower here is a
 * shape that compiles today and breaks the next time a status is added.
 */
export async function notifyCustomer(orderId: string): Promise<void> {
  try {
    if (!adminConfigured()) return;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("orders")
      .select(ORDER_TIMELINE_SELECT)
      .eq("id", orderId)
      .maybeSingle();

    if (error || !data) {
      console.error(
        "[push] notifyCustomer order lookup failed",
        error?.message ?? "order not found",
      );
      return;
    }

    const payment = first(
      data.payments as
        Record<string, unknown> | Record<string, unknown>[] | null,
    );

    const order: CustomerPayloadOrder = {
      shortCode: data.short_code,
      trackingToken: data.tracking_token,
      status: data.status,
      timeline: {
        acceptedAt: data.accepted_at,
        preparingAt: data.preparing_at,
        readyAt: data.ready_at,
        claimedAt: data.claimed_at,
        rejectedAt: data.rejected_at,
        rejectedReason: data.rejected_reason,
        cancelledAt: data.cancelled_at,
        cancelledReason: data.cancelled_reason,
        customerArrivedAt: data.customer_arrived_at,
        noShowAt: data.no_show_at,
      },
      payment: payment
        ? {
            method: payment.method as string,
            status: payment.status as string,
            // bigint columns come back as strings, the same reason
            // lib/customer/payment.ts coerces amount_cents before using it.
            amountCents: Number(payment.amount_cents),
            paidAt: payment.paid_at as string | null,
          }
        : null,
    };

    const payload = customerPayload(order);

    // The customer side of push_subscriptions is always transport = 'expo':
    // register_customer_push_device in 0038 never writes a 'web' row for the
    // customer audience, so filtering on transport alone is enough to reach
    // only that device's endpoints for this order.
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint, push_subscription_orders!inner ( order_code )")
      .eq("transport", "expo")
      .eq("push_subscription_orders.order_code", order.shortCode);

    if (subscriptionsError) {
      console.error(
        "[push] notifyCustomer subscription lookup failed",
        subscriptionsError.message,
      );
      return;
    }

    const targets = ((subscriptions ?? []) as { endpoint: string }[]).map(
      (row) => ({
        endpoint: row.endpoint,
      }),
    );
    const dead = await sendExpo(targets, payload);
    await deleteDeadEndpoints(admin, dead);
  } catch (error) {
    // Deliberately no payload and no url in this line: the payload's url
    // carries the tracking token, and this is the last line that could leak
    // one into a log by accident.
    console.error(
      "[push] notifyCustomer failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}

/**
 * Tells whoever is behind the counter that an order is waiting on them.
 *
 * The item count here means the same thing `cartQuantity` means on the
 * storefront, a sum of line quantities rather than a count of distinct lines,
 * so "3 items" reads the same way in the cart and on the counter's lock
 * screen.
 */
export async function notifyStaffOfNewOrder(orderId: string): Promise<void> {
  try {
    if (!adminConfigured()) return;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("orders")
      .select(
        "short_code, branch_id, branches ( short_name ), pickup_slots ( slot_start )",
      )
      .eq("id", orderId)
      .maybeSingle();

    if (error || !data) {
      console.error(
        "[push] notifyStaffOfNewOrder order lookup failed",
        error?.message ?? "order not found",
      );
      return;
    }

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("qty")
      .eq("order_id", orderId);

    if (itemsError) {
      console.error(
        "[push] notifyStaffOfNewOrder item lookup failed",
        itemsError.message,
      );
      return;
    }

    const itemCount = ((items ?? []) as { qty: number }[]).reduce(
      (total, item) => total + item.qty,
      0,
    );
    const branch = first(
      data.branches as { short_name: string } | { short_name: string }[] | null,
    );
    const pickupSlot = first(
      data.pickup_slots as
        { slot_start: string } | { slot_start: string }[] | null,
    );

    const order: StaffPayloadOrder = {
      shortCode: data.short_code,
      branchShortName: branch?.short_name ?? "",
      itemCount,
      pickupStartsAt: pickupSlot?.slot_start ?? null,
    };

    const payload = staffPayload(order);

    const { data: targets, error: targetsError } = await admin.rpc(
      "staff_push_targets",
      {
        p_branch_id: data.branch_id,
      },
    );

    if (targetsError || !targets) {
      console.error(
        "[push] staff_push_targets failed",
        targetsError?.message ?? "no data",
      );
      return;
    }

    const dead = await sendWeb(targets as WebTarget[], payload);
    await deleteDeadEndpoints(admin, dead);
  } catch (error) {
    console.error(
      "[push] notifyStaffOfNewOrder failed",
      error instanceof Error ? error.message : "unknown",
    );
  }
}
