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
  /**
   * The money went back before the order finished. Nothing to cook or hand
   * over; the only sensible step left is to refuse it, which the card offers
   * below every live order anyway.
   */
  | { kind: "refunded" }
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
  if (order.status !== "claimed" && order.payment?.status === "refunded") return { kind: "refunded" };
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
 *
 * WHY `settled` EXISTS.
 * ================================================================
 * History had its own copy of this function, under the same name, and its
 * unpaid branch returned the raw row: "paymongo - awaiting_payment". Two
 * functions called paymentLabel, one of them writing database enums onto a
 * manager's screen. There is now one, and the flag is the single real
 * difference between the two callers. A live order that is not paid is still
 * being paid; a closed one never will be, and telling a manager reading last
 * Tuesday to wait for a QR code is the same lie in the other direction.
 */
export function describePayment(
  payment: { method: string; status: string } | null,
  { settled = false }: { settled?: boolean } = {},
): string {
  if (!payment) return "No payment on this order";

  if (payment.method === "counter") {
    if (payment.status === "paid") return "Paid at counter";
    return settled ? "Never paid at the counter" : "Collect at counter";
  }

  if (payment.status === "paid") return "Paid online";
  return settled ? "Never paid" : "Awaiting payment";
}

export function paymentLabel(order: WorkspaceOrder): string {
  return describePayment(order.payment);
}

/**
 * How a live order stands against its pickup time, for the card's chip.
 *
 * Spec section 13: "Orders past their slot time turn amber, then red." Amber
 * from the moment the pickup time passes, red once it is LATE_AFTER_MINUTES
 * past, which is one standard window. Null for an order with no pickup time or
 * one that has already been collected, because there is nothing to chase.
 */
export const LATE_AFTER_MINUTES = 15;

export type PickupUrgency =
  | { kind: "upcoming"; minutes: number }
  | { kind: "overdue"; minutes: number }
  | { kind: "late"; minutes: number };

export function pickupUrgency(
  order: Pick<WorkspaceOrder, "status" | "pickupAt">,
  nowMs: number,
): PickupUrgency | null {
  if (!order.pickupAt || order.status === "claimed") return null;
  const pickupMs = Date.parse(order.pickupAt);
  if (!Number.isFinite(pickupMs)) return null;
  const past = (nowMs - pickupMs) / 60_000;
  if (past < 0) return { kind: "upcoming", minutes: Math.ceil(-past) };
  const minutes = Math.floor(past);
  return minutes >= LATE_AFTER_MINUTES ? { kind: "late", minutes } : { kind: "overdue", minutes };
}
