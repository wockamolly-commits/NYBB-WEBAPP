import { z } from "zod";
import { MAX_LINES } from "@/lib/cart/lines";
import { MAX_QUANTITY, MIN_QUANTITY } from "@/lib/menu/line-pricing";

/**
 * Validation at the checkout boundary, and the payload `place_order` reads.
 *
 * Two things are happening here and they are not the same thing. The zod parse
 * is a gate: it throws out a request that is not even shaped like an order,
 * before it reaches the database. The peso arithmetic and every question about
 * what is actually orderable stay in SQL, where a client cannot reach them.
 * Nothing in this file decides a price or grants permission, and nothing in it
 * should ever start to: a check that exists in both places is a check that will
 * disagree with itself.
 *
 * The limits repeated below are imported rather than retyped for exactly that
 * reason. `place_order` enforces its own copy of them, because a client-side
 * limit is a suggestion, and the SQL tests assert the two agree.
 */

/**
 * A uuid, strictly, per spec section 22 item 5.
 *
 * Version 1 to 5 with a correct variant nibble, which is what
 * `crypto.randomUUID()` produces and what a hand-rolled "id" almost never
 * does. The idempotency ledger is keyed on this, so accepting a loose string
 * would let a caller collide with somebody else's attempt on purpose.
 */
export const CHECKOUT_ATTEMPT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "not a slug");

export const orderLineSchema = z.object({
  itemSlug: slug,
  variationSlug: slug,
  quantity: z.number().int().min(MIN_QUANTITY).max(MAX_QUANTITY),
  options: z
    .array(z.object({ groupSlug: slug, optionSlug: slug }))
    .max(20),
});

export const placeOrderInputSchema = z.object({
  attemptId: z.string().regex(CHECKOUT_ATTEMPT_PATTERN, "not a checkout attempt"),
  branchSlug: slug.nullable(),
  // Only that it is a real instant. Whether it is a window this branch is
  // offering is a question about opening hours and remaining capacity, and
  // get_pickup_slots is the one place that answers it.
  pickupSlotStart: z.iso.datetime({ offset: true }),
  details: z.object({
    name: z.string().trim().min(1, "Please tell us who to hand the order to").max(120),
    phone: z.string().trim().min(1, "We need a number in case the kitchen has a question").max(40),
    email: z.string().trim().max(160),
    notes: z.string().trim().max(500),
  }),
  lines: z.array(orderLineSchema).min(1).max(MAX_LINES),
});

/**
 * What `place_order` hands back, parsed rather than trusted.
 *
 * The same discipline as the menu and slot readers: a shape that fails here is
 * a deployed function that has drifted from the code calling it, and finding
 * that out at the parse is much cheaper than finding it out from a customer
 * holding a pickup code that is undefined.
 */
export const placedOrderSchema = z.object({
  orderId: z.uuid(),
  shortCode: z.string().min(1),
  trackingToken: z.uuid(),
  pickupCode: z.string().regex(/^[0-9]{4}$/),
  status: z.string().min(1),
  paymentMethod: z.string().min(1),
  pickupSlotStart: z.string().min(1),
  pickupSlotEnd: z.string().min(1),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  branch: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1),
    timezone: z.string().min(1),
  }),
});

export type PlaceOrderPayload = {
  branch_slug: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  notes: string | null;
  payment_method: "counter";
  pickup_slot_start: string;
  lines: {
    item_slug: string;
    variation_slug: string;
    qty: number;
    options: { group_slug: string; option_slug: string }[];
  }[];
};

/**
 * The validated input, in the snake_case `place_order` reads.
 *
 * `payment_method` is pinned to counter here rather than taken from the
 * caller. Pay at the counter is the only rail the business is running, and
 * PayMongo stays dark behind its flag (spec section 17); the function refuses
 * anything else while the flag is off, and this makes sure the question is
 * never even asked.
 */
export function toPlaceOrderPayload(
  input: z.infer<typeof placeOrderInputSchema>,
): PlaceOrderPayload {
  return {
    branch_slug: input.branchSlug,
    customer_name: input.details.name,
    customer_phone: input.details.phone,
    customer_email: input.details.email === "" ? null : input.details.email,
    notes: input.details.notes === "" ? null : input.details.notes,
    payment_method: "counter",
    pickup_slot_start: input.pickupSlotStart,
    lines: input.lines.map((line) => ({
      item_slug: line.itemSlug,
      variation_slug: line.variationSlug,
      qty: line.quantity,
      options: line.options.map((option) => ({
        group_slug: option.groupSlug,
        option_slug: option.optionSlug,
      })),
    })),
  };
}
