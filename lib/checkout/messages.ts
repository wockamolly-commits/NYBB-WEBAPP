import { formatPeso } from "@/lib/format";
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

    // The voucher refusals, in the order resolve_voucher (0065) checks them.
    //
    // All of them point at the code field, because in every case the move is
    // the same: take this code off and either use another or order without one.
    // None of them stops the order being placed, which is why not one of these
    // says anything like "your order failed".
    case "VOUCHER_NOT_FOUND":
      return {
        error: "We do not have a promo code by that name. Please check the spelling.",
        field: "voucher",
      };

    case "VOUCHER_INACTIVE":
      return {
        error: "That promo code is not running at the moment.",
        field: "voucher",
      };

    case "VOUCHER_NOT_STARTED":
      return {
        error: "That promo code has not started yet. It will work once the offer opens.",
        field: "voucher",
      };

    case "VOUCHER_EXPIRED":
      return { error: "That promo code has expired.", field: "voucher" };

    // Deliberately not "this is not your code", which reads as an accusation.
    // The likely reader is somebody who was sent a reward meant for another
    // account, and the useful half is that the order is fine without it.
    case "VOUCHER_NOT_YOURS":
      return {
        error:
          "That promo code is set aside for a particular customer, so we " +
          "cannot use it on this order.",
        field: "voucher",
      };

    case "VOUCHER_WRONG_BRANCH":
      return {
        error: "That promo code is not valid at the branch you are collecting from.",
        field: "voucher",
      };

    // Distinct from the minimum below, and the difference matters: this
    // customer needs to add a particular thing, not to spend more.
    case "VOUCHER_NO_ELIGIBLE_ITEMS":
      return {
        error: "That promo code only covers certain items, and none of them are in your order.",
        field: "voucher",
      };

    case "VOUCHER_BELOW_MINIMUM": {
      const minimum = Number(detail);
      return {
        error: Number.isFinite(minimum)
          ? `That promo code needs a qualifying order of at least ${formatPeso(minimum)}.`
          : "Your order is not large enough for that promo code yet.",
        field: "voucher",
      };
    }

    case "VOUCHER_EXHAUSTED":
      return {
        error: "That promo code has been fully claimed.",
        field: "voucher",
      };

    case "VOUCHER_CUSTOMER_LIMIT":
      return {
        error: "You have already used that promo code.",
        field: "voucher",
      };

    // A percentage small enough to round away on a cheap order. Saying "it
    // takes nothing off" is more honest than applying it for PHP 0.00.
    case "VOUCHER_NO_DISCOUNT":
      return {
        error: "That promo code takes nothing off an order this size.",
        field: "voucher",
      };

    // Only the preview raises this, and only because the menu moved while the
    // tab sat open. The cart screen is what names the change.
    case "VOUCHER_CART_CHANGED":
      return {
        error:
          "Something in your cart is not on the menu any more, so we cannot " +
          "price the code yet. Open the cart and it will show you what changed.",
        field: "cart",
      };

    // A discount so large the rail cannot take what is left. Better said here,
    // while the code can still be removed, than by a payment page that fails.
    case "VOUCHER_TOTAL_TOO_LOW":
      return {
        error:
          "That promo code leaves too little to pay online. Please add " +
          "something to the order, or take the code off and use it next time.",
        field: "voucher",
      };

    case "RATE_LIMITED":
      return {
        error:
          "That is several orders in quick succession from this number. " +
          "Please wait a minute before placing another.",
      };

    // Raised by the Server Action rather than by 0013, and it needs its own
    // wording because the identity is different. RATE_LIMITED above is the
    // customer's own number or account, so "you have ordered a lot" is a fair
    // thing to say. This one is a shared connection: an office, a mall, a
    // mobile carrier putting thousands of subscribers behind one address. The
    // person reading it may not have ordered anything at all today, so it must
    // not accuse them, it should name why it happened, and it has to leave a
    // way to order right now, because unlike the phone limit this can refuse
    // somebody who has done nothing wrong.
    case "RATE_LIMITED_ADDRESS":
      return {
        error:
          "There have been a lot of orders from this internet connection in " +
          "the last few minutes. On office or mall wifi that can be somebody " +
          "else nearby. Please wait a few minutes, or call the branch and " +
          "they will take this order now.",
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
