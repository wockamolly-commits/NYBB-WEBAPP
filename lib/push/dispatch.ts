import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  customerPayload,
  staffPayload,
  type CustomerPayloadOrder,
  type StaffPayloadOrder,
} from "./payload";
import { sendWeb, type WebTarget } from "./web";
import {
  adminConfigured,
  createAdminClient,
} from "@/lib/supabase/admin-client";

/**
 * Who to tell about one order, and getting the word to them.
 *
 * Both exported functions are called from inside an order mutation: a status
 * change, a webhook, a reject. None of that can be allowed to fail because a
 * notification failed, so the whole body of each is one try/catch that logs
 * and returns. `sendWeb` already never rejects on its own, but everything
 * upstream of it (the client, the lookup, the payload build) can still throw,
 * and this is the last place before the caller that could let one of those
 * through.
 *
 * Both audiences are Web Push. The `transport` column on `push_subscriptions`
 * is what tells them apart, `'web'` for the customer's browser and the
 * counter tablet alike; there is no separate delivery mechanism per audience
 * anymore.
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
 * The row `ORDER_TIMELINE_SELECT` asks for, checked rather than trusted.
 *
 * Shaped like `lib/staff/orders.ts`'s `rowSchema`: a service-role select
 * embedding a related table is still a boundary, and a column that drifts out
 * from under this file should be a logged skip, not a wrong sentence quietly
 * pushed to a stranger's lock screen or a raw exception swallowed by the
 * try/catch with nothing to say why.
 */
const paymentRowSchema = z.object({
  method: z.string(),
  status: z.string(),
  // bigint columns come back as strings, the same reason
  // lib/customer/payment.ts coerces amount_cents before using it.
  amount_cents: z.coerce.number().int().nonnegative(),
  paid_at: z.string().nullable(),
});

const customerOrderRowSchema = z.object({
  short_code: z.string().min(1),
  tracking_token: z.uuid(),
  status: z.enum([
    "pending",
    "accepted",
    "preparing",
    "ready",
    "claimed",
    "rejected",
    "cancelled",
    "no_show",
  ]),
  accepted_at: z.string().nullable(),
  preparing_at: z.string().nullable(),
  ready_at: z.string().nullable(),
  claimed_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
  rejected_reason: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_reason: z.string().nullable(),
  customer_arrived_at: z.string().nullable(),
  no_show_at: z.string().nullable(),
  payments: z.union([paymentRowSchema, z.array(paymentRowSchema)]).nullable(),
});

/**
 * The row the select below asks for, checked rather than trusted.
 *
 * Shaped like `lib/staff/orders.ts`'s `rowSchema`: a service-role select
 * embedding a related table is still a boundary, and a column that drifts out
 * from under this file should be a logged skip, not a wrong sentence quietly
 * pushed to the counter's lock screen or a raw exception swallowed by the
 * try/catch with nothing to say why.
 */
const staffOrderRowSchema = z.object({
  short_code: z.string().min(1),
  branch_id: z.uuid(),
  branches: z
    .union([
      z.object({ short_name: z.string() }),
      z.array(z.object({ short_name: z.string() })),
    ])
    .nullable(),
  pickup_slots: z
    .union([
      z.object({ slot_start: z.string() }),
      z.array(z.object({ slot_start: z.string() })),
    ])
    .nullable(),
});

const orderItemRowSchema = z.object({ qty: z.number().int().positive() });

/**
 * Why this reports back at all, given that it never throws.
 *
 * It has to be fire and forget: a notification send must never fail the order
 * mutation that triggered it, which is a hard rule in spec section 15. So every
 * failure inside is caught and logged, and for most callers (`after(...)` on a
 * status change) the answer is genuinely of no use.
 *
 * `drainPushQueue` is the exception, and the reason this type exists. It writes
 * a row's outcome to `notifications.status`, and without an answer here it wrote
 * `sent` for a row whose order could not be read, whose subscription lookup
 * failed, or whose customer has no device registered. That made `failed: 0` in
 * the cron response and `status = 'sent'` in the table mean nothing at all,
 * which matters most on the one path that tells somebody their order was
 * cancelled for non-payment.
 *
 * `delivered` counts endpoints actually handed to the push service, so `{ ok:
 * true, delivered: 0 }` is a real and common answer: the customer never
 * registered a device. That is not a failure and retrying it would never help,
 * which is why it is not one.
 */
export type CustomerNotifyFailure =
  | "admin_unconfigured"
  | "order_lookup_failed"
  | "order_unreadable"
  | "subscription_lookup_failed"
  | "unexpected_error";

export type CustomerNotifyResult =
  | { ok: true; delivered: number }
  | { ok: false; reason: CustomerNotifyFailure };

/**
 * Tells the customer holding the tracking link what just happened.
 *
 * `customerPayload` needs the full timeline and the full payment, not just the
 * fields this event happens to touch: `statusCopy()`, which it delegates to,
 * reads the refund status and both cancellation reasons regardless of which
 * status triggered the notification. Selecting anything narrower here is a
 * shape that compiles today and breaks the next time a status is added.
 *
 * Resolves in every case and rejects in none. See the note on
 * `CustomerNotifyResult` for what the answer is for.
 */
export async function notifyCustomer(orderId: string): Promise<CustomerNotifyResult> {
  try {
    if (!adminConfigured()) return { ok: false, reason: "admin_unconfigured" };
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
      return { ok: false, reason: "order_lookup_failed" };
    }

    const parsed = customerOrderRowSchema.safeParse(data);
    if (!parsed.success) {
      // Never the row itself: it carries the tracking token, and the issue
      // list only names which fields and constraints did not match.
      console.error(
        "[push] notifyCustomer unreadable order row",
        parsed.error.issues,
      );
      return { ok: false, reason: "order_unreadable" };
    }
    const row = parsed.data;
    const payment = first(row.payments);

    const order: CustomerPayloadOrder = {
      shortCode: row.short_code,
      trackingToken: row.tracking_token,
      status: row.status,
      timeline: {
        acceptedAt: row.accepted_at,
        preparingAt: row.preparing_at,
        readyAt: row.ready_at,
        claimedAt: row.claimed_at,
        rejectedAt: row.rejected_at,
        rejectedReason: row.rejected_reason,
        cancelledAt: row.cancelled_at,
        cancelledReason: row.cancelled_reason,
        customerArrivedAt: row.customer_arrived_at,
        noShowAt: row.no_show_at,
      },
      payment: payment
        ? {
            method: payment.method,
            status: payment.status,
            amountCents: payment.amount_cents,
            paidAt: payment.paid_at,
          }
        : null,
    };

    const payload = customerPayload(order);

    // The customer side of push_subscriptions is transport = 'web' since 0047.
    // The 'expo' rows 0038 could write are unreachable now, and filtering here
    // is what keeps a stale one from ever being handed to a Web Push sender
    // that cannot use it.
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key, push_subscription_orders!inner ( order_code )")
      .eq("transport", "web")
      .eq("push_subscription_orders.order_code", order.shortCode);

    if (subscriptionsError) {
      console.error(
        "[push] notifyCustomer subscription lookup failed",
        subscriptionsError.message,
      );
      return { ok: false, reason: "subscription_lookup_failed" };
    }

    const targets = ((subscriptions ?? []) as WebTarget[]).map((row) => ({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth_key: row.auth_key,
    }));
    const dead = await sendWeb(targets, payload);
    await deleteDeadEndpoints(admin, dead);

    // Endpoints the push service did not reject. `sendWeb` resolves to the ones
    // that are gone for good, so this is the count genuinely handed over, not
    // the count attempted.
    return { ok: true, delivered: Math.max(0, targets.length - dead.length) };
  } catch (error) {
    // Deliberately no payload and no url in this line: the payload's url
    // carries the tracking token, and this is the last line that could leak
    // one into a log by accident.
    console.error(
      "[push] notifyCustomer failed",
      error instanceof Error ? error.message : "unknown",
    );
    return { ok: false, reason: "unexpected_error" };
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

    const parsedOrder = staffOrderRowSchema.safeParse(data);
    if (!parsedOrder.success) {
      console.error(
        "[push] notifyStaffOfNewOrder unreadable order row",
        parsedOrder.error.issues,
      );
      return;
    }
    const orderRow = parsedOrder.data;

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

    const parsedItems = z.array(orderItemRowSchema).safeParse(items ?? []);
    if (!parsedItems.success) {
      console.error(
        "[push] notifyStaffOfNewOrder unreadable order_items rows",
        parsedItems.error.issues,
      );
      return;
    }

    const itemCount = parsedItems.data.reduce(
      (total, item) => total + item.qty,
      0,
    );
    const branch = first(orderRow.branches);
    const pickupSlot = first(orderRow.pickup_slots);

    const order: StaffPayloadOrder = {
      shortCode: orderRow.short_code,
      branchShortName: branch?.short_name ?? "",
      itemCount,
      pickupStartsAt: pickupSlot?.slot_start ?? null,
    };

    const payload = staffPayload(order);

    const { data: targets, error: targetsError } = await admin.rpc(
      "staff_push_targets",
      {
        p_branch_id: orderRow.branch_id,
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
