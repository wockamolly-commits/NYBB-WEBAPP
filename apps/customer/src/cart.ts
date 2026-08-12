import type { MenuItem } from "./api/types";
import type { PlaceOrderRequest } from "./api/types";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  selectedOptions,
  unitPreviewCents,
  type LineSelection,
} from "./menu/pricing";

/**
 * The cart, on the device.
 *
 * Cart contents are not sensitive and not authoritative, which is why they may
 * live here at all. What a line stores is what the order request will carry:
 * an item slug, a variation slug, option slugs and a quantity. The names and
 * the preview price are held alongside them so the cart screen can render
 * without the menu in hand, and they are labels. Only the slugs are sent.
 */

export type CartLine = {
  /** Identity for the list, and what makes two identical selections merge. */
  key: string;
  itemSlug: string;
  itemName: string;
  variationSlug: string;
  variationLabel: string;
  optionSlugs: Record<string, string[]>;
  /** For display. The server names the options again on the real order. */
  optionLabels: string[];
  quantity: number;
  /** Display only, and only until a real order exists. */
  unitPreviewCents: number;
};

/**
 * Two lines are the same line when they name the same food.
 *
 * The option slugs are sorted before they are joined, so picking a flavour and
 * then a heat produces the same key as picking them the other way round. A
 * cart that shows the same thing twice because of tap order is a cart people
 * stop trusting.
 */
export function cartLineKey(
  itemSlug: string,
  variationSlug: string,
  optionSlugs: Record<string, string[]>,
): string {
  const options = Object.entries(optionSlugs)
    .flatMap(([group, slugs]) => slugs.map((slug) => `${group}:${slug}`))
    .sort()
    .join("|");
  return `${itemSlug}/${variationSlug}/${options}`;
}

export function buildCartLine(item: MenuItem, selection: LineSelection): CartLine | null {
  const unit = unitPreviewCents(item, selection);
  const variation = item.variations.find((entry) => entry.slug === selection.variationSlug);
  if (unit === null || !variation) return null;

  return {
    key: cartLineKey(item.slug, selection.variationSlug, selection.optionSlugs),
    itemSlug: item.slug,
    itemName: item.name,
    variationSlug: variation.slug,
    variationLabel: variation.shortName,
    optionSlugs: selection.optionSlugs,
    optionLabels: selectedOptions(item, selection.optionSlugs).map(({ option }) => option.name),
    quantity: clampQuantity(selection.quantity),
    unitPreviewCents: unit,
  };
}

export function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), MIN_QUANTITY), MAX_QUANTITY);
}

export function addLine(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.find((entry) => entry.key === line.key);
  if (!existing) return [...cart, line];

  return cart.map((entry) =>
    entry.key === line.key
      ? { ...entry, quantity: clampQuantity(entry.quantity + line.quantity) }
      : entry,
  );
}

export function changeQuantity(cart: CartLine[], key: string, change: number): CartLine[] {
  return cart.flatMap((line) => {
    if (line.key !== key) return [line];
    const quantity = Math.trunc(line.quantity + change);
    return quantity >= MIN_QUANTITY ? [{ ...line, quantity: clampQuantity(quantity) }] : [];
  });
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((count, line) => count + line.quantity, 0);
}

/**
 * What the cart looks like it will cost.
 *
 * "Looks like" is the whole caveat. It is the sum of preview unit prices, it
 * does not know about a discount the server may apply, and every screen showing
 * it says so. The order confirmation replaces it with the server's own total.
 */
export function previewSubtotalCents(cart: CartLine[]): number {
  return cart.reduce((total, line) => total + line.unitPreviewCents * line.quantity, 0);
}

/** The cart as order lines: slugs and counts, and nothing else. */
export function toOrderLines(cart: CartLine[]): PlaceOrderRequest["lines"] {
  return cart.map((line) => ({
    itemSlug: line.itemSlug,
    variationSlug: line.variationSlug,
    quantity: line.quantity,
    options: Object.entries(line.optionSlugs).flatMap(([groupSlug, slugs]) =>
      slugs.map((optionSlug) => ({ groupSlug, optionSlug })),
    ),
  }));
}
