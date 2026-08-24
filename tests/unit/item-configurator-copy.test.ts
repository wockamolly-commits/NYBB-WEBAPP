import { describe, expect, it } from "vitest";
import { orderingCopy } from "@/lib/menu/ordering-copy";

describe("what the product page says under Add to cart", () => {
  it("does not tell a customer to phone when checkout works", () => {
    const copy = orderingCopy(true);
    expect(copy.canOrder).toBe(true);
    expect(copy.message).not.toMatch(/call the branch/i);
    expect(copy.message).not.toMatch(/opens once/i);
  });

  it("says so plainly when no order can be completed", () => {
    const copy = orderingCopy(false);
    expect(copy.canOrder).toBe(false);
    expect(copy.message).toMatch(/not open/i);
  });
});
