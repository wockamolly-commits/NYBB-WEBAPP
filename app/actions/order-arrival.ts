"use server";

import { revalidatePath } from "next/cache";
import {
  customerArrivalInputSchema,
  normalizeCustomerArrivalInput,
  type CustomerArrivalInput,
  type CustomerArrivalResult,
} from "@/lib/orders/arrival";
import { getStorefrontSession } from "@/lib/auth/session";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";

const unavailable = "We could not tell the counter you are here. Please try again.";

/**
 * Customer-side counterpart to the arrival badge on the orders board.
 *
 * The input is a reference, never customer or order data. The database locks
 * the order, repeats tracking-token or owner authorization, limits the signal
 * to Ready, and makes a retry harmless. A bearer token is never logged.
 */
export async function markCustomerArrived(
  input: CustomerArrivalInput,
): Promise<CustomerArrivalResult> {
  const parsed = customerArrivalInputSchema.safeParse(input);
  if (!parsed.success || !supabaseConfigured()) {
    return { ok: false, error: unavailable };
  }

  const { shortCode, trackingToken } = normalizeCustomerArrivalInput(parsed.data);
  if (!shortCode) return { ok: false, error: unavailable };

  // A tracking token authorizes a guest. Without one, preserve the customer's
  // existing authenticated identity through the read-only Storefront client.
  // It must not refresh or clear a cookie in the middle of this mutation.
  const session = trackingToken ? null : await getStorefrontSession();
  const supabase = session?.supabase ?? createPublicClient();
  const { data, error } = await supabase.rpc("customer_mark_order_arrived", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
  });

  if (error) {
    console.error(`[order] customer arrival failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  revalidatePath(`/order/${shortCode}`);
  return { ok: true };
}
