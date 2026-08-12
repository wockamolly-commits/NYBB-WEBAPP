import "server-only";
import { headers } from "next/headers";
import { getStorefrontSession } from "@/lib/auth/session";
import { clientAddress } from "@/lib/rate-limit/address";
import { bearerCaller, type CustomerCaller } from "./caller";

/**
 * The web half of the caller boundary, and the only file in `lib/customer/`
 * that is allowed to import Next.
 *
 * A Server Action's identity lives in a cookie, so this reads one. It does not
 * write one: `getStorefrontSession` builds a read-only client on purpose, and a
 * mutation that rotates a token it cannot persist is how a customer gets signed
 * out mid-checkout.
 */

/**
 * A caller identified by cookies alone.
 *
 * No address, because the surfaces that use this are reads that do not rate
 * limit, and `headers()` on a page is a cost worth not paying for a value
 * nothing will look at. The session itself is resolved lazily and is memoized
 * per request by `getStorefrontSession`, so a service that never needs an
 * identity never spends a round trip discovering there is none.
 */
export function sessionCaller(): CustomerCaller {
  return {
    address: null,
    identity: async () => (await getStorefrontSession())?.supabase ?? null,
  };
}

/**
 * A caller for a Server Action: cookies, plus the address the limiter counts.
 *
 * The address comes from the same proxy headers the limiter has always used, so
 * a Server Action and a mobile request from the same connection land in the
 * same bucket. That is worth having: otherwise moving a customer to the app
 * would quietly double every limit.
 *
 * A browser that forwarded its access token gets the cookie-free bearer path,
 * exactly as checkout has always done. The cookie is the fallback for a client
 * that did not.
 */
export async function cookieCaller(customerAccessToken?: string | null): Promise<CustomerCaller> {
  const address = clientAddress(await headers());
  const forwarded = bearerCaller(customerAccessToken, address);
  const session = sessionCaller();

  return {
    address,
    identity: async () => (await forwarded.identity()) ?? (await session.identity()),
  };
}
