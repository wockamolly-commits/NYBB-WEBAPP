import { describe, expect, it } from "vitest";
import { assembleManagedMenu, type ManagedMenuRows } from "@/lib/staff/menu";
import { holdSummary } from "@/lib/staff/menu-types";

const rows: ManagedMenuRows = {
  categories: [
    { id: "cat-wings", slug: "wings", name: "Wings", blurb: "By the piece.", is_active: true, sort_order: 10 },
    { id: "cat-empty", slug: "sides", name: "Sides", blurb: null, is_active: false, sort_order: 20 },
  ],
  items: [
    { id: "item-wings", category_id: "cat-wings", slug: "chicken-wings", name: "Chicken Wings", code: "BB1", description: null, image_url: null, is_featured: true, is_active: true, sort_order: 10 },
  ],
  variations: [
    { id: "var-full", item_id: "item-wings", slug: "full", label: "Full, 10 pieces", short_label: "FULL", price_cents: 52900, is_default: false, is_active: true, sort_order: 20 },
    { id: "var-half", item_id: "item-wings", slug: "half", label: "Half, 6 pieces", short_label: "HALF", price_cents: 32900, is_default: true, is_active: true, sort_order: 10 },
  ],
  groups: [
    { id: "grp-heat", slug: "level-of-hotness", name: "Level of Hotness", description: null, is_active: true, sort_order: 20 },
  ],
  options: [
    { id: "opt-insane", group_id: "grp-heat", slug: "insane", name: "Insane", description: null, price_cents: null, heat_percent: 100, image_url: null, is_active: true, sort_order: 60 },
    { id: "opt-none", group_id: "grp-heat", slug: "none", name: "No heat", description: null, price_cents: 0, heat_percent: 0, image_url: null, is_active: true, sort_order: 10 },
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
});
