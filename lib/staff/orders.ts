import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { manilaDayStartIso } from "./dashboard";
import type { WorkspaceOrder } from "./order-types";

const orderSelect = `
  id, short_code, status, is_test, customer_name, total_cents, notes, placed_at,
  customer_arrived_at, branch_id,
  pickup_slots ( slot_start ),
  payments ( method, status ),
  order_items (
    qty, item_name_snapshot, variation_label_snapshot,
    order_item_options ( name_snapshot, heat_percent_snapshot )
  )
`;

const optionSchema = z.object({
  name_snapshot: z.string(),
  heat_percent_snapshot: z.number().int().min(0).max(100).nullable(),
});

const itemSchema = z.object({
  qty: z.number().int().positive(),
  item_name_snapshot: z.string(),
  variation_label_snapshot: z.string(),
  order_item_options: z.array(optionSchema).nullable(),
});

const rowSchema = z.object({
  id: z.uuid(),
  short_code: z.string(),
  status: z.enum(["pending", "accepted", "preparing", "ready", "claimed"]),
  is_test: z.boolean(),
  customer_name: z.string(),
  total_cents: z.coerce.number().int().nonnegative(),
  notes: z.string().nullable(),
  placed_at: z.string(),
  customer_arrived_at: z.string().nullable(),
  pickup_slots: z.union([z.object({ slot_start: z.string() }), z.array(z.object({ slot_start: z.string() }))]).nullable(),
  payments: z.union([z.object({ method: z.string(), status: z.string() }), z.array(z.object({ method: z.string(), status: z.string() }))]).nullable(),
  order_items: z.array(itemSchema).nullable(),
});

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toWorkspaceOrder(value: unknown): WorkspaceOrder | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) {
    console.error("[workspace] skipped unreadable order", parsed.error.issues);
    return null;
  }
  const row = parsed.data;
  const pickup = first(row.pickup_slots);
  const payment = first(row.payments);
  const items = row.order_items ?? [];
  const heatLevels = new Set<string>();
  for (const item of items) {
    for (const option of item.order_item_options ?? []) {
      if (option.heat_percent_snapshot !== null) heatLevels.add(option.name_snapshot);
    }
  }

  return {
    id: row.id,
    shortCode: row.short_code,
    status: row.status,
    isTest: row.is_test,
    customerName: row.customer_name,
    totalCents: row.total_cents,
    notes: row.notes,
    placedAt: row.placed_at,
    pickupAt: pickup?.slot_start ?? null,
    customerArrived: row.customer_arrived_at !== null,
    payment,
    items: items.map((item) => ({
      quantity: item.qty,
      name: item.item_name_snapshot,
      variation: item.variation_label_snapshot,
      options: (item.order_item_options ?? []).map((option) => option.name_snapshot),
    })),
    heatLevels: [...heatLevels],
  };
}

export async function getWorkspaceOrders(
  branchId: string | null,
): Promise<WorkspaceOrder[] | null> {
  const supabase = await createReadOnlyStaffClient();
  const activeQuery = supabase
    .from("orders")
    .select(orderSelect)
    .in("status", ["pending", "accepted", "preparing", "ready"])
    .order("placed_at", { ascending: true })
    .limit(100);
  const claimedQuery = supabase
    .from("orders")
    .select(orderSelect)
    .eq("status", "claimed")
    .gte("claimed_at", manilaDayStartIso())
    .order("claimed_at", { ascending: false })
    .limit(50);

  if (branchId) {
    activeQuery.eq("branch_id", branchId);
    claimedQuery.eq("branch_id", branchId);
  }

  const [active, claimed] = await Promise.all([activeQuery, claimedQuery]);
  if (active.error || claimed.error) {
    console.error("[workspace] order board query failed", active.error ?? claimed.error);
    return null;
  }

  return [...(active.data ?? []), ...(claimed.data ?? [])]
    .map(toWorkspaceOrder)
    .filter((order): order is WorkspaceOrder => order !== null);
}
