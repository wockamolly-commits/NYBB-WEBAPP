import type { TrackedOrder } from "./types";

/**
 * Where an online payment stands, as far as a waiting screen needs to know.
 *
 * `paid` is the only answer that moves the customer on, and it is read from
 * the payment row that the PayMongo webhook writes. A return URL, a closed
 * simulation tab or a browser saying so never produces it.
 *
 * `closed` means there is nothing left to wait for and nothing paid either:
 * the payment failed or expired, or the order ended before it was paid. The
 * screen stops checking and says so rather than sending the customer anywhere.
 *
 * `waiting` is everything else, including an order paid at the counter, which
 * no online payment screen should ever be showing in the first place.
 */
export type PaymentState = "paid" | "waiting" | "closed";

export function paymentState(order: Pick<TrackedOrder, "status" | "payment">): PaymentState {
  const payment = order.payment;
  if (!payment || payment.method === "counter") return "waiting";
  // An order that ended is closed even when money arrived for it. That is a
  // payment made after the expiry sweep cancelled the order: it is owed back,
  // and telling the waiting screen "paid" sent the customer on to a tracker for
  // food nobody was going to cook.
  if (order.status === "cancelled" || order.status === "rejected") return "closed";
  if (payment.status === "paid") return "paid";
  if (payment.status === "pending" && order.status === "pending") return "waiting";
  return "closed";
}

/**
 * How close to its expiry an unpaid order may still start a payment.
 *
 * The sweep cancels an unpaid online order `expiryMinutes` after it was
 * placed. A QR code opened a minute before that can be paid a minute after,
 * when the order is already cancelled, and the money is then owed back by
 * hand. Refusing to open a payment in the last few minutes moves that case to
 * where it costs nothing: the customer places the order again.
 */
export const PAYMENT_START_MARGIN_MINUTES = 3;

export function paymentWindowClosing(
  placedAt: string,
  expiryMinutes: number,
  now: Date = new Date(),
): boolean {
  const placed = Date.parse(placedAt);
  if (!Number.isFinite(placed) || !Number.isFinite(expiryMinutes)) return false;
  const cutoff = placed + (expiryMinutes - PAYMENT_START_MARGIN_MINUTES) * 60_000;
  return now.getTime() >= cutoff;
}
