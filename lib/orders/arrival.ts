import { z } from "zod";
import { normalizeShortCode, normalizeTrackingToken } from "./tracking";

export const customerArrivalInputSchema = z.object({
  shortCode: z.string().max(64),
  trackingToken: z.string().max(128).nullable(),
});

export type CustomerArrivalInput = z.infer<typeof customerArrivalInputSchema>;

export type CustomerArrivalResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Normalize the two credentials before the action reaches PostgREST.
 *
 * The RPC repeats authorization inside the transaction. This keeps malformed
 * input from becoming a different outward answer, while still letting a
 * signed-in owner use an order-history link that has no bearer token.
 */
export function normalizeCustomerArrivalInput(input: CustomerArrivalInput) {
  return {
    shortCode: normalizeShortCode(input.shortCode),
    trackingToken: normalizeTrackingToken(input.trackingToken),
  };
}
