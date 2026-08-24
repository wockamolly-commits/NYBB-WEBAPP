/**
 * What the product screen says beneath its Add to cart button.
 *
 * Lifted out of the component so the sentence is a tested value rather than a
 * literal typed into JSX. The literal it replaces read "Checkout opens once
 * pickup times are published", unconditionally, on the one screen where a
 * customer commits to an order. /menu had the same bug and it was fixed there
 * with a comment recording why: the sentence was true on the day it was typed
 * and false in whichever environment did not match it.
 */
export type OrderingCopy = {
  canOrder: boolean;
  message: string;
};

export function orderingCopy(canOrder: boolean): OrderingCopy {
  return {
    canOrder,
    message: canOrder
      ? "Add what you want, then choose a pickup window at checkout."
      : "Online ordering is not open on this site yet, so call the counter you want to collect from.",
  };
}
