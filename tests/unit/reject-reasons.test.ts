import { describe, expect, it } from "vitest";
import {
  REJECT_REASON_CODES,
  REJECT_REASON_COPY,
  REJECT_REASON_LABELS,
  isRejectReasonCode,
  rejectedOrderCopy,
} from "@/lib/orders/reject-reasons";
import { statusCopy } from "@/lib/orders/status";
import type { TrackedOrder } from "@/lib/orders/types";

/**
 * What a customer reads when a branch refuses their order.
 *
 * This copy is unusual in that a staff member chooses it, one code at a time,
 * during a bad shift. So the tests are about what a counter cannot do to a
 * customer through this screen: send them prose typed under pressure, blame
 * them for a kitchen that ran out, or leave somebody who has already paid with
 * no word about their money.
 */

const rejected: TrackedOrder = {
  shortCode: "NY-ABC234",
  status: "rejected",
  placedAt: "2026-08-12T02:00:00.000Z",
  pickupCode: "0417",
  pickup: null,
  branch: {
    slug: "pilot",
    name: "Pilot",
    shortName: "Pilot",
    timezone: "Asia/Manila",
    addressLine: "Road",
    city: "Cebu City",
    phones: [],
  },
  customer: { name: "Maria Santos", phone: "09170000000", email: null },
  items: [],
  subtotalCents: 32900,
  discountCents: 0,
  totalCents: 32900,
  notes: null,
  payment: { method: "qrph", status: "pending", amountCents: 32900, paidAt: null },
  timeline: {
    acceptedAt: null,
    preparingAt: null,
    readyAt: null,
    claimedAt: null,
    rejectedAt: "2026-08-12T02:30:00.000Z",
    rejectedReason: "sold_out",
    cancelledAt: null,
    cancelledReason: null,
    customerArrivedAt: null,
    noShowAt: null,
  },
};

describe("the reason list", () => {
  it("gives every code both a staff label and customer copy", () => {
    // A code with no copy would reach a customer as undefined, and a code with
    // no label would be an empty row in the picker.
    for (const code of REJECT_REASON_CODES) {
      expect(REJECT_REASON_LABELS[code], code).toBeTruthy();
      expect(REJECT_REASON_COPY[code], code).toBeTruthy();
    }
  });

  it("matches the closed list the database enforces", () => {
    // Migration 0036 checks the same four values. If these part company, a
    // staff member picks something the RPC refuses and the board shows an
    // error for a reason nobody can see.
    expect([...REJECT_REASON_CODES].sort()).toEqual(["closing", "other", "sold_out", "too_busy"]);
  });

  it("recognizes its own codes and nothing else", () => {
    expect(isRejectReasonCode("sold_out")).toBe(true);
    expect(isRejectReasonCode("cust was rude")).toBe(false);
    expect(isRejectReasonCode("")).toBe(false);
    expect(isRejectReasonCode(null)).toBe(false);
    expect(isRejectReasonCode(7)).toBe(false);
  });

  it("never blames the customer for a kitchen that ran out", () => {
    for (const code of REJECT_REASON_CODES) {
      expect(REJECT_REASON_COPY[code], code).not.toMatch(/\byou (did|failed|should)\b/i);
    }
  });
});

describe("the sentence a rejected order shows", () => {
  it("explains the specific reason when there is one", () => {
    expect(rejectedOrderCopy("sold_out", false)).toMatch(/sold out/i);
    expect(rejectedOrderCopy("too_busy", false)).toMatch(/kitchen/i);
    expect(rejectedOrderCopy("closing", false)).toMatch(/closing/i);
  });

  it("falls back rather than printing a code at a customer", () => {
    // Rows written before this list existed, and any code a future build adds
    // that this one does not know.
    for (const stale of [null, "", "some_old_code", "prose written by hand"]) {
      const copy = rejectedOrderCopy(stale, false);
      expect(copy, String(stale)).toBe(REJECT_REASON_COPY.other);
      expect(copy).not.toMatch(/_/);
    }
  });

  it("tells a customer who paid that the money is coming back", () => {
    // The refund is a separate deliberate step by staff, so this promises it
    // without claiming it has already happened.
    const paid = rejectedOrderCopy("sold_out", true);
    expect(paid).toMatch(/return your payment/i);
    expect(paid).not.toMatch(/refunded already|has been returned/i);
    expect(rejectedOrderCopy("sold_out", false)).not.toMatch(/payment/i);
  });
});

describe("the tracking page", () => {
  it("builds the rejection from the code, not from the stored text", () => {
    const copy = statusCopy(rejected);
    expect(copy.title).toMatch(/could not take this order/i);
    expect(copy.body).toBe(REJECT_REASON_COPY.sold_out);
    // The pickup code is dead the moment an order is refused.
    expect(copy.codeIsLive).toBe(false);
  });

  it("adds the refund promise only when the payment actually landed", () => {
    const paid: TrackedOrder = {
      ...rejected,
      payment: { method: "qrph", status: "paid", amountCents: 32900, paidAt: "2026-08-12T02:10:00.000Z" },
    };
    expect(statusCopy(paid).body).toMatch(/return your payment/i);
    expect(statusCopy(rejected).body).not.toMatch(/return your payment/i);
  });
});
