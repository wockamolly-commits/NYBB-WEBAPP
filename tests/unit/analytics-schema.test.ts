import { describe, expect, it } from "vitest";
import {
  analyticsFilterParams,
  datesReversed,
  discountRate,
  hasRanking,
  normalizeAnalyticsFilters,
  salesReportSchema,
  slotUtilization,
  toSalesReport,
  DEFAULT_RANGE_DAYS,
} from "@/lib/staff/analytics-schema";
import { manilaDateShift, manilaToday } from "@/lib/staff/manila-dates";

/**
 * The parse and the filter rules for the sales report.
 *
 * AGENTS.md section 6 is why this file exists at all. The schema is in lib/
 * rather than beside the read so that it can be called without a database, and
 * a schema nobody can call is a schema nobody tests: that is exactly how a
 * blank heat level became "0% heat" on every save. The tests that matter most
 * here are the null ones. A median with no orders behind it must not arrive as
 * a zero, because "0m median prep" is a claim, and this screen exists to be
 * believed.
 */

const REPORT = {
  branch_id: null,
  orders_count: 4,
  paid_count: 3,
  gross_sales_cents: 90000,
  avg_order_value_cents: 30000,
  discounts: { given_cents: 5000, discounted_orders: 1, rung_in_pos_orders: 4 },
  by_hour: Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales_cents: 0 })),
  slots: { windows: 2, reserved: 10, capacity: 20 },
  prep_seconds: { sample: 2, median: 900, p90: 1140 },
  wait_seconds: { sample: 0, median: null, p90: null },
  no_shows: { orders: 1, refunded_cents: 15000 },
  customers: { new: 3, returning: 1 },
  flavour_mix: [{ name: "Classic Buffalo", qty: 2 }],
  heat_mix: [{ name: "Sweet Spicy", heat_percent: 40, qty: 2 }],
  top_items: [{ item_name: "Buffalo Wings", qty: 2, sales_cents: 40000 }],
  top_pairings: [{ first_item: "Buffalo Wings", second_item: "Fries", orders: 1 }],
};

describe("the sales report schema", () => {
  it("reads a whole report", () => {
    const parsed = toSalesReport(REPORT);
    expect(parsed).not.toBeNull();
    expect(parsed?.by_hour).toHaveLength(24);
  });

  it("keeps an unmeasured median as null rather than turning it into zero", () => {
    const parsed = toSalesReport(REPORT);
    expect(parsed?.wait_seconds.median).toBeNull();
    expect(parsed?.wait_seconds.p90).toBeNull();
    // The distinction the whole card depends on: no sample is not "instant".
    expect(parsed?.wait_seconds.sample).toBe(0);
  });

  it("refuses an empty string where a number belongs", () => {
    // The coercion trap from AGENTS.md section 6, asserted rather than assumed.
    // There is no z.coerce anywhere in this schema, so "" cannot become 0.
    const broken = { ...REPORT, gross_sales_cents: "" };
    expect(toSalesReport(broken)).toBeNull();
  });

  it("refuses a heat row with no heat level on it", () => {
    // A heat mix is built from rows where heat_percent is set. A null arriving
    // here would mean the SQL had stopped agreeing with its own filter, and
    // rendering it as 0% would draw an empty meter beside a real flavour.
    const broken = {
      ...REPORT,
      heat_mix: [{ name: "Sweet Spicy", heat_percent: null, qty: 2 }],
    };
    expect(toSalesReport(broken)).toBeNull();
  });

  it("refuses an hour outside the day", () => {
    const broken = {
      ...REPORT,
      by_hour: [{ hour: 24, orders: 1, sales_cents: 100 }],
    };
    expect(salesReportSchema.safeParse(broken).success).toBe(false);
  });

  it("returns null rather than throwing on a shape it cannot read", () => {
    expect(toSalesReport(null)).toBeNull();
    expect(toSalesReport({})).toBeNull();
    expect(toSalesReport("not a report")).toBeNull();
  });
});

describe("the filters", () => {
  it("opens on the last week, ending today, in Manila", () => {
    const filters = normalizeAnalyticsFilters({}, "2026-09-04");
    expect(filters.to).toBe("2026-09-04");
    expect(filters.from).toBe("2026-08-29");
    expect(filters.branch).toBe("");
    // Seven days inclusive, which is every weekday exactly once.
    expect(DEFAULT_RANGE_DAYS).toBe(7);
  });

  it("defaults from the counter's day, not the server's", () => {
    // 20:00 UTC on the 3rd is already 04:00 on the 4th in Cebu. A default
    // computed with the host's own getters would open on yesterday for the
    // first eight hours of every shift.
    const evening = new Date("2026-09-03T20:00:00Z");
    expect(manilaToday(evening)).toBe("2026-09-04");
  });

  it("shifts a Manila day without landing on the wrong one", () => {
    expect(manilaDateShift("2026-09-04", -6)).toBe("2026-08-29");
    expect(manilaDateShift("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("keeps a range somebody asked for", () => {
    const filters = normalizeAnalyticsFilters(
      { from: "2026-08-01", to: "2026-08-31" },
      "2026-09-04",
    );
    expect(filters).toEqual({ from: "2026-08-01", to: "2026-08-31", branch: "" });
  });

  it("falls back to the default range when only one date is given", () => {
    // A half-filled pair cannot describe a window, and guessing the other end
    // would report on dates nobody asked for.
    const filters = normalizeAnalyticsFilters({ from: "2026-08-01" }, "2026-09-04");
    expect(filters.from).toBe("2026-08-29");
    expect(filters.to).toBe("2026-09-04");
  });

  it("drops a date that is not one, rather than reporting on it", () => {
    const filters = normalizeAnalyticsFilters(
      { from: "2026-02-30", to: "banana" },
      "2026-09-04",
    );
    expect(filters.from).toBe("2026-08-29");
    expect(filters.to).toBe("2026-09-04");
  });

  it("drops a branch that is not a uuid", () => {
    // The database decides the scope regardless (0062), so this is tidiness
    // rather than a boundary: it keeps a junk value out of the RPC argument.
    expect(normalizeAnalyticsFilters({ branch: "../admin" }, "2026-09-04").branch).toBe("");
    expect(
      normalizeAnalyticsFilters(
        { branch: "3f1c2b64-9a1e-4c2b-8d7a-1b2c3d4e5f60" },
        "2026-09-04",
      ).branch,
    ).toBe("3f1c2b64-9a1e-4c2b-8d7a-1b2c3d4e5f60");
  });

  it("takes the first value of a repeated parameter", () => {
    const filters = normalizeAnalyticsFilters(
      { from: ["2026-08-01", "2026-01-01"], to: ["2026-08-31"] },
      "2026-09-04",
    );
    expect(filters.from).toBe("2026-08-01");
  });

  it("notices a reversed pair without refusing to report", () => {
    const filters = normalizeAnalyticsFilters(
      { from: "2026-08-31", to: "2026-08-01" },
      "2026-09-04",
    );
    expect(datesReversed(filters)).toBe(true);
    expect(datesReversed(normalizeAnalyticsFilters({}, "2026-09-04"))).toBe(false);
  });

  it("round trips through a query string", () => {
    const filters = {
      from: "2026-08-01",
      to: "2026-08-31",
      branch: "3f1c2b64-9a1e-4c2b-8d7a-1b2c3d4e5f60",
    };
    const params = Object.fromEntries(new URLSearchParams(analyticsFilterParams(filters)));
    expect(normalizeAnalyticsFilters(params, "2026-09-04")).toEqual(filters);
  });
});

describe("the two ratios the cards print", () => {
  it("says nothing rather than zero when no window was offered", () => {
    // Zero would read as "the kitchen sat empty". The truth is that nobody
    // picked a time, which is a different problem with a different answer.
    expect(slotUtilization({ windows: 0, reserved: 0, capacity: 0 })).toBeNull();
    expect(slotUtilization({ windows: 2, reserved: 10, capacity: 20 })).toBe(50);
  });

  it("says nothing rather than zero when nothing reached the POS", () => {
    expect(discountRate({ given_cents: 0, discounted_orders: 0, rung_in_pos_orders: 0 })).toBeNull();
    expect(
      discountRate({ given_cents: 5000, discounted_orders: 1, rung_in_pos_orders: 4 }),
    ).toBe(25);
  });
});

describe("whether a mix has a ranking in it", () => {
  // The bars read each row against the biggest one, so the biggest row is
  // always full. These are the two shapes where that turns into a lie: a lone
  // row that outsells nothing, and a set that is level. Both are ordinary on
  // one counter on one day, so neither is a thin-data case that volume cures.
  it("says no to a single row, which has nothing to be bigger than", () => {
    expect(hasRanking([1])).toBe(false);
    expect(hasRanking([400])).toBe(false);
  });

  it("says no when every row sold the same, at any volume", () => {
    expect(hasRanking([1, 1])).toBe(false);
    expect(hasRanking([400, 400, 400])).toBe(false);
  });

  it("says no to an empty mix, which draws its own empty line instead", () => {
    expect(hasRanking([])).toBe(false);
  });

  it("says yes as soon as one row outsells another", () => {
    expect(hasRanking([2, 1])).toBe(true);
    expect(hasRanking([5, 5, 5, 4])).toBe(true);
  });
});
