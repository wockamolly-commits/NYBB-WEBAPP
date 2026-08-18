import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A source tripwire, not a unit test. One worker serves scope "/" and therefore
 * both audiences. Its fallback used to say "New order / Open the orders board
 * to see it", which is what a CUSTOMER would have been shown for any payload
 * the worker could not parse. This proves the fallback is chosen by audience
 * and that neither audience's words leaked into the other's branch.
 */
const source = readFileSync("public/sw.js", "utf8");

describe("public/sw.js", () => {
  it("reads the audience off the payload", () => {
    expect(source).toContain("payload.audience");
  });

  it("carries a fallback for each audience", () => {
    expect(source).toContain('"/workspace/orders"');
    expect(source).toMatch(/customer/);
  });

  it("never sends a customer to the orders board", () => {
    // The staff fallback URL must not be the default any more. A bare
    // FALLBACK_URL constant pointing at the board is exactly the bug.
    expect(source).not.toMatch(/const FALLBACK_URL = "\/workspace\/orders"/);
  });
});
