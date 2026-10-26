import { describe, expect, it } from "vitest";
import {
  browseMenu,
  itemMatchesQuery,
  menuBrowseSearch,
  normaliseSearchText,
  parseMenuBrowseParams,
  type MenuBrowseState,
} from "@/lib/staff/menu-browse";
import type { ManagedCategory, ManagedItem } from "@/lib/staff/menu-types";

/** The menu list's search and filters. See lib/staff/menu-browse.ts. */

function item(overrides: Partial<ManagedItem> & { id: string; name: string }): ManagedItem {
  return {
    categoryId: "c",
    slug: overrides.id,
    code: null,
    description: null,
    image: null,
    isFeatured: false,
    isActive: true,
    sortOrder: 0,
    variations: [],
    optionLinks: [],
    holds: [],
    optionVariationPrices: {},
    ...overrides,
  };
}

function category(
  id: string,
  name: string,
  items: ManagedItem[],
  overrides: Partial<ManagedCategory> = {},
): ManagedCategory {
  return { id, slug: id, name, blurb: null, isActive: true, sortOrder: 0, items, ...overrides };
}

const gravy = item({ id: "gravy", name: "Brad's Gravy Wings", code: "NY10", isFeatured: true });
const classic = item({
  id: "classic",
  name: "Classic Buffalo",
  variations: [
    {
      id: "v12",
      slug: "12pc",
      label: "12 pieces",
      shortLabel: "12PC",
      priceCents: 50_000,
      isDefault: true,
      isActive: true,
      sortOrder: 0,
    },
  ],
  holds: [
    {
      branchId: "b",
      branchShortName: "IT Park",
      kind: "indefinite",
      unavailableUntil: null,
      reason: "out_of_stock",
    },
  ],
});
const fries = item({ id: "fries", name: "Cajun Fries", isActive: false });
const iced = item({ id: "iced", name: "Iced Tea" });

const wings = category("wings", "Wings", [gravy, classic]);
const sides = category("sides", "Sides", [fries]);
const drinks = category("drinks", "Drinks", [iced], { isActive: false });
const empty = category("empty", "Desserts", []);
const menu = [wings, sides, drinks, empty];

const none: MenuBrowseState = { query: "", categoryId: null, status: "all" };

describe("normaliseSearchText", () => {
  it("drops case, accents, apostrophes and extra space", () => {
    expect(normaliseSearchText("  Brad’s   CRÈME ")).toBe("brads creme");
  });
});

describe("itemMatchesQuery", () => {
  it("matches every word in any order, across name, code, size and category", () => {
    expect(itemMatchesQuery(gravy, wings, "brads")).toBe(true);
    expect(itemMatchesQuery(gravy, wings, "ny10")).toBe(true);
    expect(itemMatchesQuery(classic, wings, "12pc wings")).toBe(true);
    expect(itemMatchesQuery(classic, wings, "buffalo fries")).toBe(false);
  });

  it("treats an empty search as matching everything", () => {
    expect(itemMatchesQuery(fries, sides, "   ")).toBe(true);
  });
});

describe("browseMenu", () => {
  it("keeps every category, empty ones too, when nothing narrows it", () => {
    const result = browseMenu(menu, none);
    expect(result.sections.map((s) => s.category.id)).toEqual(["wings", "sides", "drinks", "empty"]);
    expect(result.shown).toBe(4);
    expect(result.total).toBe(4);
  });

  it("drops categories with no match from a search", () => {
    const result = browseMenu(menu, { ...none, query: "fries" });
    expect(result.sections.map((s) => s.category.id)).toEqual(["sides"]);
    expect(result.shown).toBe(1);
  });

  it("counts each status chip as what pressing it would leave", () => {
    const { statusCounts } = browseMenu(menu, none);
    expect(statusCounts).toEqual({ all: 4, "sold-out": 1, "off-menu": 2, featured: 1 });
  });

  it("counts an item in a switched off category as off the menu", () => {
    const result = browseMenu(menu, { ...none, status: "off-menu" });
    expect(result.sections.flatMap((s) => s.items.map((i) => i.id))).toEqual(["fries", "iced"]);
  });

  it("narrows to one category, and still shows it when it is empty", () => {
    expect(browseMenu(menu, { ...none, categoryId: "wings" }).shown).toBe(2);
    const result = browseMenu(menu, { ...none, categoryId: "empty" });
    expect(result.sections.map((s) => s.category.id)).toEqual(["empty"]);
    expect(result.shown).toBe(0);
  });

  it("counts categories after the search and status, and status chips inside the category", () => {
    const result = browseMenu(menu, { ...none, categoryId: "wings", status: "sold-out" });
    expect(result.categoryCounts).toEqual({ wings: 1, sides: 0, drinks: 0, empty: 0 });
    expect(result.statusCounts).toEqual({ all: 2, "sold-out": 1, "off-menu": 0, featured: 1 });
  });
});

describe("search params", () => {
  it("round trips, by category slug rather than id", () => {
    const state: MenuBrowseState = { query: " gravy ", categoryId: "wings", status: "featured" };
    const search = menuBrowseSearch(state, menu);
    expect(search).toBe("?q=gravy&category=wings&status=featured");
    expect(parseMenuBrowseParams(Object.fromEntries(new URLSearchParams(search)), menu)).toEqual({
      query: "gravy",
      categoryId: "wings",
      status: "featured",
    });
  });

  it("is empty when unfiltered, and ignores what it does not recognise", () => {
    expect(menuBrowseSearch(none, menu)).toBe("");
    expect(parseMenuBrowseParams({ category: "nope", status: "bogus" }, menu)).toEqual(none);
  });
});
