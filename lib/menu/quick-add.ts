import { MIN_QUANTITY } from "@/lib/menu/line-pricing";
import type { CartLine } from "@/lib/cart/types";
import type { MenuItem } from "./types";

/**
 * Whether an item can go into the cart without opening its own page.
 *
 * Twenty-one of the thirty-one seeded items have one size and no options, so
 * for two thirds of the menu the product page is a detour: open it, look at
 * it, press one button.
 *
 * The test is on the shape of the data and never on a list of slugs. The menu
 * is owner-editable from Phase 4, so an item that grows a second size has to
 * stop being quick-addable the day it does rather than the day somebody
 * remembers to edit this file. It is the same rule ItemConfigurator uses to
 * decide its own layout.
 *
 * An optional group counts as a choice. Quietly adding wings with no heat
 * because heat was not compulsory is a wrong order arriving at a counter.
 */
export function canQuickAdd(item: MenuItem): boolean {
  return item.variations.length === 1 && item.optionGroups.length === 0;
}

export function quickAddLine(item: MenuItem): CartLine | null {
  if (!canQuickAdd(item)) return null;
  const variation = item.variations[0];
  if (!variation) return null;

  return {
    itemSlug: item.slug,
    variationSlug: variation.slug,
    optionSlugs: {},
    quantity: MIN_QUANTITY,
    // Display only, refreshed by resolveCart. With no options this is simply
    // the variation price, so unitPriceCents is not needed here.
    unitPriceCents: variation.priceCents,
  };
}
