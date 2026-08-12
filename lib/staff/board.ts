import type { WorkspaceOrder } from "./order-types";

/**
 * What the orders board may offer a staff member, given one order.
 *
 * Pure, and separate from the card that renders it, because the interesting
 * part is a rule rather than a layout: under the payment-first ruling the New
 * column fills with orders that exist, are correct, and must not be cooked yet.
 * `staff_set_order_status` already refuses those (`PAYMENT_REQUIRED`, migration
 * 0018), so nothing here is a security control. It is the difference between a
 * board that explains itself and a board with a button that always fails.
 *
 * THE COUNTER RAIL IS STILL IN THE RULE, AND SHOULD STAY.
 * ================================================================
 * `payment_method` still accepts `counter`, and 0018 still captures a counter
 * payment on claim. The payment-first ruling removed that rail from customer
 * checkout, not from the schema, and a manual or phone order may yet reach the
 * board with it. Treating a counter order as unpayable would strand exactly the
 * orders a branch is most able to serve, so the rule below asks whether this
 * order is waiting on a provider, not whether it has been paid.
 */

export type BoardAction =
  /** Accept and begin. The Start button. */
  | { kind: "start" }
  /** Nothing to do yet. The customer has not paid. */
  | { kind: "awaiting_payment" }
  /** In the kitchen. The Ready button. */
  | { kind: "ready" }
  /** Ready for collection, and the pickup code decides. */
  | { kind: "claim" }
  /** Collected. Nothing further. */
  | { kind: "done" };

/**
 * True when a provider still owes us a confirmation.
 *
 * The PayMongo webhook is the only thing that writes `paid`, so this is a read
 * of that fact and never a judgement about it. A counter order is never waiting
 * on a provider, whatever its payment status says.
 */
export function awaitsPayment(order: WorkspaceOrder): boolean {
  if (!order.payment) return false;
  if (order.payment.method === "counter") return false;
  return order.payment.status !== "paid";
}

export function boardAction(order: WorkspaceOrder): BoardAction {
  switch (order.status) {
    case "pending":
    case "accepted":
      return awaitsPayment(order) ? { kind: "awaiting_payment" } : { kind: "start" };
    case "preparing":
      return { kind: "ready" };
    case "ready":
      return { kind: "claim" };
    case "claimed":
      return { kind: "done" };
  }
}

/**
 * What the card says about money, in the words a counter uses.
 *
 * Lifted out of the component so the wording is unit tested rather than
 * discovered during a lunch rush. "Awaiting payment" is deliberately not
 * "Unpaid": the customer may be holding a QR code at this very moment, and a
 * staff member reading "unpaid" is being invited to chase somebody who is
 * already paying.
 */
export function paymentLabel(order: WorkspaceOrder): string {
  if (!order.payment) return "No payment on this order";

  if (order.payment.method === "counter") {
    return order.payment.status === "paid" ? "Paid at counter" : "Collect at counter";
  }

  return order.payment.status === "paid" ? "Paid online" : "Awaiting payment";
}
