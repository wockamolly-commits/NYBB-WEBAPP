import { describe, expect, it } from "vitest";
import {
  canIssueRefund,
  MINIMUM_REFUND_CENTS,
  refundableCents,
  reservedRefundCents,
} from "@/lib/staff/refunds";

/**
 * These assertions are `staff_request_refund` (migration 0033) restated.
 *
 * The workspace used to cap a refund at the whole payment, so a part-refunded
 * order was shown a maximum the database would refuse. Everything here exists
 * to keep the sentence on screen and the rule in the database saying the same
 * thing.
 */
describe("how much of a payment is still refundable", () => {
  const paid = 45_000;

  it("offers the whole payment when nothing has been sent back", () => {
    expect(refundableCents(paid, [])).toBe(paid);
    expect(canIssueRefund(paid, [])).toBe(true);
  });

  it("takes off a refund that already succeeded", () => {
    const refunds = [{ status: "succeeded", amountCents: 20_000 }];
    expect(refundableCents(paid, refunds)).toBe(25_000);
  });

  it("also takes off one that is merely pending", () => {
    // This is the whole reason pending counts: while the provider decides on
    // the first attempt, the same money must not be offered a second time.
    const refunds = [{ status: "pending", amountCents: 20_000 }];
    expect(refundableCents(paid, refunds)).toBe(25_000);
  });

  it("gives back the money a failed refund had reserved", () => {
    const refunds = [{ status: "failed", amountCents: 20_000 }];
    expect(reservedRefundCents(refunds)).toBe(0);
    expect(refundableCents(paid, refunds)).toBe(paid);
  });

  it("adds up several refunds rather than reading only the newest", () => {
    const refunds = [
      { status: "succeeded", amountCents: 10_000 },
      { status: "failed", amountCents: 5_000 },
      { status: "pending", amountCents: 15_000 },
    ];
    expect(refundableCents(paid, refunds)).toBe(20_000);
  });

  it("never reports a negative remainder", () => {
    const refunds = [{ status: "succeeded", amountCents: 60_000 }];
    expect(refundableCents(paid, refunds)).toBe(0);
  });

  it("refuses a control whose only outcome would be the database saying no", () => {
    // The database rejects anything under one peso, so a payment refunded down
    // to fifty centavos has nothing left worth offering a button for.
    const nearlyAllGone = [{ status: "succeeded", amountCents: paid - 50 }];
    expect(refundableCents(paid, nearlyAllGone)).toBe(50);
    expect(canIssueRefund(paid, nearlyAllGone)).toBe(false);

    const exactlyAtTheFloor = [{ status: "succeeded", amountCents: paid - MINIMUM_REFUND_CENTS }];
    expect(canIssueRefund(paid, exactlyAtTheFloor)).toBe(true);
  });
});
