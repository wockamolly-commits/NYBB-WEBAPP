import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

/**
 * The failure these tests catch is invisible until the counter is not told an
 * order arrived. Same spirit as tests/unit/content-security-policy.test.ts: a
 * source-level tripwire for a decision that has to stay made, not a unit under
 * test.
 *
 * There is no customer trigger to guard any more. The only customer transport
 * this project had was the native app's, and it went with the app; see the
 * note at the top of `lib/push/dispatch.ts`.
 */
describe("the notification trigger points", () => {
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
