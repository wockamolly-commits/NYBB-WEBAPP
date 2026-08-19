"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { BRANCH_COOKIE, branchCookieOptions } from "@/lib/branches/selection";
import { listStores } from "@/lib/branches/reader";
import type { ChooseStoreResult } from "@/lib/branches/types";

/**
 * Choosing the counter to collect from.
 *
 * The validation is the point of this being a Server Action rather than a
 * cookie written in the browser. A slug only becomes the customer's store once
 * it names a branch that can genuinely take an order, so a stale bookmark, a
 * hand-edited cookie, or a store the owner switched off between the page
 * rendering and the button being pressed all land on the same refusal, and the
 * customer is asked again instead of being sent to a shop that will turn them
 * away at checkout.
 *
 * Every storefront path is revalidated because the choice changes what most of
 * them render: the menu's price list, the pickup windows, the store named in
 * the cart and on checkout.
 */
export async function chooseStore(slug: string): Promise<ChooseStoreResult> {
  const stores = await listStores();
  const store = stores.find((entry) => entry.slug === slug);

  if (!store) {
    return {
      ok: false,
      error: "We do not have a counter with that name. Please choose one from the list.",
    };
  }

  if (!store.orderable) {
    return {
      ok: false,
      error:
        store.blockedReason === "not_accepting"
          ? `${store.shortName} has stopped taking orders for now. Please choose another counter or call them.`
          : `${store.shortName} is not on online ordering yet. Please choose another counter or call them.`,
    };
  }

  const jar = await cookies();
  jar.set(BRANCH_COOKIE, store.slug, branchCookieOptions);

  revalidatePath("/", "layout");

  return { ok: true, shortName: store.shortName };
}
