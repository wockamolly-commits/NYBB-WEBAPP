import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { listStores } from "./reader";
import type { Store } from "./types";

/**
 * Which store the customer is ordering from, and how that survives a page
 * change.
 *
 * A COOKIE RATHER THAN localStorage, WHICH IS WHERE THE CART LIVES.
 *
 * The cart can be a browser-only value because nothing on the server has to
 * price it until checkout. The store cannot: the menu's price list, the pickup
 * windows and the branch name are all resolved on the server, in components
 * that render before any client code runs. Keeping the choice in localStorage
 * would mean every one of those pages rendering the wrong branch and then
 * correcting itself, which is a visible flicker on the one fact the whole
 * pickup flow depends on.
 *
 * It is not httpOnly, because a Server Action writes it and nothing reads it
 * from the browser; it is not a session, so nothing about it needs protecting
 * beyond the validation below.
 *
 * NOTHING TRUSTS THE COOKIE'S VALUE. It is a slug, and it is checked against
 * the list of stores that can actually take an order on every read. A cookie
 * naming a branch the owner has since switched off resolves to nothing, and
 * the customer is asked again rather than being quietly moved.
 */

export const BRANCH_COOKIE = "nybb_store";

/** A year. The store somebody collects from is a habit, not a session. */
const BRANCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const branchCookieOptions = {
  path: "/",
  maxAge: BRANCH_COOKIE_MAX_AGE,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

/**
 * What every storefront surface needs to know about where it is ordering from.
 *
 * `selected` is null in two different situations that the surfaces render
 * differently: nobody has chosen yet, and the chosen store stopped being
 * orderable. `wasDropped` is what separates them, because the second one owes
 * the customer an explanation.
 */
export type StoreSelection = {
  stores: Store[];
  selected: Store | null;
  /** A store was chosen, and it can no longer take orders. */
  wasDropped: boolean;
  /** The only store that can take an order, when there is exactly one. */
  onlyOrderable: Store | null;
};

/**
 * Memoised for the length of one request, the way the session reads in
 * `lib/auth/session.ts` are.
 *
 * Every buying surface now resolves the chosen counter before it reads the
 * menu, and a route can ask more than once: the category and item pages ask in
 * `generateMetadata` and again in the page body. Without this that is a second
 * `get_orderable_branches` round trip for an answer that cannot have changed
 * between the two. `cache` is per request, so two customers never share one
 * cookie's answer.
 */
export const getStoreSelection = cache(async (): Promise<StoreSelection> => {
  const [stores, jar] = await Promise.all([listStores(), cookies()]);
  const chosen = jar.get(BRANCH_COOKIE)?.value ?? null;

  const orderable = stores.filter((store) => store.orderable);
  const selected = chosen
    ? (orderable.find((store) => store.slug === chosen) ?? null)
    : null;

  return {
    stores,
    selected,
    wasDropped: Boolean(chosen) && selected === null,
    onlyOrderable: orderable.length === 1 ? orderable[0] : null,
  };
});

/**
 * The branch slug to send to the server, or null to let it resolve the default.
 *
 * Null is a real answer rather than a missing one: `resolve_pickup_branch_id`
 * and `place_order` both take null and pick the first active branch, which is
 * exactly right when there is only one and the customer has not been asked.
 */
export async function selectedBranchSlug(): Promise<string | null> {
  const { selected } = await getStoreSelection();
  return selected?.slug ?? null;
}
