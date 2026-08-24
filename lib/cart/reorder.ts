import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  selectionProblem,
  unitPriceCents,
} from "@/lib/menu/line-pricing";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";
import type { CartLine } from "./types";

/**
 * Turning a past order back into cart lines.
 *
 * WHY THIS MATCHES ON NAMES AND NOT ON IDS.
 * ================================================================
 * Order rows carry real foreign keys to menu_items, item_variations and
 * menu_options, and none of them are reachable from a customer session. The
 * menu tables are staff only under RLS, the storefront reads the menu through
 * the get_storefront_menu security definer function, and the menu shape that
 * reaches the browser carries slugs but no ids. A guest cannot read order_items
 * at all, because that policy requires orders.user_id = auth.uid().
 *
 * Closing any of those needs a new database function, and migrations are
 * frozen at 0050. The *_snapshot columns are on both paths today, so the
 * snapshots are what this matches.
 *
 * The cost is renames, and the cost is paid safely. A renamed item stops
 * matching and is reported as unavailable, which is a case this feature has to
 * handle anyway for withdrawn items. It never yields the wrong food, and that
 * is the only property worth protecting here: a fuzzy match across nine
 * similarly named wing flavours would sell somebody the wrong order.
 */

/** One line of a past order, in the shape both sources can produce. */
export type PastOrderLine = {
  /** `order_items.item_name_snapshot`. */
  name: string;
  /** `order_items.variation_label_snapshot`. */
  variationLabel: string;
  quantity: number;
  /** `order_item_options`, group name then option name. */
  options: { group: string; name: string }[];
};

export type SkipReason =
  /** The item is not on the menu under that name. */
  | "item"
  /** The item is, but not in that size. */
  | "variation"
  /** An option is gone, or what is left no longer satisfies a required group. */
  | "option"
  /**
   * The cart was already at its line limit, so this line could not be added.
   *
   * This module never produces this value: rebuildCartLines matches lines
   * against the menu and knows nothing about the cart they are headed into.
   * It is emitted by the client component that calls addToCart line by line,
   * after addToCart refuses one because the cart is already at MAX_LINES. It
   * lives here anyway because SkipReason is the shared vocabulary of the skip
   * report, and describeSkip has to render this case too.
   */
  | "cart-full";

export type SkippedLine = {
  name: string;
  variationLabel: string;
  reason: SkipReason;
};

export type ReorderResult = {
  lines: CartLine[];
  skipped: SkippedLine[];
};

/** Trimmed and case folded. Neither is a menu change. */
function same(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function findItem(categories: MenuCategory[], name: string): MenuItem | null {
  for (const category of categories) {
    for (const item of category.items) {
      if (same(item.name, name)) return item;
    }
  }
  return null;
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return MIN_QUANTITY;
  return Math.min(Math.max(Math.trunc(quantity), MIN_QUANTITY), MAX_QUANTITY);
}

export function rebuildCartLines(
  categories: MenuCategory[],
  past: PastOrderLine[],
): ReorderResult {
  const lines: CartLine[] = [];
  const skipped: SkippedLine[] = [];

  for (const line of past) {
    const skip = (reason: SkipReason) => {
      skipped.push({ name: line.name, variationLabel: line.variationLabel, reason });
    };

    const item = findItem(categories, line.name);
    if (!item) {
      skip("item");
      continue;
    }

    const variation = item.variations.find((candidate) =>
      same(candidate.name, line.variationLabel),
    );
    if (!variation) {
      skip("variation");
      continue;
    }

    const optionSlugs: Record<string, string[]> = {};
    let optionMissing = false;
    for (const saved of line.options) {
      const group = item.optionGroups.find((candidate) => same(candidate.name, saved.group));
      const option = group?.options.find((candidate) => same(candidate.name, saved.name));
      if (!group || !option) {
        optionMissing = true;
        break;
      }
      optionSlugs[group.slug] = [...(optionSlugs[group.slug] ?? []), option.slug];
    }
    if (optionMissing) {
      skip("option");
      continue;
    }

    // The variation is known good by here, which matters: selectionProblem
    // returns null early when it cannot find one, so asking it first would
    // report a missing size as a valid selection.
    const selection = { variationSlug: variation.slug, optionSlugs };
    if (selectionProblem(item, selection) !== null) {
      // A required group is now unsatisfied. This is the wings case: the
      // flavour that was ordered has left the menu, and wings without a
      // flavour are not a thing anybody can collect.
      skip("option");
      continue;
    }

    lines.push({
      itemSlug: item.slug,
      variationSlug: variation.slug,
      optionSlugs,
      quantity: clampQuantity(line.quantity),
      // Today's price, from today's menu. Display only either way: resolveCart
      // refreshes it, and place_order is the only thing that prices an order.
      unitPriceCents: unitPriceCents(item, selection),
    });
  }

  return { lines, skipped };
}
