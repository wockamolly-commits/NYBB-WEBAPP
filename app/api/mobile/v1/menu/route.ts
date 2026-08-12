import { getStorefrontMenu } from "@/lib/menu/storefront";
import { branchSlugParam, mobileError, mobileOk } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The catalog, as the app renders it.
 *
 * The same read model the web storefront uses, from the same `SECURITY DEFINER`
 * function, with the same fallback to the static catalog when no Supabase
 * project is configured. `source` is in the payload so the app can be honest
 * about it: a static menu is a published price list from a build, not a live
 * one, and an order placed against it will be repriced or refused by
 * `place_order` rather than accepted at the price on screen.
 *
 * Prices are here because a menu without them is not a menu. They are for
 * display only. Nothing the app sends back carries one.
 */
export async function GET(request: Request) {
  const branch = branchSlugParam(request);
  if (!branch.ok) return branch.response;

  try {
    return mobileOk(await getStorefrontMenu(branch.value));
  } catch (cause) {
    // Loud for the same reason the reader is loud: a query that fails against a
    // database that really exists is an outage, and serving the static price
    // list instead is how a customer gets charged last quarter's prices.
    console.error("[mobile] menu read failed", cause);
    return mobileError("unavailable", "We could not load the menu just now. Please try again.");
  }
}
