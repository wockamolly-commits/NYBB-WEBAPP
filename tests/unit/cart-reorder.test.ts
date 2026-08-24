import { describe, expect, it } from "vitest";
import { rebuildCartLines, type PastOrderLine } from "@/lib/cart/reorder";
import type { MenuCategory } from "@/lib/menu/types";

const wings: MenuCategory = {
  slug: "chicken-wings",
  name: "Chicken Wings",
  blurb: "",
  items: [
    {
      slug: "chicken-wings",
      name: "Chicken Wings",
      categorySlug: "chicken-wings",
      featured: true,
      image: null,
      variations: [
        { slug: "half", name: "Half, 6 pieces", shortName: "HALF", priceCents: 25000 },
        { slug: "full", name: "Full, 10 pieces", shortName: "FULL", priceCents: 40000 },
      ],
      optionGroups: [
        {
          slug: "wing-flavour",
          name: "Wing Flavour",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { slug: "salted-egg", name: "Salted Egg", priceCents: 0, variationPriceCents: {} },
            { slug: "cheezy", name: "Cheezy", priceCents: 0, variationPriceCents: {} },
          ],
        },
      ],
    },
  ],
};

const fries: MenuCategory = {
  slug: "sides",
  name: "Sides",
  blurb: "",
  items: [
    {
      slug: "french-fries",
      name: "French Fries",
      categorySlug: "sides",
      featured: false,
      image: null,
      variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 8000 }],
      optionGroups: [],
    },
  ],
};

const menu = [wings, fries];

function pastWings(overrides: Partial<PastOrderLine> = {}): PastOrderLine {
  return {
    name: "Chicken Wings",
    variationLabel: "Half, 6 pieces",
    quantity: 2,
    options: [{ group: "Wing Flavour", name: "Salted Egg" }],
    ...overrides,
  };
}

describe("rebuilding a past order into cart lines", () => {
  it("restores a clean order with its quantities", () => {
    const result = rebuildCartLines(menu, [pastWings()]);
    expect(result.skipped).toEqual([]);
    expect(result.lines).toEqual([
      {
        itemSlug: "chicken-wings",
        variationSlug: "half",
        optionSlugs: { "wing-flavour": ["salted-egg"] },
        quantity: 2,
        unitPriceCents: 25000,
      },
    ]);
  });

  it("restores an item that has no options at all", () => {
    const result = rebuildCartLines(menu, [
      { name: "French Fries", variationLabel: "Regular", quantity: 1, options: [] },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.lines[0]?.itemSlug).toBe("french-fries");
  });

  it("skips a renamed item rather than matching a neighbour", () => {
    const result = rebuildCartLines(menu, [pastWings({ name: "Chicken Wing" })]);
    expect(result.lines).toEqual([]);
    expect(result.skipped).toEqual([
      { name: "Chicken Wing", variationLabel: "Half, 6 pieces", reason: "item" },
    ]);
  });

  it("skips a size that is no longer sold", () => {
    const result = rebuildCartLines(menu, [pastWings({ variationLabel: "Bucket, 30 pieces" })]);
    expect(result.skipped[0]?.reason).toBe("variation");
  });

  it("skips a withdrawn flavour rather than restoring wings without one", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ options: [{ group: "Wing Flavour", name: "Honey Garlic" }] }),
    ]);
    expect(result.lines).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("option");
  });

  it("matches exactly, so a near name is a miss and not a substitution", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ options: [{ group: "Wing Flavour", name: "Salted Eggs" }] }),
    ]);
    expect(result.skipped[0]?.reason).toBe("option");
  });

  it("ignores surrounding space and case, which are not menu changes", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ name: "  chicken wings ", variationLabel: "HALF, 6 PIECES" }),
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.lines[0]?.itemSlug).toBe("chicken-wings");
  });

  it("carries today's price, never the price that was paid", () => {
    const result = rebuildCartLines(menu, [pastWings()]);
    expect(result.lines[0]?.unitPriceCents).toBe(25000);
  });

  it("clamps a quantity above the line ceiling", () => {
    const result = rebuildCartLines(menu, [pastWings({ quantity: 999 })]);
    expect(result.lines[0]?.quantity).toBe(20);
  });

  it("restores what it can and reports the rest", () => {
    const result = rebuildCartLines(menu, [
      pastWings(),
      pastWings({ name: "Gone Forever" }),
      { name: "French Fries", variationLabel: "Regular", quantity: 1, options: [] },
    ]);
    expect(result.lines).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
  });
});
