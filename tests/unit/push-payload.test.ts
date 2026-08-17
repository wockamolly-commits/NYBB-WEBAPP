import { describe, expect, it } from "vitest";
import { staffPayload } from "@/lib/push/payload";

/**
 * Only the counter's notification is left to test.
 *
 * There was a `customerPayload` beside it, and a tripwire holding it to
 * `statusCopy()`'s words so one voice talked to the customer. Both went with
 * the native app, which was the only thing a customer notification could ever
 * be delivered to. `statusCopy()` itself is untouched and still writes the
 * tracking page, which is now the only place a customer reads their status.
 */
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
