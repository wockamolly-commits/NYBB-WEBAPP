import type { OrderStatus } from "./types";

/**
 * When the customer's tracking page makes a sound, decided apart from the
 * component that makes it so the rule can be read and tested on its own.
 */

/** The steps a customer can hear, which are coarser than the statuses. */
export type OrderSoundStage = "received" | "cooking" | "ready" | "collected" | "stopped";

export function soundStage(status: OrderStatus): OrderSoundStage {
  switch (status) {
    case "pending":
      return "received";
    // Accept and start are one tap on the board (spec section 13), so the
    // customer hears one step for both.
    case "accepted":
    case "preparing":
      return "cooking";
    case "ready":
      return "ready";
    case "claimed":
      return "collected";
    case "rejected":
    case "cancelled":
    case "no_show":
      return "stopped";
  }
}

/**
 * The one-shot sound for a step the page has just moved to, or null for none.
 *
 * Null for a page seeing an order for the first time: whatever it says is
 * already on screen, and a chime on every reload would teach somebody to mute
 * the tab. Null for "received", which is the page they just landed on after
 * paying. Ready is reported like any other step, but it is the alarm that
 * answers it, not a chime.
 */
export function stageToAnnounce(
  previous: OrderSoundStage | null,
  next: OrderSoundStage,
): OrderSoundStage | null {
  if (previous === null || previous === next) return null;
  if (next === "received") return null;
  return next;
}

export type ReadyAlarmOrder = {
  status: OrderStatus;
  readyAcknowledgedAt: string | null;
  readyRingAt: string | null;
  customerArrivedAt: string | null;
};

/**
 * Whether the ready alarm should be sounding, by the server's account.
 *
 * It rings for a ready order until the customer taps "I'm coming", and a ring
 * from the counter clears that tap in the database (0085), so a ring after the
 * tap starts it again with no extra rule here.
 *
 * "I'm here" also silences it. A customer standing at the counter has
 * obviously heard, and the only ring that should reach them after that is one
 * staff sent on purpose, later.
 */
export function shouldRingReady(order: ReadyAlarmOrder): boolean {
  if (order.status !== "ready") return false;
  if (order.readyAcknowledgedAt !== null) return false;
  if (order.customerArrivedAt === null) return true;
  return (
    order.readyRingAt !== null &&
    new Date(order.readyRingAt).getTime() > new Date(order.customerArrivedAt).getTime()
  );
}

/**
 * Names one ring, so a tap on this device can silence exactly that ring.
 *
 * The server's acknowledgement lands a round trip after the tap, and the
 * alarm has to stop the instant it is tapped. The page remembers which ring it
 * answered, and a new ring from the counter has a new name, which is what lets
 * it sound again even though this device answered the last one.
 */
export function ringKey(order: Pick<ReadyAlarmOrder, "readyRingAt">): string {
  return order.readyRingAt ?? "first";
}
