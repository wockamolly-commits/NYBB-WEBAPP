import { describe, expect, it } from "vitest";
import {
  featuredVoucherId,
  moveVoucher,
  parseVoucherOrder,
  storefrontOrder,
  type OrderableVoucher,
} from "@/lib/vouchers/order";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function v(over: Partial<OrderableVoucher> & { id: string; code: string }): OrderableVoucher {
  return {
    publicise: true,
    status: "active",
    displayPriority: null,
    expiresAt: null,
    ...over,
  };
}

describe("storefrontOrder mirrors list_customer_promos", () => {
  it("keeps the old soonest-ending order while nothing is placed", () => {
    const list = storefrontOrder([
      v({ id: A, code: "FOREVER" }),
      v({ id: B, code: "LATER", expiresAt: "2026-12-01T00:00:00Z" }),
      v({ id: C, code: "SOON", expiresAt: "2026-10-05T00:00:00Z" }),
    ]);
    expect(list.map((x) => x.code)).toEqual(["SOON", "LATER", "FOREVER"]);
    expect(featuredVoucherId(list)).toBeNull();
  });

  it("puts placed codes first, by rank, and unplaced after", () => {
    const list = storefrontOrder([
      v({ id: A, code: "FOREVER", displayPriority: 2 }),
      v({ id: B, code: "LATER", displayPriority: 1, expiresAt: "2026-12-01T00:00:00Z" }),
      v({ id: C, code: "SOON", expiresAt: "2026-10-05T00:00:00Z" }),
    ]);
    expect(list.map((x) => x.code)).toEqual(["LATER", "FOREVER", "SOON"]);
    expect(featuredVoucherId(list)).toBe(B);
  });

  it("puts unplaced codes nobody can see after the live ones", () => {
    // An ended code sorted by its end date came first, above every running
    // promo, in a list that is meant to read as the storefront.
    const list = storefrontOrder([
      v({ id: A, code: "ENDED", status: "expired", expiresAt: "2026-09-24T00:00:00Z" }),
      v({ id: B, code: "LIVE", expiresAt: "2026-10-02T00:00:00Z" }),
    ]);
    expect(list.map((x) => x.code)).toEqual(["LIVE", "ENDED"]);
  });

  it("keeps a placed code where it was placed, live or not", () => {
    const list = storefrontOrder([
      v({ id: A, code: "LIVE", displayPriority: 2 }),
      v({ id: B, code: "SOONTOSTART", displayPriority: 1, status: "scheduled" }),
    ]);
    expect(list.map((x) => x.code)).toEqual(["SOONTOSTART", "LIVE"]);
  });

  it("leaves out codes that are not advertised", () => {
    const list = storefrontOrder([v({ id: A, code: "QUIET", publicise: false }), v({ id: B, code: "LOUD" })]);
    expect(list.map((x) => x.code)).toEqual(["LOUD"]);
  });

  it("features the first placed code that is actually live", () => {
    const list = storefrontOrder([
      v({ id: A, code: "OFF", displayPriority: 1, status: "disabled" }),
      v({ id: B, code: "LIVE", displayPriority: 2 }),
    ]);
    expect(featuredVoucherId(list)).toBe(B);
  });
});

describe("moveVoucher", () => {
  const list = [{ id: A }, { id: B }, { id: C }];
  it("swaps with the neighbour", () => {
    expect(moveVoucher(list, B, -1).map((x) => x.id)).toEqual([B, A, C]);
    expect(moveVoucher(list, B, 1).map((x) => x.id)).toEqual([A, C, B]);
  });
  it("does nothing past either end", () => {
    expect(moveVoucher(list, A, -1).map((x) => x.id)).toEqual([A, B, C]);
    expect(moveVoucher(list, C, 1).map((x) => x.id)).toEqual([A, B, C]);
  });
});

describe("parseVoucherOrder", () => {
  it("accepts an order and an empty one", () => {
    expect(parseVoucherOrder(JSON.stringify([A, B]))).toEqual({ ok: true, ids: [A, B] });
    expect(parseVoucherOrder("[]")).toEqual({ ok: true, ids: [] });
  });
  it("refuses a missing or broken field rather than reading it as empty", () => {
    // Empty is "back to automatic". A malformed request must never mean that.
    expect(parseVoucherOrder(null).ok).toBe(false);
    expect(parseVoucherOrder("").ok).toBe(false);
    expect(parseVoucherOrder("not json").ok).toBe(false);
    expect(parseVoucherOrder(JSON.stringify(["nope"])).ok).toBe(false);
    expect(parseVoucherOrder(JSON.stringify([A, A])).ok).toBe(false);
  });
});
