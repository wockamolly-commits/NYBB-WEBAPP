import "server-only";
import { z } from "zod";
import { normalizeShortCode, normalizeTrackingToken } from "@/lib/orders/tracking";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not turn on alerts for this order. Please try again.";

/**
 * The shape a browser actually sends, which is not the shape it is convenient
 * to write down.
 *
 * `PushSubscription.toJSON()` nests the two keys under `keys`, alongside an
 * `expirationTime` nothing here wants. `lib/staff/push.ts` learned this the
 * expensive way: its first schema expected the keys at the top level, which is
 * the shape the DATABASE function takes, and it passed a unit test written to
 * the same assumption while refusing every real subscription with a 409 that
 * named no cause. The browser's serialization is the contract; flattening
 * happens below.
 */
export const customerSubscriptionSchema = z.object({
  shortCode: z.string().max(64),
  trackingToken: z.string().max(128).nullable().optional(),
  subscription: z.object({
    endpoint: z.url().max(512),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export type CustomerSubscriptionResult = { ok: true } | { ok: false; error: string };

/**
 * A customer's browser asking to be told about the order it is looking at.
 *
 * The input is a reference and a device credential, never order data.
 * `register_customer_push_subscription` (0047) repeats the tracking-token and
 * owner checks `get_order_by_tracking` uses, refuses a terminal order, refuses
 * an endpoint that belongs to another audience, and folds a repeat
 * registration into the same row. So this function decides nothing about who
 * may speak for an order and can be called again safely.
 *
 * Nothing is logged but the failure itself. The tracking token opens somebody
 * else's order and the two keys are what let anyone send to that device.
 */
export async function registerCustomerSubscription(
  input: unknown,
  caller: CustomerCaller,
): Promise<CustomerSubscriptionResult> {
  const parsed = customerSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    // Which fields, never their values. `issues` names paths and constraints,
    // and without this line a shape mismatch is a refusal with no cause
    // anywhere, which is exactly how the staff nested-keys bug reached a
    // browser.
    console.error("[push] customer subscription body rejected", parsed.error.issues);
    return { ok: false, error: unavailable };
  }
  if (!supabaseConfigured()) return { ok: false, error: unavailable };

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken ?? null);
  if (!shortCode) return { ok: false, error: unavailable };

  // A tracking token authorizes on its own. Without one, use whichever identity
  // the caller brought, the same rule signalArrival follows.
  const supabase = trackingToken ? createPublicClient() : await callerClient(caller);
  const { data, error } = await supabase.rpc("register_customer_push_subscription", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
    p_endpoint: parsed.data.subscription.endpoint,
    p_p256dh: parsed.data.subscription.keys.p256dh,
    p_auth_key: parsed.data.subscription.keys.auth,
  });

  if (error) {
    console.error(`[push] customer subscription failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
