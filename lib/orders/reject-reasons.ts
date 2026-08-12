/**
 * Why a branch could not take an order, in the two languages it needs.
 *
 * WHY THIS IS A FIXED LIST AND NOT A TEXT BOX.
 * ================================================================
 * `lib/orders/status.ts` shows `rejectedReason` to the customer as the entire
 * message, deliberately: a generic line there makes a shop that ran out of
 * wings feel like a system failure. That decision has a cost, and this file is
 * the cost. Whatever a staff member picks is what a customer reads, so a free
 * text box would put an internal note ("cust rude, told him no") on a stranger's
 * phone during a bad shift. A closed list cannot do that.
 *
 * WHY THE DATABASE STORES A CODE.
 * ================================================================
 * Same reason `cancelled_reason` stores `payment_timeout` rather than a
 * sentence: a database function has no business writing customer copy, and
 * wording that changes must not break a caller or rewrite history. The row
 * keeps the code, this file turns it into a sentence, and the sentence is unit
 * tested rather than discovered in production.
 *
 * An unrecognized code, including one written before this list existed, falls
 * back to the generic line in `status.ts`. Nothing here throws at a customer.
 */

export const REJECT_REASON_CODES = ["sold_out", "too_busy", "closing", "other"] as const;

export type RejectReasonCode = (typeof REJECT_REASON_CODES)[number];

export function isRejectReasonCode(value: unknown): value is RejectReasonCode {
  return typeof value === "string" && (REJECT_REASON_CODES as readonly string[]).includes(value);
}

/**
 * What a staff member picks from, in the words a counter uses.
 *
 * Short, because this is a menu read under pressure with food waiting, and
 * ordered by how often a branch will actually reach for it.
 */
export const REJECT_REASON_LABELS: Record<RejectReasonCode, string> = {
  sold_out: "Sold out",
  too_busy: "Kitchen at capacity",
  closing: "Closing before pickup",
  other: "Another reason",
};

/**
 * What the customer reads.
 *
 * Every line says what happened and what they can do next, and none of them
 * blames the customer, because none of these are their doing. "Other" is
 * deliberately vague rather than inventing a cause: a staff member reached for
 * it precisely because the four words above did not fit, and guessing on their
 * behalf would put a wrong explanation on a screen.
 */
export const REJECT_REASON_COPY: Record<RejectReasonCode, string> = {
  sold_out: "Something on this order had sold out before the kitchen could start it.",
  too_busy:
    "The kitchen could not take on this order in time for your pickup window, so the branch stopped it rather than keep you waiting.",
  closing: "The branch is closing before your pickup window, so it could not make this order.",
  other: "The branch stopped this order. Please call them and they will explain.",
};

/**
 * The sentence a rejected order shows, with the money accounted for.
 *
 * The refund is a separate, deliberate step by a staff member, which is the
 * owner's ruling rather than an implementation shortcut. So this promises the
 * refund without claiming it has happened: a customer who paid is owed money
 * and has to be told so, and telling them it is already back would be a lie
 * they would discover at their bank.
 */
export function rejectedOrderCopy(reason: string | null, wasPaid: boolean): string {
  const explanation = isRejectReasonCode(reason)
    ? REJECT_REASON_COPY[reason]
    : REJECT_REASON_COPY.other;

  return wasPaid
    ? `${explanation} The branch will return your payment. Please call them if it has not arrived within a few days.`
    : explanation;
}
