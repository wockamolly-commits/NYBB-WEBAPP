import "server-only";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import { addressRateKey } from "./address";

/**
 * The address dimension of rate limiting, called from Server Actions.
 *
 * IT FAILS OPEN, AND THAT IS THE SPECIFICATION RATHER THAN A SHORTCUT.
 * ================================================================
 * Spec section 22 item 6 requires it in as many words, and 0008 repeats it in
 * the comment above `rate_limit_hit` itself: a limiter that takes ordering down
 * with it has done more damage than the abuse it prevents. So every way this
 * can go wrong returns `true`. No address, no service-role key configured, the
 * RPC throwing, the RPC returning something that is not a boolean: all of them
 * mean the order proceeds and the database's own limit, on an identity it can
 * verify, is still there underneath.
 *
 * WHAT THIS COUNTS THAT THE DATABASE LIMIT DOES NOT.
 * ================================================================
 * The two are complements rather than a belt and braces of the same thing, and
 * the difference is worth knowing when reading either number.
 *
 * `place_order`'s limit runs inside the order transaction, so a refused attempt
 * rolls its own increment back and it therefore counts orders that COMMIT, per
 * identity. This one runs in the Server Action, outside any transaction, so it
 * counts REQUESTS, per address, whether they succeed or not. A script that
 * hammers checkout with payloads that all get refused is invisible to the first
 * and is exactly what the second is for.
 */

/**
 * Twenty requests per ten minutes, and the number is set by who shares an
 * address rather than by what a script can do.
 *
 * A script can beat any figure a real customer would tolerate, so this is not
 * trying to find the value that stops one. It is trying to sit above the
 * busiest legitimate shared connection, because the cost of guessing low is
 * refusing real orders. That is not a hypothetical here: `PRODUCT.md` has the
 * customer ordering "office lunch from a desk in IT Park", which is one office
 * NAT and a lunch peak, and Philippine mobile carriers put very large numbers
 * of subscribers behind carrier-grade NAT, so one address can legitimately be
 * many unrelated people.
 *
 * Revisit both figures once there is real traffic to look at. Until then the
 * bias is deliberately toward letting an order through.
 */
const PLACE_ORDER_LIMIT = 20;
const PLACE_ORDER_WINDOW_SECONDS = 600;

export type AddressLimit = {
  /** Namespaces the key, so one action filling up cannot refuse another. */
  action: string;
  address: string | null;
  limit: number;
  windowSeconds: number;
};

/** True when the request may proceed. See the fail-open note above. */
export async function withinAddressLimit({
  action,
  address,
  limit,
  windowSeconds,
}: AddressLimit): Promise<boolean> {
  const key = addressRateKey(action, address);
  if (!key) return true;
  if (!adminConfigured()) return true;

  try {
    const { data, error } = await createAdminClient().rpc("rate_limit_hit", {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      // Deliberately does not log the key. It is a hash of a customer address,
      // and a log line pairing it with a timestamp reassembles the thing the
      // hash existed to avoid keeping.
      console.error("[rate-limit] rate_limit_hit failed, allowing the request", error.message);
      return true;
    }

    return typeof data === "boolean" ? data : true;
  } catch (cause) {
    console.error("[rate-limit] rate_limit_hit threw, allowing the request", cause);
    return true;
  }
}

/** The address limit for order placement, with this module's figures. */
export function withinPlaceOrderAddressLimit(address: string | null): Promise<boolean> {
  return withinAddressLimit({
    action: "place_order",
    address,
    limit: PLACE_ORDER_LIMIT,
    windowSeconds: PLACE_ORDER_WINDOW_SECONDS,
  });
}
