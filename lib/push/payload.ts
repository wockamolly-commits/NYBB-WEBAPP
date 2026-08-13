import { statusCopy } from "@/lib/orders/status";
import type { OrderStatus, TrackedOrder } from "@/lib/orders/types";

export type PushEvent = "ready" | "rejected" | "cancelled" | "staff_new_order";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[] | null;
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
  };
}
