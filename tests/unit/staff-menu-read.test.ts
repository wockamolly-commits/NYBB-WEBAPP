import { describe, expect, it } from "vitest";
import { catalogImage, catalogImageBySource, imageKeys } from "@/lib/catalog/images";
import { assembleManagedMenu, type ManagedMenuRows } from "@/lib/staff/menu";
import { holdSummary } from "@/lib/staff/menu-types";

/**
 * An archive photograph that actually ships, taken from the manifest itself.
 *
 * Hardcoding a hashed filename here would be a test that breaks every time
 * the derivatives are rebuilt. What matters is that the workspace resolves a
 * row through the same table the storefront resolves it through, so the
 * fixture asks that table for a source it really has.
 */
const ARCHIVE_SOURCE_PATH =
  imageKeys()
    .map((key) => catalogImage(key)?.source)
    .find((source): source is string => Boolean(source)) ?? "";

const rows: ManagedMenuRows = {
  categories: [
    { id: "cat-wings", slug: "wings", name: "Wings", blurb: "By the piece.", is_active: true, sort_order: 10 },
    { id: "cat-empty", slug: "sides", name: "Sides", blurb: null, is_active: false, sort_order: 20 },
  ],
  items: [
    { id: "item-wings", category_id: "cat-wings", slug: "chicken-wings", name: "Chicken Wings", code: "BB1", description: null, image_url: null, image_source: null, image_width: null, image_height: null, image_blur_data_url: null, image_treatment: null, is_featured: true, is_active: true, sort_order: 10 },
  ],
  variations: [
    { id: "var-full", item_id: "item-wings", slug: "full", label: "Full, 10 pieces", short_label: "FULL", price_cents: 52900, is_default: false, is_active: true, sort_order: 20 },
    { id: "var-half", item_id: "item-wings", slug: "half", label: "Half, 6 pieces", short_label: "HALF", price_cents: 32900, is_default: true, is_active: true, sort_order: 10 },
  ],
  groups: [
    { id: "grp-heat", slug: "level-of-hotness", name: "Level of Hotness", description: null, is_active: true, sort_order: 20 },
  ],
  options: [
    { id: "opt-insane", group_id: "grp-heat", slug: "insane", name: "Insane", description: null, price_cents: null, heat_percent: 100, image_url: null, image_source: null, image_width: null, image_height: null, image_blur_data_url: null, is_active: true, sort_order: 60 },
    { id: "opt-none", group_id: "grp-heat", slug: "none", name: "No heat", description: null, price_cents: 0, heat_percent: 0, image_url: null, image_source: null, image_width: null, image_height: null, image_blur_data_url: null, is_active: true, sort_order: 10 },
  ],
  links: [
    { item_id: "item-wings", group_id: "grp-heat", is_required: false, min_select: 0, max_select: 1, sort_order: 20 },
  ],
  holds: [
    { item_id: "item-wings", branch_id: "branch-pilot", kind: "until", unavailable_until: "2026-08-25T18:00:00.000Z" },
  ],
  branches: [{ id: "branch-pilot", short_name: "Central Bloc" }],
  optionPrices: [],
};

/**
 * The three states a row's photograph can be in, kept apart from the fixture
 * above so that adding them does not change what every other test is looking
 * at.
 */
const photoRows: ManagedMenuRows = {
  ...rows,
  items: [
    { id: "item-none", category_id: "cat-wings", slug: "no-photo", name: "No Photo", code: null, description: null, image_url: null, image_source: null, image_width: null, image_height: null, image_blur_data_url: null, image_treatment: null, is_featured: false, is_active: true, sort_order: 10 },
    { id: "item-archive", category_id: "cat-wings", slug: "archive-photo", name: "Archive Photo", code: null, description: null, image_url: null, image_source: ARCHIVE_SOURCE_PATH, image_width: null, image_height: null, image_blur_data_url: null, image_treatment: null, is_featured: false, is_active: true, sort_order: 20 },
    { id: "item-uploaded", category_id: "cat-wings", slug: "uploaded-photo", name: "Uploaded Photo", code: null, description: null, image_url: "https://storage.test/2026/abc.webp", image_source: null, image_width: 900, image_height: 900, image_blur_data_url: "data:image/webp;base64,AAA", image_treatment: "cutout", is_featured: false, is_active: true, sort_order: 30 },
  ],
  options: [
    { id: "opt-archive", group_id: "grp-heat", slug: "archive-option", name: "Archive Option", description: null, price_cents: 0, heat_percent: 0, image_url: null, image_source: ARCHIVE_SOURCE_PATH, image_width: null, image_height: null, image_blur_data_url: null, is_active: true, sort_order: 10 },
  ],
  holds: [],
  links: [],
};

describe("assembleManagedMenu", () => {
  it("nests items under their category in sort order", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories.map((category) => category.slug)).toEqual(["wings", "sides"]);
    expect(menu.categories[0]?.items.map((item) => item.slug)).toEqual(["chicken-wings"]);
  });

  it("keeps a category that has no items, because a manager still has to edit it", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories[1]?.items).toEqual([]);
  });

  it("orders variations by sort order, not by the order they arrived", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories[0]?.items[0]?.variations.map((variation) => variation.slug)).toEqual(["half", "full"]);
  });

  /**
   * The bug this pins: the workspace read image_url and nothing else, so
   * every row whose photograph comes from the archive (twenty-three of
   * thirty-one items in the live menu on 2026-08-27) reported no photo while
   * the storefront was drawing one. Both sides now resolve through
   * lib/menu/resolve-image.ts.
   */
  it("shows the archive photograph the storefront is already showing", () => {
    expect(ARCHIVE_SOURCE_PATH, "the manifest ships no sourced image").not.toBe("");
    const menu = assembleManagedMenu(photoRows);
    const item = menu.categories[0]?.items.find((row) => row.slug === "archive-photo");
    expect(item?.image).toEqual({
      src: catalogImageBySource(ARCHIVE_SOURCE_PATH)?.src,
      origin: "archive",
    });

    const option = menu.optionGroups[0]?.options.find((row) => row.slug === "archive-option");
    expect(option?.image?.origin).toBe("archive");
  });

  it("prefers the uploaded photograph over the archive one", () => {
    const menu = assembleManagedMenu(photoRows);
    const item = menu.categories[0]?.items.find((row) => row.slug === "uploaded-photo");
    expect(item?.image).toEqual({ src: "https://storage.test/2026/abc.webp", origin: "uploaded" });
  });

  it("reports no photograph only when there is genuinely none", () => {
    const menu = assembleManagedMenu(photoRows);
    expect(menu.categories[0]?.items.find((row) => row.slug === "no-photo")?.image).toBeNull();
  });

  it("preserves a null option price rather than coalescing it to zero", () => {
    const menu = assembleManagedMenu(rows);
    const heat = menu.optionGroups[0];
    expect(heat?.options.find((option) => option.slug === "insane")?.priceCents).toBeNull();
    expect(heat?.options.find((option) => option.slug === "none")?.priceCents).toBe(0);
  });

  it("attaches a hold to its item and names the branch", () => {
    const menu = assembleManagedMenu(rows);
    const item = menu.categories[0]?.items[0];
    expect(item?.holds).toEqual([
      { branchId: "branch-pilot", branchShortName: "Central Bloc", kind: "until", unavailableUntil: "2026-08-25T18:00:00.000Z" },
    ]);
  });

  it("reports which items an option group is used by", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.optionGroups[0]?.linkedItemIds).toEqual(["item-wings"]);
  });

  it("leaves holds empty for an item nothing holds", () => {
    const menu = assembleManagedMenu({ ...rows, holds: [] });
    expect(menu.categories[0]?.items[0]?.holds).toEqual([]);
    expect(holdSummary([])).toBeNull();
  });

  it("nests an option price under the item that owns the variation", () => {
    const menu = assembleManagedMenu({
      ...rows,
      optionPrices: [{ option_id: "opt-insane", variation_id: "var-half", price_cents: 4000 }],
    });
    expect(menu.categories[0]?.items[0]?.optionVariationPrices).toEqual({
      "opt-insane": { "var-half": 4000 },
    });
  });
});
