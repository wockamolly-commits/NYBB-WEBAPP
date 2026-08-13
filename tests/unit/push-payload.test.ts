import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customerPayload, staffPayload } from "@/lib/push/payload";
import { statusCopy } from "@/lib/orders/status";

const base = {
  shortCode: "NY-ABC234",
  trackingToken: "11111111-1111-4111-8111-111111111111",
  timeline: { rejectedReason: null, cancelledReason: null },
  payment: { method: "qrph", status: "paid" },
};

describe("customerPayload", () => {
  it("says exactly what the tracking screen says, for ready", () => {
    const order = { ...base, status: "ready" as const };
    const payload = customerPayload(order);
    const copy = statusCopy(order);
    expect(payload.title).toBe(copy.title);
    expect(payload.body).toBe(copy.body);
  });

  it("carries the branch's own refusal reason rather than a generic line", () => {
    const order = {
      ...base,
      status: "rejected" as const,
      timeline: { rejectedReason: "out_of_stock", cancelledReason: null },
    };
    const payload = customerPayload(order);
    expect(payload.body).toBe(statusCopy(order).body);
    expect(payload.body).not.toContain("something went wrong");
  });

  it("distinguishes a timed-out payment from a failed one", () => {
    const timedOut = {
      ...base,
      status: "cancelled" as const,
      timeline: { rejectedReason: null, cancelledReason: "payment_timeout" },
      payment: { method: "qrph", status: "pending" },
    };
    const failed = {
      ...base,
      status: "cancelled" as const,
      timeline: { rejectedReason: null, cancelledReason: "payment_failed" },
      payment: { method: "qrph", status: "failed" },
    };
    expect(customerPayload(timedOut).body).not.toBe(customerPayload(failed).body);
  });

  it("links to the order with its tracking token", () => {
    const payload = customerPayload({ ...base, status: "ready" as const });
    expect(payload.url).toBe("/order/NY-ABC234?t=11111111-1111-4111-8111-111111111111");
  });

  it("tags on the short code so one order cannot stack on a lock screen", () => {
    expect(customerPayload({ ...base, status: "ready" as const }).tag).toBe("NY-ABC234");
  });

  it("makes ready the only one that demands attention", () => {
    const ready = customerPayload({ ...base, status: "ready" as const });
    const rejected = customerPayload({
      ...base,
      status: "rejected" as const,
      timeline: { rejectedReason: "out_of_stock", cancelledReason: null },
    });
    expect(ready.requireInteraction).toBe(true);
    expect(ready.renotify).toBe(true);
    expect(ready.vibrate).not.toBeNull();
    expect(rejected.requireInteraction).toBe(false);
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
});

// A tripwire, not a unit test. The value of reusing statusCopy() is that there
// is one voice talking to the customer, and the way that gets lost is somebody
// adding "a quick sentence" here rather than editing the copy file.
describe("the source itself", () => {
  it("contains no customer sentences of its own", () => {
    const source = readFileSync("lib/push/payload.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Match only single-line strings by excluding newlines, so we catch real strings
    // and not gaps between quotes on different lines.
    const sentences = code.match(/"[^"\n]{25,}"/g) ?? [];
    expect(sentences).toEqual([]);
  });
});
