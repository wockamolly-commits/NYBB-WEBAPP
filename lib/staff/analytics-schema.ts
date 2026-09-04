import { z } from "zod";
import {
  isValidWorkspaceDate,
  manilaDateShift,
  manilaToday,
} from "./manila-dates";

/**
 * The shape of the sales report, and the rules for reading its filters.
 *
 * This file holds no `server-only` import and no database client on purpose.
 * The parse is the part that has to be tested, and AGENTS.md section 6 is the
 * reason: a schema that lives beside the read is a schema nothing can call
 * without a database, which is exactly how the heat_percent coercion bug got
 * as far as production. `lib/staff/analytics.ts` is the read; everything that
 * can be decided without one is here.
 */

/**
 * How many days the page opens on.
 *
 * Seven, and the number is a judgement rather than a default. One day is not
 * enough to see a weekday pattern in the hour chart, which is the chart the
 * page exists for, and thirty puts a month of averaging over the one shape a
 * manager is looking for. A week shows every weekday exactly once.
 */
export const DEFAULT_RANGE_DAYS = 7;

export type AnalyticsFilters = {
  /** Manila calendar day, inclusive. */
  from: string;
  /** Manila calendar day, inclusive. The window sent to SQL is half open. */
  to: string;
  /** Empty means every counter this person may read. */
  branch: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The dates the page will actually report on.
 *
 * Every branch of this returns a usable window, because a report that renders
 * an error instead of a chart when somebody hand-edits a query string is worse
 * than one that quietly falls back to the last week. A reversed pair is the
 * one case the page says something about, and it says it beside the filters
 * rather than in place of the report, which is how the audit log already
 * handles the same mistake.
 */
export function normalizeAnalyticsFilters(
  values: Record<string, string | string[] | undefined>,
  today: string = manilaToday(),
): AnalyticsFilters {
  const raw = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();

  const from = raw(values.from);
  const to = raw(values.to);
  const branch = raw(values.branch);

  const hasRange = isValidWorkspaceDate(from) && isValidWorkspaceDate(to);

  return {
    from: hasRange ? from : manilaDateShift(today, -(DEFAULT_RANGE_DAYS - 1)),
    to: hasRange ? to : today,
    branch: UUID.test(branch) ? branch : "",
  };
}

/** The query string that reproduces this view. */
export function analyticsFilterParams(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  params.set("from", filters.from);
  params.set("to", filters.to);
  if (filters.branch) params.set("branch", filters.branch);
  return params.toString();
}

/**
 * Numbers that may legitimately be absent, read as null rather than as zero.
 *
 * AGENTS.md section 6. A median with no sample behind it is "we have not timed
 * an order yet", and a zero there would print "0:00 median prep" on a screen
 * whose whole job is to be believed. There is no coercion anywhere in this
 * schema: the RPC returns a json document, so every number arrives as a JSON
 * number already and a coercion could only ever turn something that is not one
 * into a plausible zero.
 */
const nullableSeconds = z.object({
  sample: z.number().int(),
  median: z.number().nullable(),
  p90: z.number().nullable(),
});

export const salesReportSchema = z.object({
  branch_id: z.string().nullable(),
  orders_count: z.number().int(),
  paid_count: z.number().int(),
  gross_sales_cents: z.number(),
  avg_order_value_cents: z.number(),
  discounts: z.object({
    given_cents: z.number(),
    discounted_orders: z.number().int(),
    rung_in_pos_orders: z.number().int(),
  }),
  by_hour: z.array(
    z.object({
      hour: z.number().int().min(0).max(23),
      orders: z.number().int(),
      sales_cents: z.number(),
    }),
  ),
  slots: z.object({
    windows: z.number().int(),
    reserved: z.number().int(),
    capacity: z.number().int(),
  }),
  prep_seconds: nullableSeconds,
  wait_seconds: nullableSeconds,
  no_shows: z.object({
    orders: z.number().int(),
    refunded_cents: z.number(),
  }),
  customers: z.object({
    new: z.number().int(),
    returning: z.number().int(),
  }),
  flavour_mix: z.array(z.object({ name: z.string(), qty: z.number() })),
  heat_mix: z.array(
    z.object({
      name: z.string(),
      // The one field here that is null for a real reason of its own: an
      // option row carries no heat unless it is a heat level, and 0059's
      // sibling trap is that "no heat level" is not "0% heat". The mix is
      // built from rows where it is set, so a null here would mean the SQL
      // stopped agreeing with its own filter.
      heat_percent: z.number().int().min(0).max(100),
      qty: z.number(),
    }),
  ),
  top_items: z.array(
    z.object({
      item_name: z.string(),
      qty: z.number(),
      sales_cents: z.number(),
    }),
  ),
  top_pairings: z.array(
    z.object({
      first_item: z.string(),
      second_item: z.string(),
      orders: z.number(),
    }),
  ),
});

export type SalesReport = z.infer<typeof salesReportSchema>;

export function toSalesReport(value: unknown): SalesReport | null {
  const parsed = salesReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Whether the two dates name a window with anything between them. */
export function datesReversed(filters: AnalyticsFilters): boolean {
  return filters.from > filters.to;
}

/**
 * Reserved against capacity, as a whole percentage.
 *
 * Null when no window was offered at all, which the card says in words. Zero
 * there would read as "the kitchen was empty" when the truth is that nobody
 * picked a time, and those are different problems with different answers.
 */
export function slotUtilization(slots: SalesReport["slots"]): number | null {
  if (slots.capacity <= 0) return null;
  return Math.round((slots.reserved / slots.capacity) * 100);
}

/**
 * How much of the money that could have been discounted was.
 *
 * Measured against the orders the counter actually rang into the POS, because
 * that is the set the owner compares this against in the POS's own discount
 * report. Null when nothing was rung in, for the same reason as above.
 */
export function discountRate(discounts: SalesReport["discounts"]): number | null {
  if (discounts.rung_in_pos_orders <= 0) return null;
  return Math.round((discounts.discounted_orders / discounts.rung_in_pos_orders) * 100);
}

/**
 * Whether a mix has a ranking in it, which is what decides if its bars are
 * drawn.
 *
 * The bars read each row against the biggest one, so the biggest row is full
 * by construction. That is right when the rows differ and a lie when they do
 * not: a range where everything tied drew a column of identical full bars, and
 * a lone row drew a full bar for outselling nothing at all.
 *
 * Two rows are needed for a comparison, and a spread is needed for that
 * comparison to say anything. It lives here rather than beside the markup so
 * the cases can be named in a test.
 */
export function hasRanking(quantities: readonly number[]): boolean {
  if (quantities.length < 2) return false;
  return Math.max(...quantities) > Math.min(...quantities);
}
