import { z } from "zod";

/**
 * The tracking link, and the two values that make one.
 *
 * The URL is a bearer credential: whoever holds it can read a customer's name,
 * phone number and the four digit code that claims their food. That is a
 * deliberate trade, and it is the only way a guest who never signed in can
 * look at their own order. What it buys has to be paid for in three places:
 *
 *   1. The page is `noindex`, so a link pasted somewhere public does not end
 *      up in a search result.
 *   2. `Referrer-Policy: strict-origin-when-cross-origin` in `next.config.ts`
 *      means the query string is never sent to another host, so a tap on an
 *      outbound link cannot hand the token to somebody else's access log.
 *   3. Nothing logs the token. It never goes into a console line, an error
 *      message or an analytics event.
 *
 * The token stays in the query string rather than the path so it is obviously
 * a credential rather than part of the order's identity, and so a customer who
 * reads the short code off a screenshot can still reach the page and be asked
 * for the rest.
 */

export const TRACKING_TOKEN_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** The query key. Short, because this URL is read off phone screens. */
export const TRACKING_TOKEN_PARAM = "t";
export const ORDER_TRACKING_EVENT = "status_changed";
const ORDER_TRACKING_TOPIC_PREFIX = "order-tracking:";

/** "NY-" plus six characters from the alphabet in `generate_short_code`. */
export const SHORT_CODE_PATTERN = /^NY-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/;

/**
 * A token from a URL, or null.
 *
 * Null rather than a thrown error, and rather than passing the raw value
 * through. The database gives a wrong token and a nonexistent order the same
 * answer on purpose, so a malformed one has to reach that same answer instead
 * of failing differently and telling an attacker they got the shape right.
 */
export function normalizeTrackingToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return TRACKING_TOKEN_PATTERN.test(normalized) ? normalized : null;
}

export function orderTrackingTopic(trackingToken: unknown): string | null {
  const token = normalizeTrackingToken(trackingToken);
  return token ? `${ORDER_TRACKING_TOPIC_PREFIX}${token}` : null;
}

/** A short code from a URL, upper-cased, or null. */
export function normalizeShortCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return SHORT_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function orderTrackingHref(
  shortCode: string,
  trackingToken?: string | null,
): string {
  const path = `/order/${encodeURIComponent(shortCode.trim().toUpperCase())}`;
  const token = normalizeTrackingToken(trackingToken);
  return token ? `${path}?${TRACKING_TOKEN_PARAM}=${token}` : path;
}

const optionSchema = z.object({
  group: z.string().min(1),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  heatPercent: z.number().int().nullable(),
});

const itemSchema = z.object({
  name: z.string().min(1),
  variationLabel: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  lineTotalCents: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  options: z.array(optionSchema),
});

/**
 * What `get_order_by_tracking` returns, parsed rather than trusted.
 *
 * Same discipline as the menu and slot readers. A shape that fails here is a
 * deployed function that has drifted from the code reading it, and a parse
 * error in a log is much cheaper than a customer at a counter holding a screen
 * that says undefined.
 */
export const trackedOrderSchema = z.object({
  shortCode: z.string().min(1),
  status: z.enum([
    "pending",
    "accepted",
    "preparing",
    "ready",
    "claimed",
    "rejected",
    "cancelled",
    "no_show",
  ]),
  placedAt: z.string().min(1),
  pickupCode: z.string().regex(/^[0-9]{4}$/),
  pickup: z
    .object({ startsAt: z.string().min(1), endsAt: z.string().min(1) })
    .nullable(),
  branch: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    shortName: z.string().min(1),
    timezone: z.string().min(1),
    addressLine: z.string().min(1),
    city: z.string().min(1),
    phones: z.array(z.string()),
  }),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().nullable(),
  }),
  items: z.array(itemSchema),
  subtotalCents: z.number().int().nonnegative(),
  discountCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  notes: z.string().nullable(),
  payment: z
    .object({
      method: z.string().min(1),
      status: z.string().min(1),
      amountCents: z.number().int().nonnegative(),
      paidAt: z.string().nullable(),
    })
    .nullable(),
  timeline: z.object({
    acceptedAt: z.string().nullable(),
    preparingAt: z.string().nullable(),
    readyAt: z.string().nullable(),
    claimedAt: z.string().nullable(),
    rejectedAt: z.string().nullable(),
    rejectedReason: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    cancelledReason: z.string().nullable(),
    customerArrivedAt: z.string().nullable(),
    noShowAt: z.string().nullable(),
  }),
});
