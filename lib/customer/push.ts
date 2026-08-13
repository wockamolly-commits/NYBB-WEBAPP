import "server-only";
import { z } from "zod";
import { normalizeShortCode, normalizeTrackingToken } from "@/lib/orders/tracking";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not turn on alerts for this order. Please try again.";

export const pushRegistrationInputSchema = z.object({
  shortCode: z.string().max(64),
  trackingToken: z.string().max(128).nullable(),
  expoToken: z.string().min(1).max(200),
  platform: z.enum(["ios", "android"]),
});

export type PushRegistrationInput = z.infer<typeof pushRegistrationInputSchema>;

export type PushRegistrationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * A phone asking to be told about the order it just placed or is tracking.
 *
 * The input is a reference and a device credential, never order data.
 * `register_customer_push_device` repeats the tracking-token check
 * `get_order_by_tracking` uses, refuses a terminal order, and folds a repeat
 * registration into the same row, so this function decides nothing about who
 * may speak for an order and can be called again safely. Neither the tracking
 * token nor the Expo push token is ever logged: the first opens somebody
 * else's order, the second is a credential for their device.
 */
export async function registerPushDevice(
  input: unknown,
  caller: CustomerCaller,
): Promise<PushRegistrationResult> {
  const parsed = pushRegistrationInputSchema.safeParse(input);
  if (!parsed.success || !supabaseConfigured()) {
    return { ok: false, error: unavailable };
  }

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken);
  if (!shortCode) return { ok: false, error: unavailable };

  // A tracking token authorizes on its own. Without one, use whichever identity
  // the caller brought, the same rule signalArrival follows.
  const supabase = trackingToken ? createPublicClient() : await callerClient(caller);
  const { data, error } = await supabase.rpc("register_customer_push_device", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
    p_expo_token: parsed.data.expoToken,
    p_platform: parsed.data.platform,
  });

  if (error) {
    console.error(`[order] push registration failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
