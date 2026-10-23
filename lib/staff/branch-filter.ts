import type { StaffProfile } from "./session";

/**
 * The branch picker on the order history and audit screens.
 *
 * WHO GETS IT. The Super Admin, and nobody else. A branch assigned person is
 * pinned to their counter by the row policies whatever they ask for, and a
 * business wide manager reads every counter at once, unfiltered, as before.
 *
 * WHERE THE RULE LIVES. Here, on the server, and not in the page. The value
 * arrives as a query string, so anybody can type one. `effectiveBranchFilter`
 * throws it away for anyone who is not the Super Admin, so a hand edited URL
 * from a manager reads exactly what the plain URL reads. Under that, the row
 * policies still pin an assigned person to their own counter: this filter can
 * only ever narrow what the database already allowed, never widen it.
 */

/** Audit only: the entries that belong to no counter (the catalog, vouchers, staff). */
export const BUSINESS_WIDE_BRANCH = "none";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A branch id, or "" for every branch. Anything else reads as every branch. */
export function normalizeBranchFilter(
  value: string,
  { allowBusinessWide = false }: { allowBusinessWide?: boolean } = {},
): string {
  const trimmed = value.trim();
  if (allowBusinessWide && trimmed === BUSINESS_WIDE_BRANCH) return trimmed;
  return UUID.test(trimmed) ? trimmed.toLowerCase() : "";
}

export function canFilterByBranch(profile: Pick<StaffProfile, "role">): boolean {
  return profile.role === "admin";
}

/** The branch filter to actually apply: the request for the Super Admin, nothing for anyone else. */
export function effectiveBranchFilter(
  profile: Pick<StaffProfile, "role">,
  requested: string,
): string {
  return canFilterByBranch(profile) ? requested : "";
}
