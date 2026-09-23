import { statusCopy } from "@/lib/orders/status";
import type { OrderStatus, TrackedOrder } from "@/lib/orders/types";

export type PushAudience = "customer" | "staff";

/**
 * What a notification is about, which is not the same question as who it is
 * for.
 *
 * `public/sw.js` keys its unreadable-payload fallback on the audience, and the
 * customer entry reads "Your order has an update". A promo is also addressed
 * to a customer, so without this it would inherit that sentence and send
 * somebody hunting for an order they never placed. The worker reads this to
 * pick the right words; it does not decide who is written to, which stays the
 * business of `audience` and the `push_subscriptions.audience` column it
 * matches.
 */
export type PushKind = "order" | "promo";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[] | null;
  /**
   * Who this is for, so `public/sw.js` can pick the right words when it cannot
   * parse the rest of the payload. One worker serves scope "/" and therefore
   * both audiences, and its fallback used to tell a customer to open the
   * orders board.
   */
  audience: PushAudience;
  /**
   * Optional so that a notification already in flight during the deploy that
   * adds this still parses. `public/sw.js` reads a missing kind as "order",
   * which is what every payload written before this field meant.
   */
  kind?: PushKind;
};

export type CustomerPayloadOrder = {
  shortCode: string;
  trackingToken: string;
  status: OrderStatus;
  timeline: TrackedOrder["timeline"];
  payment: TrackedOrder["payment"];
};

export type StaffPayloadOrder = {
  shortCode: string;
  branchShortName: string;
  itemCount: number;
  pickupStartsAt: string | null;
};

/**
 * The customer's notification, in the tracking screen's own words.
 *
 * `statusCopy()` already decides what every status says, including the branch's
 * chosen refusal reason and the three different ways an order can be cancelled.
 * Writing a second sentence here would put two voices in front of one customer,
 * and they would drift the first time somebody edited one of them. This project
 * already refuses that for money; the same argument applies to a message that
 * lands on a stranger's lock screen.
 */
export function customerPayload(order: CustomerPayloadOrder): PushPayload {
  const copy = statusCopy(order);
  const isReady = order.status === "ready";

  return {
    title: copy.title,
    body: copy.body,
    url: `/order/${order.shortCode}?t=${order.trackingToken}`,
    // The short code, so a second notification about one order replaces the
    // first rather than stacking under it.
    tag: order.shortCode,
    // Ready is the only one the customer has to act on. Everything else is
    // information, and information that survives a swipe is a nuisance.
    requireInteraction: isReady,
    renotify: isReady,
    vibrate: isReady ? [120, 60, 120] : null,
    audience: "customer",
    kind: "order",
  };
}

/**
 * The counter's notification.
 *
 * Deliberately not routed through `statusCopy()`: that writes to a customer
 * standing in a car park, and this is read by somebody behind a counter who
 * needs the code, the size and the window rather than reassurance.
 */
export function staffPayload(order: StaffPayloadOrder): PushPayload {
  const items = order.itemCount === 1 ? "1 item" : `${order.itemCount} items`;
  const window = order.pickupStartsAt
    ? new Date(order.pickupStartsAt).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
    : null;

  return {
    title: `New order ${order.shortCode}`,
    body: window
      ? `${items}, pickup ${window}, ${order.branchShortName}`
      : `${items}, ${order.branchShortName}`,
    url: "/workspace/orders",
    tag: order.shortCode,
    requireInteraction: true,
    renotify: true,
    vibrate: [200, 100, 200],
    audience: "staff",
    kind: "order",
  };
}

export type PromoPayloadInput = {
  code: string;
  description: string | null;
  /** The sentence the promos page shows, already built from the voucher row. */
  sentence: string;
};

/**
 * The promo notification.
 *
 * ROUTED THROUGH THE SAME SENTENCE THE PAGE SHOWS, for the reason
 * `customerPayload` gives about `statusCopy`: two descriptions of one promo
 * would be two voices, and they would drift the first time somebody edited
 * one of them. The caller builds `sentence` with `promoSentence`, so what
 * lands on a lock screen is what the promos page says when it is opened.
 *
 * QUIET BY CONSTRUCTION. `requireInteraction` false, no vibration, no
 * renotify. An order being ready is something the customer has to act on and
 * is allowed to buzz a pocket; an advert is not, and a marketing message that
 * survives a swipe is the fastest way to lose the permission it was sent
 * under.
 */
export function promoPayload(promo: PromoPayloadInput): PushPayload {
  return {
    title: `New promo at NYBB: ${promo.code}`,
    // The owner's own words when they wrote some, because a description is
    // written for the customer and the generated sentence is written for
    // correctness. Both are true; the human one reads better on a phone.
    body: promo.description ?? promo.sentence,
    url: "/promos",
    // Prefixed and per code, so a promo never replaces an order notification
    // on the lock screen. `tag` is a plain string shared across both kinds,
    // and a bare code could collide with a short_code.
    tag: `promo-${promo.code}`,
    requireInteraction: false,
    renotify: false,
    vibrate: null,
    audience: "customer",
    kind: "promo",
  };
}
