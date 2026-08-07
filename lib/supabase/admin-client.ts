import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The service-role client. Read the whole comment before importing this.
 *
 * This key bypasses row level security completely. Every policy in 0009 and
 * every grant in 0010 is written against `anon`, `authenticated` and
 * `service_role`, and this client is the third one: it is not a more powerful
 * customer, it is the database with the door taken off. Spec section 22 item 9
 * therefore requires that it live in explicitly named server modules and that
 * `createAdminClient` never be confused with a client that merely holds a
 * staff cookie, because the second one still runs as `anon` on customer pages
 * and the first one does not run as anything at all.
 *
 * WHAT IS ALLOWED TO USE IT TODAY, WHICH IS ONE THING.
 * ================================================================
 * `rate_limit_hit`, from `lib/rate-limit/limiter.ts`. That function is revoked
 * from PUBLIC in 0010 and granted to `service_role` alone, with a comment in
 * that migration saying it is called from the service-role client, so this is
 * the caller the schema was written for rather than a new privilege being
 * claimed.
 *
 * WHAT MUST NOT USE IT, AND THE ONE THAT WILL BE TEMPTING.
 * ================================================================
 * **Not `place_order`.** When customer sign-in lands in step 8, the Server
 * Action will need `auth.uid()` to be the customer inside the transaction so
 * that `orders.user_id` is stamped. The way to do that is to forward the
 * customer's access token and build a client with it, per spec section 14. It
 * is not this. A service-role client has no `auth.uid()` at all, so reaching
 * for it would silently turn every order into a guest order, placed with a key
 * the storefront has no business holding. `app/actions/checkout.ts` says the
 * same thing at the point of temptation.
 *
 * It is also deliberately cookie-free, for the reason `public-client.ts` gives:
 * a client that writes cookies inside a Server Action can sign a customer out
 * mid-checkout when an internal token refresh fails.
 */

export function adminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. " +
        "Call adminConfigured() first if a fallback is intended.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
