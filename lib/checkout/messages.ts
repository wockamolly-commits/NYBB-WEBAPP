import type { CheckoutField } from "./types";

/**
 * What a refused order says to the person who placed it.
 *
 * `place_order` raises short machine codes (`SLOT_FULL`, `OPTION_COUNT:Flavour`)
 * because a database function has no business writing customer copy, and
 * because a message that changes wording must not break a caller. Turning them
 * into sentences is this file's whole job, and it is pure, so the wording is
 * unit tested rather than discovered in production.
 *
 * Two rules run through the copy. Every message says what the customer can do
 * next, because "Order failed" leaves somebody holding a phone with no move to
 * make. And nothing here blames them for a shop that shut, a window that filled
 * or a flavour that ran out between one screen and the next, because none of
 * that was theirs to control.
 */

export type CheckoutFailure = {
  error: string;
  field?: CheckoutField;
  staleSlots?: true;
  newAttempt?: true;
};

const UNEXPECTED =
  "Something went wrong placing the order and we are not sure what. " +
  "Nothing has been charged. Please try again, and if it keeps happening, " +
  "call the branch and they will take it over the phone.";

/**
 * Split `CODE:detail` into its two halves.
 *
 * Anything that is not one of ours (a connection reset, a Postgres error from
 * somewhere else entirely) has no colon-shaped meaning, so it falls through to
 * the generic message rather than being shown raw. A customer must never be
 * handed a stack trace or a table name.
 */
function parse(raw: string): { code: string; detail: string | null } {
  const trimmed = raw.trim();
  const at = trimmed.indexOf(":");
  if (at === -1) return { code: trimmed, detail: null };
  return { code: trimmed.slice(0, at), detail: trimmed.slice(at + 1).trim() || null };
}

export function checkoutFailure(raw: string): CheckoutFailure {
  const { code, detail } = parse(raw);

  switch (code) {
    // The state of this project today, and not a fault: no branch has been
    // chosen, so there is nothing to order from. The slot picker says the same
    // thing one panel to the left.
    case "NO_BRANCH":
      return {
        error:
          "Online ordering is not open at any branch yet. The branches page " +
          "has the phone numbers, and they can take this now.",
        field: "slot",
      };

    case "NOT_ACCEPTING":
      return {
        error:
          "The kitchen has paused new orders. Nothing has been placed. " +
          "Please try again shortly, or call the branch.",
        field: "slot",
        staleSlots: true,
      };

    case "STORE_CLOSED":
      return {
        error:
          "The branch has closed since this page loaded, so we cannot take " +
          "the order. Your cart is saved.",
        field: "slot",
        staleSlots: true,
      };

    case "MISSING_SLOT":
      return { error: "Please choose a pickup time.", field: "slot" };

    // Both of these mean the same thing to a customer: the list on screen is
    // out of date and they need a fresh one. Only the reason differs, and the
    // reason is ours, not theirs.
    case "SLOT_UNAVAILABLE":
      return {
        error:
          "That pickup time is no longer available. Here are the times that " +
          "are still open, please pick one of these.",
        field: "slot",
        staleSlots: true,
      };

    case "SLOT_FULL":
      return {
        error:
          "Somebody took the last place in that window while you were " +
          "checking out. Please choose another time.",
        field: "slot",
        staleSlots: true,
      };

    case "MISSING_NAME":
      return { error: "Please tell us who to hand the order to.", field: "name" };

    case "MISSING_PHONE":
      return {
        error: "Please give us a number in case the kitchen has a question.",
        field: "phone",
      };

    case "INVALID_PHONE":
      return {
        error: "That does not look like a phone number we could call. Please check it.",
        field: "phone",
      };

    case "INVALID_EMAIL":
      return {
        error: "That email address does not look right. Leave it blank if you would rather.",
        field: "email",
      };

    case "EMPTY_CART":
      return { error: "There is nothing in the cart to order.", field: "cart" };

    case "TOO_MANY_LINES":
      return {
        error:
          "That is more separate items than one order can hold. Please split " +
          "it into two, or call the branch for a large order.",
        field: "cart",
      };

    // The menu moved under a cart that had been sitting open. The cart screen
    // reconciles and names what changed, so send them there rather than trying
    // to explain it from here.
    case "ITEM_UNAVAILABLE":
    case "VARIATION_UNAVAILABLE":
    case "OPTION_UNAVAILABLE":
      return {
        error:
          "Something in your cart is not on the menu any more. Open the cart " +
          "and it will show you what changed.",
        field: "cart",
      };

    case "OPTION_COUNT":
      return {
        error: detail
          ? `One of your items needs a different choice under ${detail}. ` +
            "Open the cart and set it again."
          : "One of your items needs a choice it does not have. Open the cart and set it again.",
        field: "cart",
      };

    case "DUPLICATE_OPTION":
      return {
        error: "One of your items has the same choice on it twice. Open the cart and set it again.",
        field: "cart",
      };

    case "INVALID_QTY":
      return {
        error: detail
          ? `That is more ${detail} than one line can hold. Open the cart and lower it.`
          : "One of your lines has a quantity we cannot take. Open the cart and lower it.",
        field: "cart",
      };

    // A price the database cannot resolve is a bug on our side, and it must
    // never be presented as the customer's problem or, worse, charged as free.
    case "MISSING_PRICE":
      return {
        error:
          "We could not price one of the items in your cart, which is our " +
          "fault rather than yours. Please call the branch and they will take " +
          "this order.",
        field: "cart",
      };

    case "PAYMENT_METHOD_UNAVAILABLE":
      return {
        error: "That payment method is not available. Orders are paid at the counter on collection.",
      };

    case "VOUCHERS_DISABLED":
      return { error: "Promo codes are not running yet, so we have not applied one." };

    case "RATE_LIMITED":
      return {
        error:
          "That is several orders in quick succession from this number. " +
          "Please wait a minute before placing another.",
      };

    // The first request is still in flight. Retrying with the same attempt id
    // is exactly right, so this deliberately does not ask for a new one.
    case "CHECKOUT_ATTEMPT_INCOMPLETE":
      return { error: "Your order is still going through. Give it a moment before trying again." };

    case "CHECKOUT_ATTEMPT_REUSED":
    case "INVALID_ATTEMPT":
      return {
        error: "This checkout is no longer valid. Please try placing the order again.",
        newAttempt: true,
      };

    // Both collision paths mean the random draw lost several times running,
    // which is rare enough to be worth a plain retry rather than an
    // explanation nobody outside the codebase could follow.
    case "SHORT_CODE_COLLISION":
    case "PICKUP_CODE_COLLISION":
      return { error: "We could not open an order just then. Please try again.", newAttempt: true };

    default:
      return { error: UNEXPECTED };
  }
}
