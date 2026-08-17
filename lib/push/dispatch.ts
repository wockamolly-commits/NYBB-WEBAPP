import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { staffPayload, type StaffPayloadOrder } from "./payload";
import { sendWeb, type WebTarget } from "./web";
import {
  adminConfigured,
  createAdminClient,
} from "@/lib/supabase/admin-client";

/**
 * Who to tell about one order, and getting the word to them.
 *
 * The one exported function is called from inside an order mutation: the
 * PayMongo webhook, once a payment clears. That cannot be allowed to fail
 * because a notification failed, so the whole body is one try/catch that logs
 * and returns. `sendWeb` already never rejects on its own, but everything
 * upstream of it (the client, the lookup, the payload build) can still throw,
 * and this is the last place before the caller that could let one of those
 * through.
 *
 * WHY THERE IS NO CUSTOMER HALF.
 * ================================================================
 * There used to be one, and it only ever reached the native app: the customer
 * side of `push_subscriptions` was always `transport = 'expo'`, written by
 * `register_customer_push_device` (0038) from a route that no longer exists.
 * With the app dropped in favour of a web-only product, nothing can register a
 * customer device, so `notifyCustomer` had no reachable audience and went with
 * it. The customer learns about their order from the tracking page, which
 * refreshes itself over Realtime (`components/order/OrderTrackingLiveRefresh.
 * tsx`). Telling a customer's browser directly would mean a web push opt in on
 * the order page, built the way the counter tablet's already is; that is new
 * work, not a thing that was removed.
 */

/** A relationship embed comes back as an object or an array depending on the
 * shape of the foreign key, so every embed here is normalized the same way
 * `lib/staff/orders.ts` and `lib/customer/payment.ts` already do it. */
function first<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Deletes endpoints a sender reported dead. Kept as its own function rather
 * than inlined, since "the push service says this registration is gone" means
 * the same thing regardless of which audience it belonged to, and a second
 * audience is exactly what a customer web push opt in would add. The cascade
 * on `push_subscription_orders` in 0007 removes the follow rows.
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
