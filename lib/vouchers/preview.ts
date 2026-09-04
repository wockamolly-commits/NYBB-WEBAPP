import { z } from "zod";
import { orderLineSchema } from "@/lib/checkout/schema";
import type { CheckoutField } from "@/lib/checkout/types";

/**
 * The checkout preview's boundary, as types and a parse.
 *
 * Look at what goes out and what comes back. The request names a code, a
 * branch, a phone number and the same lines the order itself would carry: no
 * price, no subtotal, no discount. The reply carries a discount the SERVER
 * computed, which the screen renders and never recalculates.
 *
 * That asymmetry is the point. `preview_voucher` reserves nothing and promises
 * nothing, and `place_order` resolves the code again from scratch when the
 * order is actually written. So the worst a tampered or stale preview can do is
 * show a number the placement then corrects, in front of the customer, before
 * any money moves.
 */

export const voucherPreviewInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  branchSlug: z.string().trim().max(80).nullable(),
  /** Used only to count this customer's prior redemptions. */
  phone: z.string().trim().max(40),
  lines: z.array(orderLineSchema).min(1).max(50),
});

export type VoucherPreviewInput = z.input<typeof voucherPreviewInputSchema>;

/** What the screen shows beside the code once it has been accepted. */
export type AppliedVoucher = {
  code: string;
  description: string | null;
  /** Resolved server side. The screen renders this and does no arithmetic. */
  discountCents: number;
  /** What the discount was measured against, for a scoped code. */
  eligibleCents: number;
  /** The cart's full value, so the summary can show both lines. */
  subtotalCents: number;
};

export type VoucherPreviewResult =
  | { ok: true; voucher: AppliedVoucher }
  | { ok: false; error: string; field?: CheckoutField };

/**
 * The verdict as `preview_voucher` returns it, parsed rather than trusted.
 *
 * The same discipline as `placedOrderSchema`: a shape that fails here is a
 * deployed function that has drifted from the code calling it, and the parse is
 * a much cheaper place to find that out than a checkout screen showing
 * "undefined off".
 */
export const voucherVerdictSchema = z.union([
  z.object({
    ok: z.literal(true),
    code: z.string().min(1),
    description: z.string().nullable().default(null),
    discountCents: z.number().int().positive(),
    eligibleCents: z.number().int().nonnegative(),
    subtotalCents: z.number().int().nonnegative(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.string().min(1),
  }),
]);
