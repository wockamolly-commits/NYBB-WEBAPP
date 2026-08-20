/**
 * How much of a payment may still be sent back.
 *
 * Pure, and separate from the controls that render it, for the same reason
 * `board.ts` is separate from the order card: the interesting part is a rule
 * the database already enforces, and a screen that states it differently is
 * worse than a screen that does not state it at all.
 *
 * THE RULE BELONGS TO `staff_request_refund` (migration 0033).
 * ================================================================
 * That function caps a refund at the payment total minus every refund already
 * sitting at `pending` or `succeeded`, and refuses anything under one peso.
 * The workspace used the payment total on its own, so a part-refunded order
 * offered "Maximum: 450.00" over a payment with 200.00 left in it, took the
 * 450, and answered with "The requested amount exceeds what remains
 * refundable." The cap was never wrong; only the sentence describing it was.
 *
 * A `pending` refund counts against the remainder. That is what stops the same
 * money being sent twice while the provider is still deciding on the first
 * attempt. A `failed` one released its reservation and does not count.
 */

/** `refunds.amount_cents` has a `check (amount_cents >= 100)` behind it. */
export const MINIMUM_REFUND_CENTS = 100;

export type RefundReservation = {
  status: string;
  amountCents: number;
};

/** Money already spoken for, matching `status in ('pending', 'succeeded')`. */
export function reservedRefundCents(refunds: readonly RefundReservation[]): number {
  return refunds
    .filter((refund) => refund.status === "pending" || refund.status === "succeeded")
    .reduce((sum, refund) => sum + refund.amountCents, 0);
}

/** What is left, never below zero even if the rows ever disagree. */
export function refundableCents(
  amountCents: number,
  refunds: readonly RefundReservation[],
): number {
  return Math.max(0, amountCents - reservedRefundCents(refunds));
}

/**
 * Whether a refund control can succeed at all.
 *
 * Offering one that cannot is the failure mode this codebase already names on
 * the orders board: a control whose only outcome is a red message during a
 * rush. A payment refunded down to its last fifty centavos has nothing left
 * that clears the database's own minimum.
 */
export function canIssueRefund(
  amountCents: number,
  refunds: readonly RefundReservation[],
): boolean {
  return refundableCents(amountCents, refunds) >= MINIMUM_REFUND_CENTS;
}
