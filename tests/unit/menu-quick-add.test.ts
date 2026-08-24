import { describe, expect, it } from "vitest";
import { canQuickAdd, quickAddLine } from "@/lib/menu/quick-add";
import type { MenuItem } from "@/lib/menu/types";

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    slug: "french-fries",
    name: "French Fries",
    categorySlug: "sides",
    featured: false,
    image: null,
    variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 8000 }],
    optionGroups: [],
    ...overrides,
  };
}

describe("which items can be added without opening their page", () => {
  it("allows one size and no choices", () => {
    expect(canQuickAdd(item())).toBe(true);
  });

  it("refuses an item with a size to pick", () => {
    expect(
      canQuickAdd(
        item({
          variations: [
            { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 15600 },
            { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 15900 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("refuses an item with any option group, even an optional one", () => {
    // An optional group is still a decision worth showing. Quietly adding the
    // bare item is how somebody gets wings with no heat they meant to order.
    expect(
      canQuickAdd(
        item({
          optionGroups: [
            { slug: "level-of-hotness", name: "Level of Hotness", minSelect: 0, maxSelect: 1, options: [] },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("refuses an item with no variation at all", () => {
    expect(canQuickAdd(item({ variations: [] }))).toBe(false);
  });

  it("builds the line the tile would add", () => {
    expect(quickAddLine(item())).toEqual({
      itemSlug: "french-fries",
      variationSlug: "regular",
      optionSlugs: {},
      quantity: 1,
      unitPriceCents: 8000,
    });
  });

  it("builds nothing for an item that is not eligible", () => {
    expect(quickAddLine(item({ variations: [] }))).toBeNull();
  });
});
