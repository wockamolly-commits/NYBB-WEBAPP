import "server-only";

import { z } from "zod";
import type { OrderStatus } from "@/lib/orders/types";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";

export const HISTORY_STATUSES = [
  "claimed",
  "rejected",
  "cancelled",
  "no_show",
] as const satisfies readonly OrderStatus[];

export type OrderHistoryStatus = (typeof HISTORY_STATUSES)[number];

export type OrderHistoryFilters = {
  query: string;
  from: string;
  to: string;
  status: "all" | OrderHistoryStatus;
};

export type OrderHistoryEntry = {
  id: string;
  shortCode: string;
  status: OrderHistoryStatus;
  isTest: boolean;
  customer: {
    name: string;
    phone: string;
    email: string | null;
  };
  totalCents: number;
  notes: string | null;
  placedAt: string;
  pickupAt: string | null;
  closedAt: string;
  reason: string | null;
  payment: {
    method: string;
    status: string;
    amountCents: number;
    paidAt: string | null;
  } | null;
  items: Array<{
    quantity: number;
    name: string;
    variation: string;
    options: string[];
  }>;
};

const optionSchema = z.object({ name_snapshot: z.string() });

const itemSchema = z.object({
  qty: z.number().int().positive(),
  item_name_snapshot: z.string(),
  variation_label_snapshot: z.string(),
  order_item_options: z.array(optionSchema).nullable(),
});

const paymentSchema = z.object({
  method: z.string(),
  status: z.string(),
  amount_cents: z.coerce.number().int().nonnegative(),
  paid_at: z.string().nullable(),
});

const pickupSchema = z.object({ slot_start: z.string() });

const rowSchema = z.object({
  id: z.uuid(),
  short_code: z.string(),
  status: z.enum(HISTORY_STATUSES),
  is_test: z.boolean(),
  customer_name: z.string(),
  customer_phone: z.string(),
  customer_email: z.string().nullable(),
  total_cents: z.coerce.number().int().nonnegative(),
  notes: z.string().nullable(),
  placed_at: z.string(),
  claimed_at: z.string().nullable(),
  rejected_at: z.string().nullable(),
  rejected_reason: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_reason: z.string().nullable(),
  no_show_at: z.string().nullable(),
  pickup_slots: z.union([pickupSchema, z.array(pickupSchema)]).nullable(),
  payments: z.union([paymentSchema, z.array(paymentSchema)]).nullable(),
  order_items: z.array(itemSchema).nullable(),
});

const historySelect = `
  id, short_code, status, is_test,
  customer_name, customer_phone, customer_email,
  total_cents, notes, placed_at,
  claimed_at, rejected_at, rejected_reason,
  cancelled_at, cancelled_reason, no_show_at,
  pickup_slots ( slot_start ),
  payments ( method, status, amount_cents, paid_at ),
  order_items (
    qty, item_name_snapshot, variation_label_snapshot,
    order_item_options ( name_snapshot )
  )
`;

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function isValidHistoryDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function manilaDateStartIso(value: string): string | null {
  if (!isValidHistoryDate(value)) return null;
  return new Date(`${value}T00:00:00+08:00`).toISOString();
}

export function manilaDateEndExclusiveIso(value: string): string | null {
  const start = manilaDateStartIso(value);
  if (!start) return null;
  return new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeOrderHistoryFilters(
  values: Record<string, string | string[] | undefined>,
): OrderHistoryFilters {
  const query = firstSearchValue(values.q).trim().slice(0, 80);
  const fromValue = firstSearchValue(values.from);
  const toValue = firstSearchValue(values.to);
  const statusValue = firstSearchValue(values.status);

  return {
    query,
    from: isValidHistoryDate(fromValue) ? fromValue : "",
    to: isValidHistoryDate(toValue) ? toValue : "",
    status: HISTORY_STATUSES.includes(statusValue as OrderHistoryStatus)
      ? statusValue as OrderHistoryStatus
      : "all",
  };
}

export function toOrderHistoryEntry(value: unknown): OrderHistoryEntry | null {
  const parsed = rowSchema.safeParse(value);
  if (!parsed.success) return null;

  const row = parsed.data;
  const pickup = first(row.pickup_slots);
  const payment = first(row.payments);
  const closedAt = row.status === "claimed"
    ? row.claimed_at
    : row.status === "rejected"
      ? row.rejected_at
      : row.status === "cancelled"
        ? row.cancelled_at
        : row.no_show_at;
  const reason = row.status === "rejected"
    ? row.rejected_reason
    : row.status === "cancelled"
      ? row.cancelled_reason
      : null;

  return {
    id: row.id,
    shortCode: row.short_code,
    status: row.status,
    isTest: row.is_test,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email,
    },
    totalCents: row.total_cents,
    notes: row.notes,
    placedAt: row.placed_at,
    pickupAt: pickup?.slot_start ?? null,
    closedAt: closedAt ?? row.placed_at,
    reason,
    payment: payment ? {
      method: payment.method,
      status: payment.status,
      amountCents: payment.amount_cents,
      paidAt: payment.paid_at,
    } : null,
    items: (row.order_items ?? []).map((item) => ({
      quantity: item.qty,
      name: item.item_name_snapshot,
      variation: item.variation_label_snapshot,
      options: (item.order_item_options ?? []).map((option) => option.name_snapshot),
    })),
  };
}

export function matchesOrderHistoryQuery(
  order: OrderHistoryEntry,
  query: string,
): boolean {
  if (!query) return true;
  const needle = query.toLocaleLowerCase("en-PH");
  return [
    order.shortCode,
    order.customer.name,
    order.customer.phone,
    order.customer.email ?? "",
  ].some((value) => value.toLocaleLowerCase("en-PH").includes(needle));
}

export function summarizeOrderHistory(orders: readonly OrderHistoryEntry[]) {
  const realOrders = orders.filter((order) => !order.isTest);
  const paidOrders = realOrders.filter((order) => order.payment?.status === "paid");
  return {
    orderCount: orders.length,
    testOrderCount: orders.length - realOrders.length,
    paidOrderCount: paidOrders.length,
    paidSalesCents: paidOrders.reduce(
      (sum, order) => sum + (order.payment?.amountCents ?? 0),
      0,
    ),
  };
}

export async function getOrderHistory(
  branchId: string | null,
  filters: OrderHistoryFilters,
): Promise<OrderHistoryEntry[] | null> {
  const supabase = await createReadOnlyStaffClient();
  const query = supabase
    .from("orders")
    .select(historySelect)
    .in("status", filters.status === "all" ? [...HISTORY_STATUSES] : [filters.status])
    .order("placed_at", { ascending: false })
    .limit(250);

  if (branchId) query.eq("branch_id", branchId);
  const from = manilaDateStartIso(filters.from);
  const to = manilaDateEndExclusiveIso(filters.to);
  if (from) query.gte("placed_at", from);
  if (to) query.lt("placed_at", to);

  const { data, error } = await query;
  if (error) {
    console.error("[workspace] order history query failed:", error.message);
    return null;
  }

  return (data ?? [])
    .map((row) => {
      const order = toOrderHistoryEntry(row);
      if (!order) console.error("[workspace] skipped unreadable history order");
      return order;
    })
    .filter((order): order is OrderHistoryEntry => order !== null)
    .filter((order) => matchesOrderHistoryQuery(order, filters.query));
}
