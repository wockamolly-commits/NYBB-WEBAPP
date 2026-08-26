import type { ManagedItem } from "@/lib/staff/menu-types";

/**
 * One size, as the item editor holds it while it is being edited, and the
 * pure functions that seed and read a list of them.
 *
 * Split out of ItemEditor.tsx under ruling R25. The state itself stays in
 * ItemEditor, because the payload and the pre-submit gate both need it; only
 * the shape, the seeding and the row rendering live outside.
 */

/**
 * The largest price staff_save_menu_item accepts, in centavos. PHP 100,000.
 * Named here so the form can refuse it with a sentence about the price
 * instead of round tripping and coming back with a generic failure.
 */
export const MAX_PRICE_CENTS = 10_000_000;

/**
 * `key` is this row's identity inside React and has nothing to do with the
 * database. `id` is the saved row's id, empty for a size that has never been
 * saved, and it is what tells removal's two cases apart.
 *
 * `wasActive` is the state the row arrived in, kept only so a removed row can
 * say the right thing: a row the person just took off says "Removed", and a
 * row that was already off when the page loaded says so plainly instead of
 * pretending this visit did it.
 *
 * There is deliberately no isDefault here. The default is one value for the
 * whole list, held once in ItemEditor's `defaultKey`, because "exactly one"
 * is a property of the list and a flag per row can hold zero of them or five.
 */
export type SizeDraft = {
  key: string;
  id: string;
  label: string;
  shortLabel: string;
  pesos: string;
  isActive: boolean;
  wasActive: boolean;
};

export function blankSize(key: string): SizeDraft {
  return { key, id: "", label: "", shortLabel: "", pesos: "", isActive: true, wasActive: true };
}

/** cents -> the string a pesos input should show. Empty for a price of nothing. */
export function centsToPesosInput(cents: number): string {
  if (!cents || cents <= 0) return "";
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/**
 * The one place pesos, what the owner types, becomes centavos, what the
 * database stores. Every price on the item screen passes through here, and
 * nothing else there multiplies or divides a money value.
 *
 * A blank or unparsable input is 0, not an error. A free size is a real thing
 * and the RPC accepts 0, so there is nothing to refuse here. A price above
 * MAX_PRICE_CENTS is refused, but by the form's gate, which can point at the
 * field, rather than silently here.
 */
export function pesosToCents(pesos: string): number {
  const value = Number.parseFloat(pesos);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

/** The saved sizes as draft rows, or one blank row for an item that has none. */
export function sizesFrom(item: ManagedItem | null): SizeDraft[] {
  if (!item || item.variations.length === 0) return [blankSize("new-0")];
  return item.variations.map((variation) => ({
    key: variation.id,
    id: variation.id,
    label: variation.label,
    shortLabel: variation.shortLabel,
    pesos: centsToPesosInput(variation.priceCents),
    isActive: variation.isActive,
    wasActive: variation.isActive,
  }));
}

/**
 * Which row the default radio starts on. An inactive saved default is not
 * chosen here, because the server only counts active elements and the form
 * has to start in a state it would accept.
 */
export function defaultKeyFrom(item: ManagedItem | null): string {
  const chosen =
    item?.variations.find((variation) => variation.isDefault && variation.isActive) ??
    item?.variations.find((variation) => variation.isActive);
  return chosen?.id ?? "";
}

/**
 * Which saved sizes exist, as one string.
 *
 * Its only job is to notice that the set of saved rows changed underneath the
 * form. See the re-seed in ItemEditor.
 */
export function variationSignature(item: ManagedItem | null): string {
  return (item?.variations ?? []).map((variation) => variation.id).join(",");
}

/**
 * What to call one size in an accessible name.
 *
 * Every row carries a "Default", a "Remove" and an "Undo", and nothing but
 * position distinguishes them on screen. Choosing the wrong default silently
 * changes which size the storefront item page opens on, so the name of the
 * size has to be in each control's accessible name. Falls back to the row's
 * position while a new row is still blank.
 */
export function sizeName(size: SizeDraft, index: number): string {
  return size.label.trim() || size.shortLabel.trim() || `size ${index + 1}`;
}
