import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  findVariation,
  selectedOptions,
  selectionProblem,
  unitPriceCents,
} from "@/lib/menu/line-pricing";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";
import type { Cart, CartLine, DroppedLine, ResolvedCart, ResolvedLine } from "./types";

/**
 * Everything the cart does to its own lines, with no browser and no React in
 * sight so it can all be tested directly.
 *
 * The one rule this file exists to keep: **it does not add money up.** Every
 * peso here comes out of `lib/menu/line-pricing.ts`, which is the display side
 * of what `place_order` will do in Postgres. A cart total that is computed a
 * second way is a cart total that disagrees with the order, and the customer
 * finds out at the counter.
 *
 * What the cart does own is *identity*: deciding that two configured lines are
 * the same line and should merge rather than stack up as duplicates.
 */

/**
 * The cart's own ceiling on how many distinct lines it will hold.
 *
 * It matches `customer_carts_lines_bounded` in migration 0004, because this
 * cart syncs into that column once customers can sign in, and a cart that
 * cannot be stored is worse than one that refused the fiftieth line.
 */
export const MAX_LINES = 50;

/**
 * A stable identity for a configured line.
 *
 * Sorted, so that the same wings configured in a different order are the same
 * line: the customer picked hot and then buffalo, the menu lists buffalo and
 * then hot, and neither of those is a different order of wings. Groups with no
 * selection are omitted so an empty group and an absent one also agree.
 */
export function lineKey(
  line: Pick<CartLine, "itemSlug" | "variationSlug" | "optionSlugs">,
): string {
  const options = Object.keys(line.optionSlugs)
    .filter((group) => (line.optionSlugs[group] ?? []).length > 0)
    .sort()
    .map((group) => `${group}=${[...line.optionSlugs[group]].sort().join(",")}`)
    .join(";");

  return `${line.itemSlug}|${line.variationSlug}|${options}`;
}

export function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return MIN_QUANTITY;
  return Math.min(Math.max(Math.trunc(quantity), MIN_QUANTITY), MAX_QUANTITY);
}

/** Total pieces across every line. What a cart badge counts. */
export function cartQuantity(cart: Cart): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

/**
 * The total from the stored snapshots, for the cart bar.
 *
 * The bar is on every page and the menu is not, so this is the one total that
 * is allowed to be a snapshot. `resolveCart` is the corrected version, and the
 * cart page runs it on arrival, so a stale figure here survives exactly as
 * long as it takes the customer to open the cart.
 */
export function snapshotTotalCents(cart: Cart): number {
  return cart.lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}

export type AddResult =
  | { ok: true; cart: Cart }
  /** The cart is at MAX_LINES and this would have been a new one. */
  | { ok: false; reason: "full" };

/**
 * Add a configured line, merging it into an identical one if there is one.
 *
 * Merging is what stops "two half orders of Classic Buffalo, no heat" from
 * arriving in the kitchen as two tickets. The merged quantity is clamped, so
 * adding ten to an existing fifteen lands on the ceiling rather than being
 * refused outright: the customer asked for more wings and got as many as one
 * line can hold.
 */
export function addLine(cart: Cart, line: CartLine): AddResult {
  const key = lineKey(line);
  const existing = cart.lines.findIndex((candidate) => lineKey(candidate) === key);

  if (existing === -1) {
    if (cart.lines.length >= MAX_LINES) return { ok: false, reason: "full" };
    return {
      ok: true,
      cart: { lines: [...cart.lines, { ...line, quantity: clampQuantity(line.quantity) }] },
    };
  }

  return {
    ok: true,
    cart: {
      lines: cart.lines.map((candidate, index) =>
        index === existing
          ? {
              ...candidate,
              quantity: clampQuantity(candidate.quantity + line.quantity),
              // The newer price wins. Both came from line-pricing against the
              // menu the customer was looking at, and the later one was read
              // more recently.
              unitPriceCents: line.unitPriceCents,
            }
          : candidate,
      ),
    },
  };
}

export function setLineQuantity(cart: Cart, key: string, quantity: number): Cart {
  return {
    lines: cart.lines.map((line) =>
      lineKey(line) === key ? { ...line, quantity: clampQuantity(quantity) } : line,
    ),
  };
}

export function removeLine(cart: Cart, key: string): Cart {
  return { lines: cart.lines.filter((line) => lineKey(line) !== key) };
}

export const emptyCart: Cart = { lines: [] };

/** Every item on the menu, with the category it was found in. */
function itemIndex(categories: MenuCategory[]): Map<string, { item: MenuItem; categorySlug: string }> {
  const index = new Map<string, { item: MenuItem; categorySlug: string }>();
  for (const category of categories) {
    for (const item of category.items) {
      index.set(item.slug, { item, categorySlug: category.slug });
    }
  }
  return index;
}

/**
 * Match a stored cart back to the menu, and price it.
 *
 * A cart outlives the menu it was built from. It sits in localStorage for
 * days, and in the meantime the owner can rename an item, retire a size or
 * take a flavour off. So every stored line is checked against the live menu
 * rather than trusted, and a line that no longer describes something orderable
 * is dropped and *reported*, because a cart that quietly shrinks between one
 * visit and the next reads as the site losing the order.
 */
export function resolveCart(categories: MenuCategory[], cart: Cart): ResolvedCart {
  const index = itemIndex(categories);
  const lines: ResolvedLine[] = [];
  const dropped: DroppedLine[] = [];
  let changed = false;

  for (const line of cart.lines) {
    const found = index.get(line.itemSlug);
    if (!found) {
      dropped.push({ line, name: null, reason: "item" });
      changed = true;
      continue;
    }

    const { item, categorySlug } = found;
    const variation = findVariation(item, line.variationSlug);
    if (!variation) {
      dropped.push({ line, name: item.name, reason: "variation" });
      changed = true;
      continue;
    }

    // selectedOptions skips anything the menu no longer offers, so a shorter
    // result than the line asked for means an option has gone. selectionProblem
    // then catches the subtler case: every option still exists, but the groups
    // have changed underneath and the line no longer satisfies them.
    const asked = Object.values(line.optionSlugs).flat().length;
    const options = selectedOptions(item, line.optionSlugs);
    const selection = { variationSlug: line.variationSlug, optionSlugs: line.optionSlugs };

    if (options.length !== asked || selectionProblem(item, selection)) {
      dropped.push({ line, name: item.name, reason: "option" });
      changed = true;
      continue;
    }

    const quantity = clampQuantity(line.quantity);
    const unit = unitPriceCents(item, selection);
    const repriced = unit !== line.unitPriceCents;
    if (repriced || quantity !== line.quantity) changed = true;

    lines.push({
      key: lineKey(line),
      line: { ...line, quantity, unitPriceCents: unit },
      item,
      categorySlug,
      variation,
      options,
      unitPriceCents: unit,
      totalCents: unit * quantity,
      repriced,
    });
  }

  return {
    lines,
    dropped,
    subtotalCents: lines.reduce((total, line) => total + line.totalCents, 0),
    quantity: lines.reduce((total, line) => total + line.line.quantity, 0),
    corrected: changed ? { lines: lines.map((line) => line.line) } : null,
  };
}

/** The item's page, opened on the flavour this line chose. */
export function lineHref(line: ResolvedLine): string {
  const base = `/menu/${line.categorySlug}/${line.item.slug}`;
  const visual = line.options.find(({ option }) => option.image);
  return visual ? `${base}?flavour=${encodeURIComponent(visual.option.slug)}` : base;
}

export { MAX_QUANTITY, MIN_QUANTITY };
