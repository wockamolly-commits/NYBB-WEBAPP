import { rejectedOrderCopy } from "./reject-reasons";
import type { OrderStatus, TrackedOrder } from "./types";

/**
 * The lifecycle, and what each step of it says to the customer.
 *
 * Spec section 12 defines the arrays and section 27 puts the staff board in
 * Phase 2, so today every order sits at `pending` and nothing can move it. The
 * whole ladder is written now anyway, for two reasons: the copy is the part
 * that needs thinking about rather than the transitions, and a page that only
 * handles the one status it can currently reach is a page that will render an
 * empty box on the first day the board exists.
 *
 * The wording follows one rule. Each status answers "what happens next", from
 * the customer's side of the counter, because a status word on its own is a
 * label rather than an answer: "Accepted" tells somebody standing in a car
 * park nothing about whether to get out of the car.
 */

export const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
];

export const TERMINAL_STATUSES: OrderStatus[] = [
  "claimed",
  "rejected",
  "cancelled",
  "no_show",
];

export function isActiveStatus(status: OrderStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * What to show a customer whose order is waiting on an online payment.
 *
 * There are two answers and only one of them is a button. An order can outlive
 * the deployment's ability to take money for it: the rail is opened by a flag
 * in a database every environment shares, so orders were placed on QR Ph
 * against a production deployment holding no PayMongo keys. Those orders are
 * real, correct, and unpayable here, and the screen offered them a button that
 * failed on every press with "please try again in a moment", which is an
 * instruction to keep doing the one thing that cannot work.
 *
 * Extracted from the component, the way `lib/staff/board.ts` extracts the
 * board's rule, because the interesting part is which of the two a customer
 * gets rather than how it is laid out.
 */
export type OnlinePaymentPrompt =
  /** Offer the pay button. This deployment can carry the payment through. */
  | { kind: "payable" }
  /** No button. Say what happened and give them something that works. */
  | { kind: "unavailable"; title: string; body: string };

export function onlinePaymentPrompt(serviceable: boolean): OnlinePaymentPrompt {
  if (serviceable) return { kind: "payable" };
  return {
    kind: "unavailable",
    title: "Online payment is not available",
    body:
      "Online payment is not switched on for this site yet, so this order " +
      "cannot be paid here. Nothing has been charged. It will be released " +
      "automatically in a few minutes and the pickup window will go back to " +
      "whoever wants it, so please order again and pay at the counter, or " +
      "call the branch below.",
  };
}

/**
 * How the screen should look, rather than which status it is.
 *
 * `ready` is its own tone and not merely another active step. It is the moment
 * the whole product exists for: the food is up and the customer has to move.
 */
export type StatusTone = "waiting" | "ready" | "done" | "stopped";

export type StatusCopy = {
  title: string;
  body: string;
  tone: StatusTone;
  /** Whether the pickup code is still worth anything. */
  codeIsLive: boolean;
};

export function statusCopy(
  order: Pick<TrackedOrder, "status" | "timeline"> & Partial<Pick<TrackedOrder, "payment">>,
): StatusCopy {
  if (order.payment?.status === "refunded") {
    return {
      title: "Payment refunded",
      body: "A refund was issued for this payment. Please call the branch if you need help.",
      tone: "stopped",
      codeIsLive: false,
    };
  }
  switch (order.status) {
    case "pending":
      if (order.payment?.method !== "counter" && order.payment?.status === "pending") {
        return {
          title: "Waiting for payment",
          body: "Complete the online payment below. The kitchen receives this order after payment is confirmed.",
          tone: "waiting",
          codeIsLive: false,
        };
      }
      return {
        title: "Order received",
        body:
          "The kitchen has it. Nothing else to do until your window, and we " +
          "start cooking in time for it rather than now, so it is hot when you " +
          "arrive.",
        tone: "waiting",
        codeIsLive: true,
      };

    case "accepted":
      return {
        title: "Accepted by the kitchen",
        body: "It is in the queue and timed for your window.",
        tone: "waiting",
        codeIsLive: true,
      };

    case "preparing":
      return {
        title: "Cooking now",
        body: "Your wings are in. This is a good time to set off.",
        tone: "waiting",
        codeIsLive: true,
      };

    case "ready":
      return {
        title: "Ready for collection",
        body:
          "It is up and waiting at the counter. Give your pickup code and it " +
          "is yours.",
        tone: "ready",
        codeIsLive: true,
      };

    case "claimed":
      return {
        title: "Collected",
        body: "Handed over at the counter. Enjoy it.",
        tone: "done",
        codeIsLive: false,
      };

    // The two refusals carry a reason from staff, and the reason is the whole
    // message. Falling back to a generic line is what makes a rejected order
    // feel like a system failure rather than a shop that ran out of something.
    //
    // What staff choose is a code, not a sentence, for the reason
    // `lib/orders/reject-reasons.ts` gives at length: this line is read by a
    // customer, and a text box a counter fills in under pressure is not a safe
    // way to write to a stranger's phone. A code from before that list existed,
    // or one this build does not know, still lands on the generic sentence.
    case "rejected":
      return {
        title: "The branch could not take this order",
        body: rejectedOrderCopy(
          order.timeline.rejectedReason,
          order.payment?.status === "paid",
        ),
        tone: "stopped",
        codeIsLive: false,
      };

    case "cancelled":
      if (order.timeline.cancelledReason === "payment_timeout") {
        return {
          title: "Payment time ran out",
          body:
            order.payment?.status === "paid"
                ? "Payment reached us after this order expired. Please call the branch with your order number."
              : "Online payment was not completed in time, so this order was cancelled and the pickup slot was released.",
          tone: "stopped",
          codeIsLive: false,
        };
      }
      if (order.timeline.cancelledReason === "payment_failed") {
        return {
          title: "Payment was not completed",
          body: "This order was cancelled and its pickup slot was released. Please place a new order when you are ready to pay.",
          tone: "stopped",
          codeIsLive: false,
        };
      }
      return {
        title: "Cancelled",
        body:
          order.timeline.cancelledReason ??
          "This order was cancelled before it was cooked. Please call the branch if you need help.",
        tone: "stopped",
        codeIsLive: false,
      };

    case "no_show":
      return {
        title: "Not collected",
        body:
          "This order sat at the counter past its window and was closed. Please call the branch if you think this is wrong.",
        tone: "stopped",
        codeIsLive: false,
      };
  }
}

/**
 * The ladder, for the step list on the page.
 *
 * Only the happy path, because a rejected order does not need its own dead
 * rung drawn next to three it will never reach: the copy above has already
 * said what happened, and drawing the rest would be a diagram of a thing that
 * did not occur.
 */
export const PICKUP_STEPS: { status: OrderStatus; label: string }[] = [
  { status: "pending", label: "Received" },
  { status: "preparing", label: "Cooking" },
  { status: "ready", label: "Ready" },
  { status: "claimed", label: "Collected" },
];

/**
 * Which rungs are behind the order, given where it is.
 *
 * `accepted` maps onto Cooking rather than getting a rung of its own, because
 * spec section 13 collapses accept and start into one tap. The customer would
 * see two steps that always change together, which reads as a screen padding
 * itself out.
 */
export function stepIndex(status: OrderStatus): number {
  switch (status) {
    case "pending":
      return 0;
    case "accepted":
    case "preparing":
      return 1;
    case "ready":
      return 2;
    case "claimed":
      return 3;
    default:
      // Terminal failures are not on this ladder at all.
      return -1;
  }
}
