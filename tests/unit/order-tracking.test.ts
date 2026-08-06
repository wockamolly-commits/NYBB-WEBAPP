import { describe, expect, it } from "vitest";
import {
  ACTIVE_STATUSES,
  PICKUP_STEPS,
  TERMINAL_STATUSES,
  isActiveStatus,
  isTerminalStatus,
  statusCopy,
  stepIndex,
} from "@/lib/orders/status";
import {
  TRACKING_TOKEN_PARAM,
  normalizeShortCode,
  normalizeTrackingToken,
  orderTrackingHref,
  trackedOrderSchema,
} from "@/lib/orders/tracking";
import type { OrderStatus, TrackedOrder } from "@/lib/orders/types";

const EVERY_STATUS: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "claimed",
  "rejected",
  "cancelled",
  "no_show",
];

const EMPTY_TIMELINE: TrackedOrder["timeline"] = {
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  claimedAt: null,
  rejectedAt: null,
  rejectedReason: null,
  cancelledAt: null,
  cancelledReason: null,
  customerArrivedAt: null,
  noShowAt: null,
};

describe("the lifecycle arrays", () => {
  it("cover every status exactly once, and split where spec section 12 splits", () => {
    // The arrays are what the staff board will filter on in Phase 2, so a
    // status that belongs to neither list is an order that appears on no
    // screen at all. That is precisely the bug the reference shipped.
    expect([...ACTIVE_STATUSES, ...TERMINAL_STATUSES].sort()).toEqual([...EVERY_STATUS].sort());
    for (const status of EVERY_STATUS) {
      expect(isActiveStatus(status)).toBe(!isTerminalStatus(status));
    }
    expect(ACTIVE_STATUSES).toEqual(["pending", "accepted", "preparing", "ready"]);
  });
});

describe("what the screen says at each step", () => {
  it("answers every status, so no order lands on a blank page", () => {
    // Only 'pending' is reachable until the staff board exists in Phase 2. The
    // whole ladder is written now so that the first day it can move is not
    // also the first day this page renders an empty box.
    for (const status of EVERY_STATUS) {
      const copy = statusCopy({ status, timeline: EMPTY_TIMELINE });
      expect(copy.title.length, status).toBeGreaterThan(0);
      expect(copy.body.length, status).toBeGreaterThan(0);
    }
  });

  it("gives ready its own tone, because it is the moment the product exists for", () => {
    expect(statusCopy({ status: "ready", timeline: EMPTY_TIMELINE }).tone).toBe("ready");
    expect(statusCopy({ status: "preparing", timeline: EMPTY_TIMELINE }).tone).toBe("waiting");
  });

  it("stops showing the pickup code once it is spent", () => {
    for (const status of ACTIVE_STATUSES) {
      expect(statusCopy({ status, timeline: EMPTY_TIMELINE }).codeIsLive, status).toBe(true);
    }
    for (const status of TERMINAL_STATUSES) {
      expect(statusCopy({ status, timeline: EMPTY_TIMELINE }).codeIsLive, status).toBe(false);
    }
  });

  it("uses the reason staff gave, which is the whole message on a refusal", () => {
    const rejected = statusCopy({
      status: "rejected",
      timeline: { ...EMPTY_TIMELINE, rejectedReason: "We have run out of wings tonight." },
    });
    expect(rejected.body).toBe("We have run out of wings tonight.");

    // And says something useful when staff gave none, rather than a blank.
    const bare = statusCopy({ status: "rejected", timeline: EMPTY_TIMELINE });
    expect(bare.body).toMatch(/call them/i);
    expect(bare.body).toMatch(/nothing has been charged/i);
  });

  it("never leaves a stopped order sounding like a charge was taken", () => {
    for (const status of ["rejected", "cancelled", "no_show"] as OrderStatus[]) {
      const copy = statusCopy({ status, timeline: EMPTY_TIMELINE });
      expect(copy.tone, status).toBe("stopped");
      expect(copy.body, status).toMatch(/nothing has been charged/i);
    }
  });
});

describe("the step ladder", () => {
  it("puts accepted and preparing on one rung, because one tap sets both", () => {
    // Spec section 13 collapses accept and start. Two rungs that always change
    // together would be a screen padding itself out.
    expect(stepIndex("accepted")).toBe(stepIndex("preparing"));
    expect(PICKUP_STEPS[stepIndex("preparing")].label).toBe("Cooking");
  });

  it("advances in order and lands on the last rung when collected", () => {
    expect(stepIndex("pending")).toBe(0);
    expect(stepIndex("ready")).toBe(2);
    expect(stepIndex("claimed")).toBe(PICKUP_STEPS.length - 1);
  });

  it("takes a stopped order off the ladder entirely", () => {
    // A cancelled order does not need three dead rungs beside the one it
    // stopped at. -1 is what the page reads to draw none of them.
    for (const status of ["rejected", "cancelled", "no_show"] as OrderStatus[]) {
      expect(stepIndex(status), status).toBe(-1);
    }
  });
});

describe("the tracking link", () => {
  const token = "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";

  it("carries the token in the query string, where it reads as a credential", () => {
    expect(orderTrackingHref("NY-ABC234", token)).toBe(
      `/order/NY-ABC234?${TRACKING_TOKEN_PARAM}=${token}`,
    );
  });

  it("still builds a link without one, so the page can ask for it", () => {
    expect(orderTrackingHref("NY-ABC234")).toBe("/order/NY-ABC234");
    expect(orderTrackingHref("NY-ABC234", null)).toBe("/order/NY-ABC234");
  });

  it("upper-cases a code read off a screenshot", () => {
    expect(orderTrackingHref(" ny-abc234 ", token)).toMatch(/^\/order\/NY-ABC234\?/);
  });

  it("refuses a token that is merely uuid shaped", () => {
    // A malformed token has to reach the same answer as a wrong one, rather
    // than failing differently and confirming to an attacker that they got the
    // shape right.
    for (const bad of ["", "not-a-uuid", "6f1b4f7c1f6a4e379f0e9b0c2b3f5a11", 42, null]) {
      expect(normalizeTrackingToken(bad)).toBeNull();
    }
    expect(normalizeTrackingToken(token.toUpperCase())).toBe(token);
  });

  it("refuses a short code that could not have come from generate_short_code", () => {
    // The alphabet drops 0, O, 1, I and L so the code survives being read
    // aloud, which means those characters can never appear in a real one.
    expect(normalizeShortCode("ny-abc234")).toBe("NY-ABC234");
    for (const bad of ["NY-ABC23", "ABC234", "NY-ABCO34", "NY-ABC1234", "", 7]) {
      expect(normalizeShortCode(bad), String(bad)).toBeNull();
    }
  });
});

describe("what comes back from get_order_by_tracking", () => {
  const payload = {
    shortCode: "NY-ABC234",
    status: "pending",
    placedAt: "2026-08-06T11:00:00+00:00",
    pickupCode: "0417",
    pickup: { startsAt: "2026-08-06T11:00:00+00:00", endsAt: "2026-08-06T11:15:00+00:00" },
    branch: {
      slug: "pilot",
      name: "Pilot Branch",
      shortName: "Pilot",
      timezone: "Asia/Manila",
      addressLine: "1 Test Street",
      city: "Cebu City",
      phones: ["0906-440-5297"],
    },
    customer: { name: "Steven Cruz", phone: "0906 440 5297", email: null },
    items: [
      {
        name: "Chicken Wings",
        variationLabel: "Full, 10 pieces",
        quantity: 2,
        unitPriceCents: 58900,
        lineTotalCents: 117800,
        notes: null,
        options: [
          { group: "Level of Hotness", name: "Insane", priceCents: 6000, heatPercent: 100 },
        ],
      },
    ],
    subtotalCents: 117800,
    discountCents: 0,
    totalCents: 117800,
    notes: null,
    payment: { method: "counter", status: "due", amountCents: 117800, paidAt: null },
    timeline: EMPTY_TIMELINE,
  };

  it("is parsed rather than trusted", () => {
    expect(trackedOrderSchema.parse(payload).shortCode).toBe("NY-ABC234");
  });

  it("accepts an order with no window and no payment row", () => {
    // Both are nullable in the schema: pickup_slot_id is ON DELETE SET NULL,
    // and a payment row is not guaranteed for an order this reader may one day
    // be pointed at.
    expect(
      trackedOrderSchema.safeParse({ ...payload, pickup: null, payment: null }).success,
    ).toBe(true);
  });

  it("refuses a payload missing the code the customer needs", () => {
    expect(trackedOrderSchema.safeParse({ ...payload, pickupCode: "41" }).success).toBe(false);
    expect(trackedOrderSchema.safeParse({ ...payload, status: "shipped" }).success).toBe(false);
  });
});
