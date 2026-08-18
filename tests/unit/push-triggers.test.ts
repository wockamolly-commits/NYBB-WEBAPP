import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The failure these tests catch is invisible until the counter is not told an
 * order arrived, or the customer is not told their order is ready or refused.
 * Same spirit as tests/unit/content-security-policy.test.ts: a source-level
 * tripwire for a decision that has to stay made, not a unit under test.
 *
 * The customer trigger has behavioural cover too, in
 * tests/unit/order-status-notifications.test.ts, since a source-level check
 * cannot tell whether the guard around it still fires on the right status.
 */
describe("the notification trigger points", () => {
  it("marks ready and refuses through after()", () => {
    const source = read("app/(workspace)/workspace/orders/actions.ts");
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
    expect(source).toContain("notifyCustomer");
  });

  it("tells the counter from the paid webhook", () => {
    const source = read("app/api/paymongo/webhook/route.ts");
    expect(source).toContain("notifyStaffOfNewOrder");
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
  });

  it("tells the counter from the mock payment rail too", () => {
    const source = read("lib/customer/payment.ts");
    expect(source).toContain("notifyStaffOfNewOrder");
  });
});
