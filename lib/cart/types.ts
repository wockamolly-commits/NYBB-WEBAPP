import type { MenuItem, MenuOption, MenuOptionGroup, MenuVariation } from "@/lib/menu/types";

/**
 * The cart, as stored and as resolved.
 *
 * A stored line names things by slug and nothing else. It carries no product
 * name, no option names, no photograph: those all live in the menu, and a copy
 * of them in localStorage is a copy that goes stale the first time the owner
 * renames something. What a stored line does carry is `unitPriceCents`, and
 * that is a deliberate exception explained in `lines.ts`.
 */

export type CartLine = {
  itemSlug: string;
  variationSlug: string;
  /** Chosen option slugs, keyed by their group. Same shape as a LineSelection. */
  optionSlugs: Record<string, string[]>;
  quantity: number;
  /**
   * What one of this line cost when it was added. Display only, and refreshed
   * from the menu whenever the cart is resolved.
   *
   * The same column exists on `cart_items` for the same reason: a cart bar has
   * to show a total without loading the whole menu first. It is never the
   * price anybody is charged.
   */
  unitPriceCents: number;
};

export type Cart = {
  lines: CartLine[];
};

/** A stored line matched back to the menu it names. */
export type ResolvedLine = {
  /** `lineKey(line)`. Stable identity for React keys and for edits. */
  key: string;
  line: CartLine;
  item: MenuItem;
  /** Which category the item is in, for the link back to its page. */
  categorySlug: string;
  variation: MenuVariation;
  options: { group: MenuOptionGroup; option: MenuOption }[];
  /** Recomputed from the menu. Wins over the stored snapshot. */
  unitPriceCents: number;
  totalCents: number;
  /** The stored snapshot disagreed with the menu, so the price has moved. */
  repriced: boolean;
};

export type DropReason =
  /** The item is no longer on the menu. */
  | "item"
  /** The item is, but not in that size. */
  | "variation"
  /** One of the chosen options is gone, or the choices no longer satisfy a group. */
  | "option";

export type DroppedLine = {
  line: CartLine;
  /** The item's menu name, when the item itself still exists. */
  name: string | null;
  reason: DropReason;
};

export type ResolvedCart = {
  lines: ResolvedLine[];
  dropped: DroppedLine[];
  subtotalCents: number;
  /** Total pieces, which is what a cart badge counts. */
  quantity: number;
  /**
   * The cart as it should now be stored, or null when what is stored is
   * already right.
   *
   * Resolution is a read, so it does not write. Handing back a corrected cart
   * instead lets the one component that owns the storage decide to persist it,
   * and null means "nothing to do", which is what stops that write looping.
   */
  corrected: Cart | null;
};
