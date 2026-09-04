import "server-only";

import { createReadOnlyStaffClient } from "@/lib/supabase/server";
import {
  toSalesReport,
  type AnalyticsFilters,
  type SalesReport,
} from "./analytics-schema";
import { manilaDateEndExclusiveIso, manilaDateStartIso } from "./manila-dates";

/**
 * The one read behind /workspace/analytics.
 *
 * There is deliberately no query building here and no arithmetic. Migration
 * 0062 does all of it and hands back a json document, which is the pattern the
 * reference implementation arrived at and the reason the page does not have a
 * row cap: the order history's 250-row limit is fine for a list somebody
 * scrolls and would silently make every total on this screen wrong.
 *
 * The branch is passed but not trusted. 0062 overrides it with the caller's
 * own assignment when they have one, so this argument is a filter for a
 * business-wide reader and nothing more. Sending it for an assigned manager
 * would not widen anything; the page simply does not offer the control.
 */
export async function getSalesReport(
  filters: AnalyticsFilters,
): Promise<SalesReport | null> {
  const from = manilaDateStartIso(filters.from);
  const to = manilaDateEndExclusiveIso(filters.to);
  if (!from || !to) return null;

  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase.rpc("order_analytics", {
    from_ts: from,
    to_ts: to,
    p_branch_id: filters.branch === "" ? null : filters.branch,
  });

  if (error) {
    console.error("[workspace] sales report failed:", error.message);
    return null;
  }

  const report = toSalesReport(data);
  if (!report) {
    console.error("[workspace] the sales report came back in an unreadable shape");
    return null;
  }
  return report;
}
