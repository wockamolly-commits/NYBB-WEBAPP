import "server-only";
import { cache } from "react";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient } from "@/lib/customer/caller";
import { cookieCaller } from "@/lib/customer/cookie-caller";
import { promoListSchema, type Promo } from "./schema";

/**
 * What promos to tell this customer about, at this counter.
 *
 * EVERY FAILURE IS AN EMPTY LIST, and that is the whole error policy. A
 * storefront bar is chrome: it appears on the menu, the cart, the about page
 * and everything else, so a read that could throw would be a read that could
 * take the entire site down over an advert. It could also fail open in a
 * subtler way, by rendering a bar around nothing if a missing function or a
 * drifted shape produced a truthy value, which is why the parse is a parse and
 * not a cast. `getCheckoutPaymentMethods` takes the same posture for the same
 * reason.
 *
 * The flag is not read here. `list_customer_promos` returns an empty array
 * while `vouchers_enabled` is off, so there is exactly one place the switch is
 * honoured and no second opinion on this side to drift from it.
 *
 * MEMOISED PER REQUEST, NOT CACHED ACROSS THEM. `cache` is React's per-request
 * memo, the same device `getStoreSelection` uses, and it is here because the
 * bar in the layout and the page below it both ask. It must never become
 * `unstable_cache`, `"use cache"` or a statically rendered page: the reply
 * depends on `auth.uid()`, so a cache keyed on anything less than the signed-in
 * customer would serve one person's loyalty rewards to the next visitor. That
 * is the single most likely way to turn this feature into an incident, and it
 * would look like a harmless performance win.
 */
export const listPromos = cache(async (branchSlug: string | null): Promise<Promo[]> => {
  if (!supabaseConfigured()) return [];

  try {
    const caller = await cookieCaller();

    // Cheaper to abuse than the preview is, because it takes no code and so
    // needs no guessing, and it runs on every storefront page. The ceiling is
    // set for load rather than for secrecy: the public half of the answer is
    // a list the owner is actively putting on posters, and the personal half
    // is keyed on a verified auth.uid() that cannot be enumerated. Fails open
    // like every other caller of this limiter, because a limiter outage must
    // not take the site's chrome with it.
    if (
      !(await withinAddressLimit({
        action: "promo_list",
        address: caller.address,
        limit: 120,
        windowSeconds: 60,
      }))
    ) {
      return [];
    }

    const supabase = await callerClient(caller);
    const { data, error } = await supabase.rpc("list_customer_promos", {
      p_branch_slug: branchSlug,
    });

    if (error) {
      // Includes the case that matters most on the way in: the storefront
      // deployed ahead of migration 0074, where PostgREST answers 404. Spec
      // section 18 makes migrations-before-code a hard rule precisely so this
      // does not happen, and this is what it looks like when it does.
      console.error("promo list failed", error);
      return [];
    }

    const parsed = promoListSchema.safeParse(data);
    if (!parsed.success) {
      // A shape that fails here is a deployed function that has drifted from
      // the code calling it, the same reasoning `voucherVerdictSchema` gives.
      // Much cheaper to find out here than on a bar reading "undefined off".
      console.error("promo list shape drifted", parsed.error);
      return [];
    }

    return parsed.data;
  } catch (cause) {
    console.error("promo list threw", cause);
    return [];
  }
});
