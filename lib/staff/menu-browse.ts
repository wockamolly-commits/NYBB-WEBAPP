import type { ManagedCategory, ManagedItem } from "./menu-types";

/**
 * The menu list's search and filters, decided away from the component.
 *
 * The list holds every item the workspace can read (about fifty), so the
 * whole thing filters in the browser on each keystroke. Nothing here goes to
 * the database, which is why it is a pure function and why it is unit tested
 * rather than left inside the screen.
 */

/** Which slice of the menu the status filter keeps. */
export type MenuStatusFilter = "all" | "sold-out" | "off-menu" | "featured";

export const MENU_STATUS_FILTERS: readonly MenuStatusFilter[] = [
  "all",
  "sold-out",
  "off-menu",
  "featured",
];

export const MENU_STATUS_FILTER_LABELS: Record<MenuStatusFilter, string> = {
  all: "All items",
  "sold-out": "Sold out",
  "off-menu": "Off the menu",
  featured: "Featured",
};

export type MenuBrowseState = {
  query: string;
  /** A category id, or null for every category. */
  categoryId: string | null;
  status: MenuStatusFilter;
};

export type MenuBrowseSection = { category: ManagedCategory; items: ManagedItem[] };

export type MenuBrowseResult = {
  sections: MenuBrowseSection[];
  /** Items left after every filter. */
  shown: number;
  /** Every item on the menu, before any filter. */
  total: number;
  /**
   * How many items each status chip would show, counted after the search and
   * the category but before the status itself, so a chip's number is what
   * pressing it would leave on screen.
   */
  statusCounts: Record<MenuStatusFilter, number>;
  /** The same, per category, counted after the search and the status. */
  categoryCounts: Record<string, number>;
};

/**
 * Lower case, accents dropped, runs of space collapsed. "Brad's" and "brads"
 * should find the same gravy, and a cashier typing on a tablet will not type
 * the apostrophe.
 */
export function normaliseSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Everything a search may land on for one item, joined into one string. */
function haystack(item: ManagedItem, category: ManagedCategory): string {
  return normaliseSearchText(
    [
      item.name,
      item.code,
      item.slug,
      item.description,
      category.name,
      ...item.variations.flatMap((variation) => [variation.label, variation.shortLabel]),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Whether one item answers the search. Every word must appear somewhere, in
 * any order, so "wings 12" finds "12 pc Wings" and "ny3" finds the third
 * flavour by its printed code. An empty search matches everything.
 */
export function itemMatchesQuery(
  item: ManagedItem,
  category: ManagedCategory,
  query: string,
): boolean {
  const words = normaliseSearchText(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const text = haystack(item, category);
  return words.every((word) => text.includes(word));
}

/**
 * Whether one item belongs in a status slice.
 *
 * "Off the menu" counts an item whose category is off, because a customer
 * cannot see it either way and the person asking "what is hidden" means both.
 */
export function itemMatchesStatus(
  item: ManagedItem,
  category: ManagedCategory,
  status: MenuStatusFilter,
): boolean {
  switch (status) {
    case "all":
      return true;
    case "sold-out":
      return item.holds.length > 0;
    case "off-menu":
      return !item.isActive || !category.isActive;
    case "featured":
      return item.isFeatured;
  }
}

/** True when nothing narrows the list, so every category shows, empty ones too. */
export function isUnfiltered(state: MenuBrowseState): boolean {
  return normaliseSearchText(state.query) === "" && state.categoryId === null && state.status === "all";
}

export function browseMenu(categories: ManagedCategory[], state: MenuBrowseState): MenuBrowseResult {
  const statusCounts: Record<MenuStatusFilter, number> = {
    all: 0,
    "sold-out": 0,
    "off-menu": 0,
    featured: 0,
  };
  const categoryCounts: Record<string, number> = {};
  const sections: MenuBrowseSection[] = [];
  let shown = 0;
  let total = 0;
  const unfiltered = isUnfiltered(state);

  for (const category of categories) {
    categoryCounts[category.id] = 0;
    const inCategory = state.categoryId === null || state.categoryId === category.id;
    const kept: ManagedItem[] = [];

    for (const item of category.items) {
      total += 1;
      if (!itemMatchesQuery(item, category, state.query)) continue;

      const statusMatch = itemMatchesStatus(item, category, state.status);
      if (statusMatch) categoryCounts[category.id]! += 1;

      if (!inCategory) continue;
      for (const status of MENU_STATUS_FILTERS) {
        if (itemMatchesStatus(item, category, status)) statusCounts[status] += 1;
      }
      if (statusMatch) kept.push(item);
    }

    shown += kept.length;
    // An empty category is worth seeing when browsing the whole menu (it is
    // somewhere to add an item) and is noise in a search result. A category
    // picked on its own is shown even when empty, so the choice is answered.
    if (kept.length > 0 || (unfiltered && inCategory) || state.categoryId === category.id) {
      sections.push({ category, items: kept });
    }
  }

  return { sections, shown, total, statusCounts, categoryCounts };
}

/**
 * Reads the list's state from the page's search params, so a filtered list
 * survives opening an item and pressing Back. Anything unrecognised falls
 * back to the unfiltered list rather than to an error.
 */
export function parseMenuBrowseParams(
  params: Record<string, string | string[] | undefined>,
  categories: ManagedCategory[],
): MenuBrowseState {
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const query = one(params.q).slice(0, 80);
  const slug = one(params.category);
  const category = categories.find((entry) => entry.slug === slug) ?? null;
  const rawStatus = one(params.status);
  const status = (MENU_STATUS_FILTERS as readonly string[]).includes(rawStatus)
    ? (rawStatus as MenuStatusFilter)
    : "all";
  return { query, categoryId: category?.id ?? null, status };
}

/** The inverse of parseMenuBrowseParams: an empty string when unfiltered. */
export function menuBrowseSearch(state: MenuBrowseState, categories: ManagedCategory[]): string {
  const params = new URLSearchParams();
  if (state.query.trim() !== "") params.set("q", state.query.trim());
  const category = categories.find((entry) => entry.id === state.categoryId);
  if (category) params.set("category", category.slug);
  if (state.status !== "all") params.set("status", state.status);
  const search = params.toString();
  return search === "" ? "" : `?${search}`;
}
