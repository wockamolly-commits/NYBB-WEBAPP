import type { MenuCategory, MenuItem, MenuOptionGroup } from "./types";

export { getStorefrontMenu } from "./storefront";
export { previewImage } from "./preview";
export { staticMenu } from "./static";
export type * from "./types";

/** Every item, flattened, in menu order. */
export function allItems(categories: MenuCategory[]): MenuItem[] {
  return categories.flatMap((category) => category.items);
}

export function findCategory(
  categories: MenuCategory[],
  slug: string,
): MenuCategory | undefined {
  return categories.find((category) => category.slug === slug);
}

export function findItem(categories: MenuCategory[], slug: string): MenuItem | undefined {
  return allItems(categories).find((item) => item.slug === slug);
}

/**
 * The landing page's "Not just wings" strip: photographs of everything that
 * is not wings, in whole rows of `row`.
 *
 * The wings' own category is left out, because the ten flavours above it
 * already are the wings and a strip headed "Not just wings" that opens on a
 * basket of them contradicts itself. So is anything without a photograph: the
 * strip is there to make somebody hungry, and a name on a plain square does
 * not. Both are still on /menu.
 *
 * The owner's featured items come first, in menu order. Featured is a switch
 * in the workspace, so it can leave a row short; the gap is filled with one
 * photographed item from each category not yet shown, again in menu order, so
 * the strip shows range rather than three burgers. Only if that runs out does
 * it take a second item from a category already there, and a remainder that
 * still cannot fill a row is cut, unless it is all there is.
 */
export function landingShowcase(
  categories: MenuCategory[],
  { row = 4, max = 8 }: { row?: number; max?: number } = {},
): MenuItem[] {
  const wingsCategory = findItem(categories, WINGS_ITEM_SLUG)?.categorySlug;
  const pool = allItems(categories).filter(
    (item) => item.image && item.categorySlug !== wingsCategory,
  );

  const picks = pool.filter((item) => item.featured).slice(0, max);
  const target = Math.min(Math.max(row, Math.ceil(picks.length / row) * row), max);

  const shown = new Set(picks.map((item) => item.categorySlug));
  for (const item of pool) {
    if (picks.length >= target) break;
    if (picks.includes(item) || shown.has(item.categorySlug)) continue;
    picks.push(item);
    shown.add(item.categorySlug);
  }
  for (const item of pool) {
    if (picks.length >= target) break;
    if (!picks.includes(item)) picks.push(item);
  }

  return picks.length < row ? picks : picks.slice(0, Math.floor(picks.length / row) * row);
}

/**
 * The wings, and the two option groups the configurator is built around.
 *
 * Looked up by slug rather than by position because the menu is owner-editable
 * from Phase 4: a reordered category must not silently change which item the
 * landing page treats as the flagship.
 */
export function findOptionGroup(
  item: MenuItem | undefined,
  slug: string,
): MenuOptionGroup | undefined {
  return item?.optionGroups.find((group) => group.slug === slug);
}

export const WINGS_ITEM_SLUG = "chicken-wings";
export const WING_FLAVOUR_GROUP_SLUG = "wing-flavour";
export const WING_HEAT_GROUP_SLUG = "level-of-hotness";
