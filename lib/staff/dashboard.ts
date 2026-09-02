import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import type { OrderStatus } from "@/lib/orders/types";

export type WorkspaceSnapshot = {
  total: number;
  pending: number;
  preparing: number;
  ready: number;
  claimed: number;
};

export type WorkspaceDashboard = WorkspaceSnapshot & {
  /**
   * Test orders counted separately rather than dropped silently.
   *
   * The board shows them, badged, because a counter running a payment test
   * needs to see the order it just placed. This summary excludes them from
   * every figure, because a day's takings must not include play money. Those
   * two correct decisions used to make the dashboard say four and the board
   * show six, with nothing on either screen accounting for the difference.
   */
  testCount: number;
};

const rowsSchema = z.array(
  z.object({
    is_test: z.boolean(),
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
  }),
);

/** Midnight in Manila for an injected clock. The Philippines has no DST. */
export function manilaDayStartIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(value("year"), value("month") - 1, value("day")) - 8 * 60 * 60 * 1000)
    .toISOString();
}

export function summarizeOrders(statuses: readonly OrderStatus[]): WorkspaceSnapshot {
  return {
    total: statuses.length,
    pending: statuses.filter((status) => status === "pending").length,
    preparing: statuses.filter(
      (status) => status === "accepted" || status === "preparing",
    ).length,
    ready: statuses.filter((status) => status === "ready").length,
    claimed: statuses.filter((status) => status === "claimed").length,
  };
}

export async function getWorkspaceSnapshot(
  branchId: string | null,
): Promise<WorkspaceDashboard | null> {
  const supabase = await createReadOnlyStaffClient();
  const query = supabase
    .from("orders")
    .select("status, is_test")
    .gte("placed_at", manilaDayStartIso());
  if (branchId) query.eq("branch_id", branchId);
  const { data, error } = await query;

  if (error) {
    console.error("[workspace] order summary failed:", error.message);
    return null;
  }
  const parsed = rowsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[workspace] order summary had an unreadable shape", parsed.error.issues);
    return null;
  }
  const real = parsed.data.filter((row) => !row.is_test);
  return {
    ...summarizeOrders(real.map((row) => row.status)),
    testCount: parsed.data.length - real.length,
  };
}
