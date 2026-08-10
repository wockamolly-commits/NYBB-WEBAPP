import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { STAFF_AUTH_COOKIE, STAFF_COOKIE_ENCODING } from "./constants";
import { supabaseConfigured } from "./public-client";

function credentials(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase customer authentication is not configured.");
  }

  return { url, anonKey };
}

/** A customer client for Server Actions and Route Handlers that may set cookies. */
export async function createCustomerClient() {
  const { url, anonKey } = credentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write. proxy.ts persists refreshes.
        }
      },
    },
  });
}

/**
 * A session-aware client that can never rotate or delete customer cookies.
 * Checkout and cart actions use this for their cookie fallback, keeping the
 * browser and proxy as the only session writers.
 */
export async function createReadOnlyCustomerClient() {
  const { url, anonKey } = credentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll() {},
    },
  });
}

/** A staff client using an isolated cookie family. May persist OTP and refresh results. */
export async function createStaffClient() {
  const { url, anonKey } = credentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: { name: STAFF_AUTH_COOKIE },
    cookies: {
      encode: STAFF_COOKIE_ENCODING,
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write. proxy.ts persists refreshes.
        }
      },
    },
  });
}

/** A staff data client that cannot rotate or delete its session cookies. */
export async function createReadOnlyStaffClient() {
  const { url, anonKey } = credentials();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookieOptions: { name: STAFF_AUTH_COOKIE },
    cookies: {
      encode: STAFF_COOKIE_ENCODING,
      getAll: () => cookieStore.getAll(),
      setAll() {},
    },
  });
}

export { supabaseConfigured };
