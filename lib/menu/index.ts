import type { MenuCategory, MenuItem, MenuOptionGroup } from "./types";

export { getStorefrontMenu } from "./storefront";
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

/** The landing page's bestsellers strip. */
export function featuredItems(categories: MenuCategory[]): MenuItem[] {
  return allItems(categories).filter((item) => item.featured);
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
