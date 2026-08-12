import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createPublicClient } from "@/lib/supabase/public-client";

/**
 * Who is asking, in a form that does not care how they reached us.
 *
 * The customer services in this folder are called from two places that have
 * nothing in common. A Server Action reads a cookie jar through
 * `next/headers`; a mobile Route Handler reads an `Authorization` header off a
 * `Request` and has no cookies at all. Neither of those facts is interesting to
 * the act of placing an order, so both adapters reduce themselves to this
 * before they call anything: a way to produce the caller's identity, and an
 * address to count against.
 *
 * That is what "framework-neutral service" means here. It is not that the code
 * avoids importing Next by taste. It is that identity and the limiter key are
 * decided at the edge, by the adapter that can actually see them, and
 * everything below this line behaves the same for both callers.
 *
 * WHY `identity` IS A FUNCTION AND NOT A CLIENT.
 * ================================================================
 * Because resolving it costs a round trip on one of the two paths, and there
 * are requests that must not pay it. Reading an order with a guest tracking
 * token deliberately does not look at cookies at all: the token is the
 * authorization, and calling `auth.getUser()` to discover nothing would add a
 * network call to the busiest page in the product. A lazy resolver keeps that
 * decision where it belongs, in the service that knows whether it has a token.
 *
 * WHAT A CALLER IS NOT.
 * ================================================================
 * It is not an authorization. The client it produces forwards a credential to
 * PostgREST, which verifies it; `auth.uid()` inside the RPC is the only thing
 * that says who this is. A token that is expired, forged or simply somebody
 * else's does not become trusted by arriving in this shape. `address` is weaker
 * still: it is read off a proxy header (`lib/rate-limit/address.ts` is blunt
 * about how far that can be trusted) and it may only ever feed a rate limit.
 */
export type CustomerCaller = {
  /** For the address dimension of the rate limit, or null when unreadable. */
  address: string | null;
  /** The client carrying this caller's signed-in identity, or null for a guest. */
  identity: () => Promise<SupabaseClient | null>;
};

/**
 * Long enough for a real JWT with a fat payload, short enough that a caller
 * cannot make us allocate at will. A token that fails this is treated as no
 * token rather than as an error: the request continues as a guest, and the
 * database refuses whatever a guest may not do.
 */
const MAX_ACCESS_TOKEN_LENGTH = 4096;

export function normalizeAccessToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (token.length === 0 || token.length > MAX_ACCESS_TOKEN_LENGTH) return null;
  return token;
}

/** Nobody in particular, which is most of the customers most of the time. */
export function guestCaller(address: string | null = null): CustomerCaller {
  return { address, identity: async () => null };
}

/**
 * A caller holding a Supabase access token, which is how a phone signs in.
 *
 * Cookie-free, and that is the property that matters. The reference project
 * learned that a cookie-writing client used inside a mutation can delete a
 * customer's session when an internal refresh fails, and signing somebody out
 * halfway through paying for wings is not worth a marginal convenience.
 *
 * A service-role client is never the answer on this path. It has no
 * `auth.uid()` at all, so it would not make an order anonymous by accident, it
 * would make it anonymous by definition.
 */
export function bearerCaller(token: unknown, address: string | null = null): CustomerCaller {
  const accessToken = normalizeAccessToken(token);
  if (!accessToken) return guestCaller(address);

  return {
    address,
    identity: async () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { accessToken: async () => accessToken },
      ),
  };
}

/**
 * The client a service should use when a bearer tracking token is not in play.
 *
 * The caller's own identity when there is one, the anonymous public client
 * otherwise. Every read this can perform is a `SECURITY DEFINER` function
 * granted to `anon` by name, so the fallback is not a privilege, it is the
 * absence of one.
 */
export async function callerClient(caller: CustomerCaller): Promise<SupabaseClient> {
  return (await caller.identity()) ?? createPublicClient();
}
