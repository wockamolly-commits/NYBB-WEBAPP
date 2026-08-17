export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[] | null;
};

export type StaffPayloadOrder = {
  shortCode: string;
  branchShortName: string;
  itemCount: number;
  pickupStartsAt: string | null;
};

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
