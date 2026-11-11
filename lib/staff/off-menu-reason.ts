import type { ManagedItem } from "./menu-types";

/**
 * Why an item that is off the menu is off, in a few words, when the database
 * can say so. Null when it cannot, and always null for an item that is on.
 *
 * The answer comes from `pricing_note`, which the 2026-09-07 menu import wrote
 * on every item it switched off because the only price it had was Foodpanda's
 * delivery price. That note is free text, so this matches the one sentence
 * the import used for exactly that case and nothing looser. A note that says
 * something else gives no reason rather than a guessed one.
 *
 * Only while the item is off, because nothing in the workspace edits the note.
 * Classic Hotdog Meal was switched on at 2026-10-26 with its note still saying
 * "Inactive until the owner confirms", so the note on its own is not evidence
 * of anything about the item now.
 */
const AWAITING_PRICE = "Inactive until the owner confirms";

export function offMenuReason(item: Pick<ManagedItem, "isActive" | "pricingNote">): string | null {
  if (item.isActive || !item.pricingNote) return null;
  return item.pricingNote.includes(AWAITING_PRICE) ? "Waiting for the owner to confirm a pickup price." : null;
}
