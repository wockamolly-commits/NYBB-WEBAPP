import "server-only";
import {
  customerArrivalInputSchema,
  normalizeCustomerArrivalInput,
  type CustomerArrivalResult,
} from "@/lib/orders/arrival";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not tell the counter you are here. Please try again.";

/**
 * Customer-side counterpart to the arrival badge on the orders board.
 *
 * The input is a reference, never customer or order data. The database locks
 * the order, repeats tracking-token or owner authorization, limits the signal
 * to Ready, and makes a retry harmless. A bearer token is never logged.
 *
 * Worth stating plainly because this is a mutation a phone can now call: the
 * app is not trusted to say an order arrived, it is trusted to say a customer
 * pressed a button. `customer_mark_order_arrived` decides the rest, including
 * whether the order is in a state where arriving means anything.
 */
export async function signalArrival(
  input: unknown,
  caller: CustomerCaller,
): Promise<CustomerArrivalResult> {
  const parsed = customerArrivalInputSchema.safeParse(input);
  if (!parsed.success || !supabaseConfigured()) {
    return { ok: false, error: unavailable };
  }

  const { shortCode, trackingToken } = normalizeCustomerArrivalInput(parsed.data);
  if (!shortCode) return { ok: false, error: unavailable };

  // A tracking token authorizes on its own. Without one, use whichever identity
  // the caller brought. On the web that is a read-only cookie client, which
  // must not refresh or clear a cookie in the middle of a mutation.
  const supabase = trackingToken ? createPublicClient() : await callerClient(caller);
  const { data, error } = await supabase.rpc("customer_mark_order_arrived", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
  });

  if (error) {
    console.error(`[order] customer arrival failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
