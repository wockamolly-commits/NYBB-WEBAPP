/**
 * The link to the counter picker, carrying where to come back to.
 *
 * A separate module from `selection.ts` because that one is server-only and
 * this is needed by client components too. The return path is validated on
 * arrival, not here: a value in a query string is a value a stranger can set,
 * and an unchecked one is an open redirect.
 */
export function storesHref(returnTo?: string | null): string {
  if (!returnTo) return "/stores";
  return `/stores?next=${encodeURIComponent(returnTo)}`;
}

/**
 * A `next` value that is safe to send a browser to.
 *
 * Same-origin, absolute, and not protocol-relative. Anything else falls back
 * to the menu, which is where somebody who has just chosen a counter wants to
 * be anyway.
 */
export function safeReturnTo(value: unknown, fallback = "/menu"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
