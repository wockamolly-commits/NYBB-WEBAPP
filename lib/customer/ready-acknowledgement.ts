import "server-only";
import {
  customerArrivalInputSchema,
  normalizeCustomerArrivalInput,
  type CustomerArrivalResult,
} from "@/lib/orders/arrival";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not tell the counter you are coming. Please try again.";

/**
 * "I'm coming", the tap that answers the ready alarm (0085).
 *
 * The same reference and the same authority as `signalArrival` in
 * `./arrival.ts`, which is why it borrows that input schema: a short code and
 * an optional tracking token, never order data. The database decides whether
 * the order is in a state where coming means anything.
 *
 * The alarm on the phone has already stopped by the time this runs. What this
 * saves is the badge on the counter's board, and the reason a second phone
 * holding the same link stops ringing too.
 */
export async function acknowledgeReady(
  input: unknown,
  caller: CustomerCaller,
): Promise<CustomerArrivalResult> {
  const parsed = customerArrivalInputSchema.safeParse(input);
  if (!parsed.success || !supabaseConfigured()) {
    return { ok: false, error: unavailable };
  }

  const { shortCode, trackingToken } = normalizeCustomerArrivalInput(parsed.data);
  if (!shortCode) return { ok: false, error: unavailable };

  const supabase = trackingToken ? createPublicClient() : await callerClient(caller);
  const { data, error } = await supabase.rpc("customer_acknowledge_ready_order", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
  });

  if (error) {
    console.error(`[order] ready acknowledgement failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
