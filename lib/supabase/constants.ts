/**
 * The customer session uses Supabase's default cookie family. Phase 2 gives
 * staff a separate named family. The Storefront may recognize either family
 * as identity, but tokens are never copied between them and Workspace reads
 * only the staff family.
 */
export function customerAuthCookieName(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;

  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return null;
  }
}

/** A fixed family that can never collide with Supabase's customer cookie. */
export const STAFF_AUTH_COOKIE = "nybb-staff-auth";
export const STAFF_COOKIE_ENCODING = "tokens-only" as const;
