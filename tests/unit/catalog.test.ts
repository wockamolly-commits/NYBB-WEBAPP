import { describe, expect, it } from "vitest";
import {
  allItems,
  branches,
  catalogImage,
  categories,
  featuredItems,
  imageKeys,
} from "@/lib/catalog";
import { wingFlavours, wingHeat } from "@/lib/catalog/menu";

describe("catalog integrity", () => {
  it("has a unique slug per category and per item", () => {
    const categorySlugs = categories.map((category) => category.slug);
    expect(new Set(categorySlugs).size).toBe(categorySlugs.length);

    const itemSlugs = allItems().map((item) => item.slug);
    expect(new Set(itemSlugs).size).toBe(itemSlugs.length);
  });

  it("gives every item at least one variation", () => {
    for (const item of allItems()) {
      expect(item.variations.length, item.slug).toBeGreaterThan(0);
    }
  });

  it("prices everything in whole centavos above zero", () => {
    for (const item of allItems()) {
      for (const variation of item.variations) {
        expect(Number.isInteger(variation.priceCents), `${item.slug}/${variation.slug}`).toBe(true);
        expect(variation.priceCents, `${item.slug}/${variation.slug}`).toBeGreaterThan(0);
      }
    }
  });

  it("keeps every item's categorySlug pointing at its own category", () => {
    for (const category of categories) {
      for (const item of category.items) {
        expect(item.categorySlug, item.slug).toBe(category.slug);
      }
    }
  });

  it("resolves every image key it references", () => {
    const referenced = [
      ...allItems().map((item) => item.imageKey),
      ...categories.flatMap((category) =>
        category.items.flatMap((item) =>
          item.optionGroups.flatMap((group) => group.options.map((option) => option.imageKey)),
        ),
      ),
      ...branches.map((branch) => branch.imageKey),
    ].filter((key): key is string => Boolean(key));

    for (const key of referenced) {
      expect(catalogImage(key), key).not.toBeNull();
    }
  });

  it("never ships the Sports Lounge frontage photograph", () => {
    // 2024/06/Untitled-design-47.png is the Sports Lounge, which closed in
    // August 2026. The archive holds it and it looks like every other branch
    // photo, so this asserts on provenance rather than on the file name.
    for (const key of imageKeys()) {
      const image = catalogImage(key);
      expect(image?.source, key).not.toBe("2024/06/Untitled-design-47.png");
    }
  });

  it("has something featured for the landing page", () => {
    expect(featuredItems().length).toBeGreaterThan(0);
  });
});

describe("wings", () => {
  it("carries the nine Hot Wings flavours", () => {
    expect(wingFlavours.options).toHaveLength(9);
    expect(wingFlavours.minSelect).toBe(1);
    expect(wingFlavours.maxSelect).toBe(1);
  });

  it("charges nothing to choose a flavour", () => {
    for (const flavour of wingFlavours.options) {
      expect(flavour.priceCents, flavour.slug).toBe(0);
    }
  });

  it("excludes the Sports Lounge only flavours", () => {
    // Lemon Pepper, Pesto, Hickory and Brad's Gravy are on the closed venue's
    // eleven flavour list, and the archive still holds photography for them.
    const slugs = wingFlavours.options.map((flavour) => flavour.slug);
    for (const excluded of ["lemon-pepper", "pesto", "hickory", "brads-gravy"]) {
      expect(slugs).not.toContain(excluded);
    }
  });

  it("runs the heat scale from 20 to 100 in five steps", () => {
    const percents = wingHeat.options
      .map((option) => option.heatPercent ?? 0)
      .filter((percent) => percent > 0);
    expect(percents).toEqual([20, 40, 60, 80, 100]);
  });

  it("makes heat optional", () => {
    expect(wingHeat.minSelect).toBe(0);
  });
});

describe("branches", () => {
  it("has a unique slug per branch and at least one number each", () => {
    const slugs = branches.map((branch) => branch.slug);
    expect(new Set(slugs).size).toBe(slugs.length);

    for (const branch of branches) {
      expect(branch.phones.length, branch.slug).toBeGreaterThan(0);
    }
  });

  it("does not carry the closed Ayala Central Bloc location", () => {
    const haystack = JSON.stringify(branches).toLowerCase();
    expect(haystack).not.toContain("ayala");
    expect(haystack).not.toContain("central bloc");
    expect(haystack).not.toContain("sports lounge");
  });
});
