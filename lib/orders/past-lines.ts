import "server-only";

import { z } from "zod";
import type { PastOrderLine } from "@/lib/cart/reorder";
import { getStorefrontSession } from "@/lib/auth/session";
import { getOrderByTracking } from "@/lib/orders/reader";

/**
 * A past order's lines, in the one shape `rebuildCartLines` takes.
 *
 * Two sources, because the two kinds of customer reach their own order by
 * different routes and neither route can serve the other. A signed-in customer
 * reads the rows directly, which RLS permits for their own orders. A guest has
 * no readable rows at all and reaches the order through the tracking token,
 * which is precisely why reorder matches on names: the tracking function
 * returns snapshots and deliberately refuses to join back to the menu.
 */

const optionRowSchema = z.object({
  group_name_snapshot: z.string(),
  name_snapshot: z.string(),
});

const lineRowSchema = z.object({
  item_name_snapshot: z.string(),
  variation_label_snapshot: z.string(),
  qty: z.number().int().positive(),
  order_item_options: z.array(optionRowSchema).nullable(),
});

const lineRowsSchema = z.array(lineRowSchema);

/**
 * Read a signed-in customer's own order back, by short code.
 *
 * `null` means the read itself failed: no session, a database error, or a
 * shape Zod would not accept. `[]` does not mean "found and empty".
 * `order_items.order_id` is filtered through an inner join on
 * `orders.short_code` and `orders.user_id = auth.uid()`, and RLS on top of
 * that same `user_id` check, so a code that is not this customer's and a code
 * that does not exist both come back as zero rows rather than an error.
 * `place_order` never creates an order with no items, so in practice `[]`
 * here means "not your order" or "no such order", not "your order had
 * nothing in it". This function cannot tell those apart without a second
 * query, and does not try to; callers that need to fall back to the tracked
 * read on a miss should treat `[]` the same as `null`.
 */
export async function pastLinesForSignedInOrder(
  shortCode: string,
): Promise<PastOrderLine[] | null> {
  const session = await getStorefrontSession();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from("order_items")
    .select(
      "item_name_snapshot, variation_label_snapshot, qty, orders!inner(short_code, user_id), order_item_options(group_name_snapshot, name_snapshot)",
    )
    .eq("orders.short_code", shortCode)
    .eq("orders.user_id", session.user.id);

  if (error) {
    console.error("[reorder] past line read failed:", error.message);
    return null;
  }

  const parsed = lineRowsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[reorder] past lines had an unreadable shape", parsed.error.issues);
    return null;
  }

  return parsed.data.map((row) => ({
    name: row.item_name_snapshot,
    variationLabel: row.variation_label_snapshot,
    quantity: row.qty,
    options: (row.order_item_options ?? []).map((option) => ({
      group: option.group_name_snapshot,
      name: option.name_snapshot,
    })),
  }));
}

/**
 * Read a guest's order back, by short code and tracking token.
 *
 * The token is a bearer credential. It is passed straight through to
 * `getOrderByTracking` and never logged, here or anywhere this call fails.
 *
 * `getOrderByTracking` returns a three way `OrderLookup` rather than the
 * order directly, and "missing" (wrong code or wrong token, indistinguishable
 * on purpose) and "unavailable" (a real outage) are collapsed to `null` here:
 * this caller only needs "could not read it", not why.
 */
export async function pastLinesForTrackedOrder(
  shortCode: string,
  token: string,
): Promise<PastOrderLine[] | null> {
  const lookup = await getOrderByTracking(shortCode, token);
  if (lookup.state !== "found") return null;

  return lookup.order.items.map((item) => ({
    name: item.name,
    variationLabel: item.variationLabel,
    quantity: item.quantity,
    options: item.options.map((option) => ({ group: option.group, name: option.name })),
  }));
}
