/**
 * The checkout boundary, as types only.
 *
 * Look at what an order request carries and, more importantly, at what it does
 * not. There is no price on a line, no subtotal, no total, and no discount.
 * The client names things (an item, a size, an option, a minute) and states how
 * many, and `place_order` resolves every peso from the price list the branch
 * points at. Spec section 22 item 4 puts it as a rule; this file is where the
 * rule is visible in the shape.
 *
 * Types live apart from `schema.ts` on purpose: the form imports these and
 * nothing else, so no validation code and no zod ever reaches the browser
 * bundle for the sake of a type that is erased at compile time.
 */

export type OrderLineInput = {
  itemSlug: string;
  variationSlug: string;
  quantity: number;
  /** Group and option, so an option slug is never ambiguous across groups. */
  options: { groupSlug: string; optionSlug: string }[];
};

/** What the customer types. Empty strings mean "not given", never null. */
export type CheckoutDetails = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

export type CheckoutPaymentMethod = "counter" | "qrph" | "gcash" | "maya" | "card";

export type PlaceOrderInput = {
  /**
   * A uuid minted once per checkout, in the browser, and sent again on every
   * retry. It is what makes a double-tapped button, or a Server Action replayed
   * by a flaky connection, produce one order rather than two.
   */
  attemptId: string;
  branchSlug: string | null;
  /** The `startsAt` of a window `get_pickup_slots` actually offered. */
  pickupSlotStart: string;
  details: CheckoutDetails;
  paymentMethod: CheckoutPaymentMethod;
  lines: OrderLineInput[];
};

export type PlacedOrder = {
  orderId: string;
  /** Quotable across a counter. Not a secret. */
  shortCode: string;
  /** Unguessable, and the only way a guest can look at this order again. */
  trackingToken: string;
  /** Proves at the counter that the collector is the customer. */
  pickupCode: string;
  status: string;
  paymentMethod: string;
  pickupSlotStart: string;
  pickupSlotEnd: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  branch: { slug: string; name: string; shortName: string; timezone: string };
};

/** Which field the screen should point at when an order is refused. */
export type CheckoutField = "name" | "phone" | "email" | "slot" | "cart";

export type PlaceOrderResult =
  | { ok: true; order: PlacedOrder }
  | {
      ok: false;
      error: string;
      field?: CheckoutField;
      /**
       * The windows on screen are stale and the screen should reload them
       * before the customer picks again. Distinct from a plain refusal: there
       * is nothing to correct in the form.
       */
      staleSlots?: true;
      /**
       * The same attempt id must not be sent again. Anything else is safe to
       * retry with it, which is the whole point of having one.
       */
      newAttempt?: true;
    };
