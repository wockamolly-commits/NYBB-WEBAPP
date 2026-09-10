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

  /**
   * The ten flavour codes, spelled out rather than generated from the array
   * order, because generating them would assert only that this file agrees
   * with itself. These are the numbers on the printed menu and on the badges
   * in the 2025/03 shoot, and they are the point of the test.
   *
   * The 2024/05 shoot numbers the same photographs differently (Brad's Gravy
   * NY3, Sweet Spicy NY10) from a nine-flavour menu that predates Brad's
   * Gravy. Seven of ten agree, so a spot check of the wrong shoot passes.
   */
  it("numbers the wing flavours NY1 to NY10, as the printed menu does", () => {
    expect(wingFlavours.options.map((option) => [option.slug, option.code])).toEqual([
      ["classic-buffalo", "NY1"],
      ["bbq-lime", "NY2"],
      ["cheezy", "NY3"],
      ["garlic-parmesan", "NY4"],
      ["honey-mustard", "NY5"],
      ["smokey-barbecue", "NY6"],
      ["salted-egg", "NY7"],
      ["honey-garlic", "NY8"],
      ["sweet-spicy", "NY9"],
      ["brads-gravy", "NY10"],
    ]);
  });

  it("gives a code to the flavours and to nothing else", () => {
    for (const option of wingHeat.options) {
      expect(option.code, option.slug).toBeUndefined();
    }
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
  it("carries the ten Hot Wings flavours", () => {
    expect(wingFlavours.options).toHaveLength(10);
    expect(wingFlavours.minSelect).toBe(1);
    expect(wingFlavours.maxSelect).toBe(1);
  });

  it("charges nothing to choose a flavour", () => {
    for (const flavour of wingFlavours.options) {
      expect(flavour.priceCents, flavour.slug).toBe(0);
    }
  });

  it("excludes the Sports Lounge only flavours", () => {
    // Lemon Pepper, Pesto and Hickory are on the closed venue's eleven flavour
    // list and nowhere else, and the archive still holds photography for them.
    //
    // Brad's Gravy was in this list until 2026-09-07 and did not belong: it is
    // on both brands' lists. The archive's 2025/03 Hot Wings refresh carries a
    // shot of it, and the live Foodpanda listing for SM City Cebu names it in
    // "Chicken Flavor (6pcs)". Sharing a flavour with the closed venue is not
    // the same as belonging only to it.
    const slugs = wingFlavours.options.map((flavour) => flavour.slug);
    for (const excluded of ["lemon-pepper", "pesto", "hickory"]) {
      expect(slugs).not.toContain(excluded);
    }
    expect(slugs).toContain("brads-gravy");
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

  it("does not carry the closed Ayala Sports Lounge location", () => {
    const haystack = JSON.stringify(branches).toLowerCase();
    expect(haystack).not.toContain("ayala");
    expect(haystack).not.toContain("sports lounge");
  });

  it("uses the current Central Bloc branch name", () => {
    const branch = branches.find((candidate) => candidate.slug === "garden-bloc");
    expect(branch).toMatchObject({
      name: "NYBB Hot Wings, Central Bloc",
      shortName: "Central Bloc, IT Park",
      addressLine: "Central Bloc, Cebu IT Park, Lahug",
    });
  });
});
