import { describe, expect, it } from "vitest";
import { cartsEqual, mergeCarts, planCartSync, sanitizeCart } from "@/lib/cart/sync";
import type { CartLine } from "@/lib/cart/types";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    itemSlug: "chicken-wings",
    variationSlug: "half",
    optionSlugs: {
      "wing-flavour": ["classic-buffalo"],
      "level-of-hotness": ["moderate"],
    },
    quantity: 1,
    unitPriceCents: 35900,
    ...overrides,
  };
}

describe("cart synchronization", () => {
  it("merges a guest cart into an account without losing either side", () => {
    const merged = mergeCarts(
      { lines: [line({ quantity: 2 })] },
      { lines: [line({ quantity: 1 }), line({ itemSlug: "ribs-original" })] },
    );
    expect(merged.lines.map((entry) => [entry.itemSlug, entry.quantity])).toEqual([
      ["chicken-wings", 3],
      ["ribs-original", 1],
    ]);
  });

  it("compares configured lines independently of their array order", () => {
    const wings = line();
    const ribs = line({ itemSlug: "ribs-original" });
    expect(cartsEqual({ lines: [wings, ribs] }, { lines: [ribs, wings] })).toBe(true);
  });

  it("sanitizes the direct Server Action payload", () => {
    const clean = sanitizeCart({
      lines: [line({ quantity: 999 }), { itemSlug: "broken" }, "not a line"],
    });
    expect(clean.lines).toHaveLength(1);
    expect(clean.lines[0].quantity).toBe(20);
  });

  it("merges only on the guest to account transition", () => {
    expect(
      planCartSync({
        storedOwner: null,
        result: { signedIn: true, userId: "user-1", cart: { lines: [] } },
        hasLocalLines: true,
        hasUnsavedEdits: true,
      }),
    ).toEqual({ action: "merge", owner: "user-1" });
  });

  it("adopts rather than leaks a previous account's cart", () => {
    const account = { lines: [line({ itemSlug: "ribs-original" })] };
    expect(
      planCartSync({
        storedOwner: "user-1",
        result: { signedIn: true, userId: "user-2", cart: account },
        hasLocalLines: true,
        hasUnsavedEdits: true,
      }),
    ).toEqual({ action: "adopt", owner: "user-2", cart: account });
  });

  it("clears an account cart after sign-out but leaves a guest cart alone", () => {
    expect(
      planCartSync({
        storedOwner: "user-1",
        result: { signedIn: false },
        hasLocalLines: true,
        hasUnsavedEdits: false,
      }),
    ).toEqual({ action: "clear" });
    expect(
      planCartSync({
        storedOwner: null,
        result: { signedIn: false },
        hasLocalLines: true,
        hasUnsavedEdits: false,
      }),
    ).toEqual({ action: "none" });
  });
});
