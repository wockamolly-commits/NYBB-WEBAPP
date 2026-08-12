import { describe, expect, it } from "vitest";
import {
  isValidHistoryDate,
  manilaDateEndExclusiveIso,
  manilaDateStartIso,
  matchesOrderHistoryQuery,
  normalizeOrderHistoryFilters,
  summarizeOrderHistory,
  toOrderHistoryEntry,
  type OrderHistoryEntry,
} from "@/lib/staff/order-history";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  short_code: "NY-ABC123",
  status: "claimed",
  is_test: false,
  customer_name: "Maria Santos",
  customer_phone: "+639171234567",
  customer_email: "maria@example.com",
  total_cents: 45000,
  notes: null,
  placed_at: "2026-08-10T02:00:00.000Z",
  claimed_at: "2026-08-10T03:00:00.000Z",
  rejected_at: null,
  rejected_reason: null,
  cancelled_at: null,
  cancelled_reason: null,
  no_show_at: null,
  pickup_slots: [{ slot_start: "2026-08-10T04:00:00.000Z" }],
  payments: [{ method: "counter", status: "paid", amount_cents: 45000, paid_at: "2026-08-10T03:00:00.000Z" }],
  order_items: [{
    qty: 2,
    item_name_snapshot: "Buffalo Wings",
    variation_label_snapshot: "6 pieces",
    order_item_options: [{ name_snapshot: "Hot" }],
  }],
};

function order(overrides: Partial<OrderHistoryEntry> = {}): OrderHistoryEntry {
  return { ...toOrderHistoryEntry(row)!, ...overrides };
}

describe("workspace order history", () => {
  it("validates real calendar dates", () => {
    expect(isValidHistoryDate("2026-08-10")).toBe(true);
    expect(isValidHistoryDate("2026-02-30")).toBe(false);
    expect(isValidHistoryDate("10/08/2026")).toBe(false);
  });

  it("creates inclusive Manila date bounds", () => {
    expect(manilaDateStartIso("2026-08-10")).toBe("2026-08-09T16:00:00.000Z");
    expect(manilaDateEndExclusiveIso("2026-08-10")).toBe("2026-08-10T16:00:00.000Z");
  });

  it("normalizes and bounds URL filters", () => {
    expect(normalizeOrderHistoryFilters({
      q: ["  Maria  ", "ignored"],
      from: "bad",
      to: "2026-08-10",
      status: "claimed",
    })).toEqual({ query: "Maria", from: "", to: "2026-08-10", status: "claimed" });
    expect(normalizeOrderHistoryFilters({ status: "pending" }).status).toBe("all");
  });

  it("maps snapshots without exposing order credentials", () => {
    const mapped = toOrderHistoryEntry({ ...row, tracking_token: "secret", pickup_code: "1234" });
    expect(mapped).toMatchObject({
      shortCode: "NY-ABC123",
      closedAt: "2026-08-10T03:00:00.000Z",
      payment: { amountCents: 45000 },
      items: [{ quantity: 2, options: ["Hot"] }],
    });
    expect(mapped).not.toHaveProperty("trackingToken");
    expect(mapped).not.toHaveProperty("pickupCode");
  });

  it("uses the matching terminal timestamp and reason", () => {
    expect(toOrderHistoryEntry({
      ...row,
      status: "rejected",
      claimed_at: null,
      rejected_at: "2026-08-10T02:30:00.000Z",
      rejected_reason: "Kitchen closed",
    })).toMatchObject({ closedAt: "2026-08-10T02:30:00.000Z", reason: "Kitchen closed" });
  });

  it("searches code and customer details without case sensitivity", () => {
    const mapped = order();
    expect(matchesOrderHistoryQuery(mapped, "abc123")).toBe(true);
    expect(matchesOrderHistoryQuery(mapped, "MARIA")).toBe(true);
    expect(matchesOrderHistoryQuery(mapped, "0918")).toBe(false);
  });

  it("excludes test orders from paid counts and sales", () => {
    const real = order();
    const test = order({ id: "22222222-2222-4222-8222-222222222222", isTest: true });
    // Derived from the mapped payment rather than restated, so a field added to
    // the payment shape does not break a test that is only varying three of
    // them. What this order is is "the same payment, not yet paid".
    const unpaid = order({
      id: "33333333-3333-4333-8333-333333333333",
      payment: { ...order().payment!, status: "due", amountCents: 30000, paidAt: null },
    });
    expect(summarizeOrderHistory([real, test, unpaid])).toEqual({
      orderCount: 3,
      testOrderCount: 1,
      paidOrderCount: 1,
      paidSalesCents: 45000,
    });
  });
});
