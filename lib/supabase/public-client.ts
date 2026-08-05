import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * An anonymous, cookie-free Supabase client for public reads.
 *
 * Cookie-free is the whole design. The reference project learned the hard way
 * that a cookie-writing client used inside a Server Action can delete a
 * customer's session when an internal token refresh fails, signing them out
 * mid-checkout. Nothing this client reads is per-user (the menu, the settings
 * flags, opening hours), so it has no business touching the session at all.
 *
 * It also holds the anon key, which under 0010 grants no table privilege
 * whatsoever. Every read it can perform is a SECURITY DEFINER function that
 * was granted to anon by name.
 */

export function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createPublicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. " +
        "Call supabaseConfigured() first if a fallback is intended.",
    );
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
