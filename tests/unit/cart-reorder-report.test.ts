import { describe, expect, it } from "vitest";
import {
  REORDER_REPORT_KEY,
  describeSkip,
  stashReorderReport,
  takeReorderReport,
} from "@/lib/cart/reorder-report";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("carrying the reorder report to the cart", () => {
  it("hands the report back once and then forgets it", () => {
    const storage = fakeStorage();
    stashReorderReport({ restored: 2, skipped: [] }, storage);

    expect(takeReorderReport(storage)).toEqual({ restored: 2, skipped: [] });
    // A report that survived a refresh would explain a cart the customer has
    // since edited.
    expect(takeReorderReport(storage)).toBeNull();
  });

  it("returns null when nothing was stashed", () => {
    expect(takeReorderReport(fakeStorage())).toBeNull();
  });

  it("survives unreadable stored content without throwing", () => {
    const storage = fakeStorage();
    storage.setItem("nybb.reorder-report", "not json");
    expect(takeReorderReport(storage)).toBeNull();
  });

  it("survives a storage object whose getItem throws", () => {
    // Distinct from the "unreadable stored content" case above: there the
    // store works fine and merely holds bad JSON. Here the store itself
    // throws when read, the way some browsers behave with site data
    // blocked (a usable sessionStorage reference that throws SecurityError
    // from getItem, not from acquiring sessionStorage in the first place).
    const storage = fakeStorage();
    const throwingStorage: Storage = {
      ...storage,
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(takeReorderReport(throwingStorage)).toBeNull();
  });

  it("says what happened to a skipped line in words a customer can act on", () => {
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "item" }))
      .toBe("Chicken Wings is not on the menu any more.");
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "variation" }))
      .toBe("Chicken Wings is no longer sold in Half, 6 pieces.");
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "option" }))
      .toBe("Chicken Wings cannot be rebuilt because one of its choices has changed.");
    expect(describeSkip({ name: "", variationLabel: "", reason: "cart-full" }))
      .toBe("Your cart was already full, so nothing more could be added to it.");
  });

  it("drops a skipped entry with an unrecognised reason but keeps the rest", () => {
    const storage = fakeStorage();
    storage.setItem(
      REORDER_REPORT_KEY,
      JSON.stringify({
        restored: 3,
        skipped: [
          { name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "item" },
          { name: "Something Odd", variationLabel: "", reason: "discontinued-forever" },
        ],
      }),
    );

    expect(takeReorderReport(storage)).toEqual({
      restored: 3,
      skipped: [{ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "item" }],
    });
  });
});
