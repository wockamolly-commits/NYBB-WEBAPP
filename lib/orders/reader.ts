import "server-only";
import { getStorefrontSession } from "@/lib/auth/session";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { normalizeShortCode, normalizeTrackingToken, trackedOrderSchema } from "./tracking";
import type { TrackedOrder } from "./types";

/**
 * Reading one order back.
 *
 * Shaped like `lib/slots/reader.ts` rather than `lib/menu/`: there is no
 * fallback and there must never be one. A menu can honestly be served from a
 * static catalog when no database is reachable, because a menu is a published
 * fact. An order is a specific promise to a specific person, and the only
 * truthful answer without a database is that we cannot show it.
 *
 * WHY THERE ARE THREE ANSWERS AND NOT TWO.
 *
 * "Missing" and "unavailable" have to be different, even though the database
 * works hard to make a wrong token and a nonexistent order identical. Those
 * two are the same *because the difference is worth stealing*: telling them
 * apart would make the short code space worth scraping. An outage is not like
 * that. It says nothing about whether an order exists, and collapsing it into
 * "we cannot find that order" tells a customer their order is gone when it is
 * sitting safely in a database we momentarily cannot reach. That customer
 * orders again, and the kitchen cooks it twice.
 */
export type OrderLookup =
  | { state: "found"; order: TrackedOrder }
  /** No such order, or the wrong token. Indistinguishable on purpose. */
  | { state: "missing" }
  /** The order may well exist. We cannot currently say. */
  | { state: "unavailable" };

export async function getOrderByTracking(
  shortCode: string,
  trackingToken: string | null,
): Promise<OrderLookup> {
  const code = normalizeShortCode(shortCode);
  const token = normalizeTrackingToken(trackingToken);
  if (!code) return { state: "missing" };

  if (!supabaseConfigured()) return { state: "unavailable" };

  // A token authorizes a guest. Without one, use whichever Storefront session
  // is active so an account order-history link can open its owner's order.
  const session = token ? null : await getStorefrontSession();
  const supabase = token || !session ? createPublicClient() : session.supabase;
  const { data, error } = await supabase.rpc("get_order_by_tracking", {
    p_short_code: code,
    p_tracking_token: token,
  });

  if (error) {
    // Loud, and deliberately without the token in it. The token never appears
    // in a log line, an error message or an analytics event: it is a bearer
    // credential, and a log is somewhere it can be read later by somebody who
    // was never handed the link.
    console.error(`[order] get_order_by_tracking failed for ${code}: ${error.message}`);
    return { state: "unavailable" };
  }

  if (data === null) return { state: "missing" };

  const parsed = trackedOrderSchema.safeParse(data);
  if (!parsed.success) {
    // The order exists and we cannot read it, which is an outage in this
    // codebase rather than a missing order. Saying "not found" here would be
    // the deployed function drifting quietly into a lie.
    console.error(`[order] unreadable order payload for ${code}`, parsed.error.issues);
    return { state: "unavailable" };
  }

  return { state: "found", order: parsed.data };
}
