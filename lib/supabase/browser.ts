"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STAFF_AUTH_COOKIE, STAFF_COOKIE_ENCODING } from "./constants";

let customerClient: SupabaseClient | null = null;
let staffClient: SupabaseClient | null = null;

export function createCustomerBrowserClient(): SupabaseClient {
  customerClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { isSingleton: false },
  );
  return customerClient;
}

export function createStaffBrowserClient(): SupabaseClient {
  staffClient ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      isSingleton: false,
      cookieOptions: { name: STAFF_AUTH_COOKIE },
      cookies: { encode: STAFF_COOKIE_ENCODING },
    },
  );
  return staffClient;
}

/** The active Storefront client, preferring a customer cookie over a staff cookie. */
export async function createStorefrontBrowserClient(): Promise<SupabaseClient> {
  const customer = createCustomerBrowserClient();
  const {
    data: { session: customerSession },
  } = await customer.auth.getSession();
  if (customerSession) return customer;

  const staff = createStaffBrowserClient();
  const {
    data: { session: staffSession },
  } = await staff.auth.getSession();
  return staffSession ? staff : customer;
}

/** A fresh-enough access token for a stateless checkout RPC. */
export async function storefrontAccessToken(): Promise<string | null> {
  const supabase = await createStorefrontBrowserClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return null;
  if (session.expires_at && session.expires_at * 1000 - Date.now() < 120_000) {
    const {
      data: { session: refreshed },
    } = await supabase.auth.refreshSession();
    return refreshed?.access_token ?? null;
  }

  return session.access_token;
}
