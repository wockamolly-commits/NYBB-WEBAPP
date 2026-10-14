/**
 * The floating delivery card: its words, its link, and when it stays hidden.
 *
 * WHY THIS SITE MENTIONS DELIVERY AT ALL. This storefront is pickup only, and
 * that has not changed: nothing here takes a delivery order. Delivery is
 * Tablevibe's, and this card is a signpost to it, the same floating card the
 * old WordPress site carried. Decided 2026-10-14; see decision D1 in
 * docs/IMPLEMENTATION-PROMPT.md for the amendment.
 *
 * THE OFFER LINES ARE ONE SWITCH. The free delivery wording was confirmed as
 * running on 2026-10-14. When it ends, set FREE_DELIVERY_OFFER to false and
 * the card falls back to the general lines below. Nothing else changes.
 *
 * Kept out of the component so the page rules can be tested in plain Node,
 * the same reason lib/site/reveal.ts exists.
 */

export const TABLEVIBE_URL = "https://buffalobrads.tablevibe.co/";

export const FREE_DELIVERY_OFFER = true;

export const DELIVERY_CARD_COPY = FREE_DELIVERY_OFFER
  ? {
      headline: "Get FREE DELIVERY on your first order!",
      line: "Order directly from us here 👇",
    }
  : {
      headline: "Wings, delivered.",
      line: "Order delivery directly from us here 👇",
    };

/**
 * Pages where the card never appears. The cart and checkout are the middle
 * of a pickup order, where a second way to order is a distraction from the
 * one in progress, and the order pages are somebody waiting on food already
 * bought. Matched as a path prefix.
 */
const HIDDEN_ON = ["/cart", "/checkout", "/order"] as const;

export function deliveryCardAllowedOn(pathname: string): boolean {
  return !HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
