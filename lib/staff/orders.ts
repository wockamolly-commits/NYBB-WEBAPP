import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import { manilaDayStartIso } from "./dashboard";
import type { WorkspaceOrder } from "./order-types";

const orderSelect = `
  id, short_code, status, is_test, customer_name, customer_phone, total_cents, notes, placed_at,
  customer_arrived_at, ready_acknowledged_at, ready_ring_at, branch_id,
  pickup_slots ( slot_start ),
  payments ( method, provider, status, provider_payment_id ),
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
  customer_phone: z.string(),
  total_cents: z.coerce.number().int().nonnegative(),
  notes: z.string().nullable(),
  placed_at: z.string(),
  customer_arrived_at: z.string().nullable(),
  ready_acknowledged_at: z.string().nullable(),
  ready_ring_at: z.string().nullable(),
  pickup_slots: z.union([z.object({ slot_start: z.string() }), z.array(z.object({ slot_start: z.string() }))]).nullable(),
  payments: z.union([z.object({ method: z.string(), provider: z.string(), status: z.string(), provider_payment_id: z.string().nullable() }), z.array(z.object({ method: z.string(), provider: z.string(), status: z.string(), provider_payment_id: z.string().nullable() }))]).nullable(),
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
    customerPhone: row.customer_phone,
    totalCents: row.total_cents,
    notes: row.notes,
    placedAt: row.placed_at,
    pickupAt: pickup?.slot_start ?? null,
    customerArrived: row.customer_arrived_at !== null,
    readyAcknowledgedAt: row.ready_acknowledged_at,
    readyRingAt: row.ready_ring_at,
    payment: payment ? {
      method: payment.method,
      provider: payment.provider,
      status: payment.status,
      isMock: payment.provider_payment_id?.startsWith("mock_pay_") ?? false,
    } : null,
    items: items.map((item) => ({
      quantity: item.qty,
      name: item.item_name_snapshot,
      variation: item.variation_label_snapshot,
      options: (item.order_item_options ?? []).map((option) => option.name_snapshot),
    })),
    heatLevels: [...heatLevels],
  };
}

/**
 * How many live orders the board reads. Ordered newest first, so when there
 * are more than this it is the oldest that fall off rather than the order that
 * just landed, and the board says so (see `truncated`).
 *
 * It used to read the 100 OLDEST, which meant a backlog of forgotten Ready
 * orders could silently push every new order off the screen.
 */
export const BOARD_ACTIVE_LIMIT = 200;

export type WorkspaceBoard = {
  orders: WorkspaceOrder[];
  /** True when there were more live orders than the board reads. */
  truncated: boolean;
};

export async function getWorkspaceOrders(
  branchId: string | null,
): Promise<WorkspaceBoard | null> {
  const supabase = await createReadOnlyStaffClient();
  const activeQuery = supabase
    .from("orders")
    .select(orderSelect)
    .in("status", ["pending", "accepted", "preparing", "ready"])
    .order("placed_at", { ascending: false })
    .limit(BOARD_ACTIVE_LIMIT);
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

  const orders = [...(active.data ?? []).reverse(), ...(claimed.data ?? [])]
    .map(toWorkspaceOrder)
    .filter((order): order is WorkspaceOrder => order !== null)
    .filter(onTheBoard);

  return { orders, truncated: (active.data ?? []).length >= BOARD_ACTIVE_LIMIT };
}

/**
 * Whether an order belongs on the board at all.
 *
 * An online order is not work for the kitchen until the webhook confirms it,
 * so one still waiting on PayMongo (or whose payment failed) stays off. A
 * refunded one stays ON: it was paid, it may already be in the kitchen, and
 * hiding it used to leave it live but invisible, in neither the board nor
 * History, which lists only finished orders. Counter orders keep the existing
 * pending queue behaviour.
 */
export function onTheBoard(order: WorkspaceOrder): boolean {
  if (order.payment?.provider !== "paymongo") return true;
  return order.payment.status === "paid" || order.payment.status === "refunded";
}

export type RefundOwed = {
  id: string;
  shortCode: string;
  status: "cancelled" | "rejected";
  customerName: string;
  customerPhone: string;
  totalCents: number;
  closedReason: string | null;
};

const refundOwedSchema = z.object({
  id: z.uuid(),
  short_code: z.string(),
  status: z.enum(["cancelled", "rejected"]),
  customer_name: z.string(),
  customer_phone: z.string(),
  total_cents: z.coerce.number().int().nonnegative(),
  cancelled_reason: z.string().nullable(),
  payments: z.union([
    z.object({ needs_refund: z.boolean() }),
    z.array(z.object({ needs_refund: z.boolean() })),
  ]).nullable(),
});

/**
 * Ended orders holding money that has to go back.
 *
 * payments.needs_refund is set when a payment lands on an order that is
 * already cancelled or rejected: a customer who paid after the expiry sweep, or
 * an order refused after it was paid. Nothing read it before, so the only way
 * to find one was to scroll History. The board lists them until the refund is
 * made, which clears the flag (0033).
 */
export async function getRefundsOwed(branchId: string | null): Promise<RefundOwed[]> {
  const supabase = await createReadOnlyStaffClient();
  const query = supabase
    .from("orders")
    .select(
      "id, short_code, status, customer_name, customer_phone, total_cents, cancelled_reason, payments!inner ( needs_refund )",
    )
    .in("status", ["cancelled", "rejected"])
    .eq("payments.needs_refund", true)
    .order("placed_at", { ascending: false })
    .limit(20);
  if (branchId) query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) {
    console.error("[workspace] refunds owed query failed", error.message);
    return [];
  }
  return (data ?? []).flatMap((value) => {
    const parsed = refundOwedSchema.safeParse(value);
    if (!parsed.success) return [];
    const row = parsed.data;
    return [{
      id: row.id,
      shortCode: row.short_code,
      status: row.status,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      totalCents: row.total_cents,
      closedReason: row.cancelled_reason,
    }];
  });
}
