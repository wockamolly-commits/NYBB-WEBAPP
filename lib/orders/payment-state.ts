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
  if (payment.status === "paid") return "paid";
  if (payment.status === "pending" && order.status === "pending") return "waiting";
  return "closed";
}
