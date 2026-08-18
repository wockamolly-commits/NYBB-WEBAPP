import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { customerPayload, staffPayload, type CustomerPayloadOrder } from "@/lib/push/payload";
import * as statusModule from "@/lib/orders/status";
import { statusCopy } from "@/lib/orders/status";

/**
 * The full timeline, not the two fields these assertions read. `statusCopy()`
 * is handed the whole object and is free to read any stamp on it, so a fixture
 * carrying only two of them stops representing a real order the moment
 * somebody uses another stamp to decide what a notification says.
 */
const emptyTimeline: CustomerPayloadOrder["timeline"] = {
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

const base = {
  shortCode: "NY-ABC234",
  trackingToken: "11111111-1111-4111-8111-111111111111",
  timeline: emptyTimeline,
  payment: { method: "qrph", status: "paid", amountCents: 45000, paidAt: null },
};

describe("customerPayload", () => {
  it("asks the tracking screen for the words rather than reproducing them", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    const spy = vi.spyOn(statusModule, "statusCopy");
    customerPayload(order);
    expect(spy).toHaveBeenCalledWith(order);
    spy.mockRestore();
  });

  it("says exactly what the tracking screen says, for ready", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    const copy = statusCopy(order);
    const payload = customerPayload(order);
    expect(payload.title).toBe(copy.title);
    expect(payload.body).toBe(copy.body);
  });

  it("links to the order with its tracking token", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).url).toBe(
      "/order/NY-ABC234?t=11111111-1111-4111-8111-111111111111",
    );
  });

  it("tags on the short code so one order cannot stack on a lock screen", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).tag).toBe("NY-ABC234");
  });

  it("makes ready the only one that demands attention", () => {
    const ready = customerPayload({ ...base, status: "ready" } as CustomerPayloadOrder);
    const cancelled = customerPayload({ ...base, status: "cancelled" } as CustomerPayloadOrder);
    expect(ready.requireInteraction).toBe(true);
    expect(ready.vibrate).not.toBeNull();
    expect(cancelled.requireInteraction).toBe(false);
    expect(cancelled.vibrate).toBeNull();
  });

  it("is marked for the customer audience", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).audience).toBe("customer");
  });
});

describe("staffPayload", () => {
  it("names the branch and the pickup window, because a counter reads it in a rush", () => {
    const payload = staffPayload({
      shortCode: "NY-ABC234",
      branchShortName: "Central Bloc",
      itemCount: 3,
      pickupStartsAt: "2026-08-13T12:30:00+08:00",
    });
    expect(payload.title).toContain("NY-ABC234");
    expect(payload.body).toContain("3");
    expect(payload.url).toBe("/workspace/orders");
    expect(payload.tag).toBe("NY-ABC234");
  });

  it("is marked for the staff audience", () => {
    expect(
      staffPayload({
        shortCode: "NY-ABC234",
        branchShortName: "Central Bloc",
        itemCount: 1,
        pickupStartsAt: null,
      }).audience,
    ).toBe("staff");
  });
});

// A tripwire, not a unit test. The value of reusing statusCopy() is that there
// is one voice talking to the customer, and the way that gets lost is somebody
// adding "a quick sentence" here rather than editing the copy file.
describe("the source itself", () => {
  it("contains no customer sentences of its own", () => {
    const source = readFileSync("lib/push/payload.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const sentences = code.match(/"[^"\n]{25,}"/g) ?? [];
    expect(sentences).toEqual([]);
  });
});
