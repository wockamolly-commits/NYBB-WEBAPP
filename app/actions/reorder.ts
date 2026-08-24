"use server";

import { z } from "zod";
import { rebuildCartLines, type ReorderActionResult } from "@/lib/cart/reorder";
import { getStorefrontMenu } from "@/lib/menu";
import {
  pastLinesForSignedInOrder,
  pastLinesForTrackedOrder,
} from "@/lib/orders/past-lines";

/**
 * Rebuild a past order into cart lines.
 *
 * A read, start to finish. It places no order, changes no order, charges
 * nobody, and does not touch the cart: the cart lives in localStorage, so only
 * the browser may write it. This hands back lines and a report, and the client
 * decides what to do with them.
 */

const inputSchema = z.object({
  shortCode: z.string().min(1).max(32),
  token: z.string().min(1).max(256).optional(),
});

export async function reorder(input: {
  shortCode: string;
  token?: string;
}): Promise<ReorderActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That order could not be read." };
  }

  const { shortCode, token } = parsed.data;

  // Signed in first. A signed-in customer holding their own tracking link
  // should still be answered as themselves rather than through the token.
  //
  // An empty result also falls through to the token, not just null. The
  // signed-in read filters on orders.user_id through an inner join, and RLS
  // stacked on the same check, so a code that is not this customer's and a
  // code that does not exist both come back as zero rows rather than an
  // error (see pastLinesForSignedInOrder's comment). Treating null as the
  // only fallback trigger would mean a signed-in guest opening a tracking
  // link for an order placed before they had an account never reaches the
  // token read at all.
  let past = await pastLinesForSignedInOrder(shortCode);
  if ((past === null || past.length === 0) && token) {
    past = await pastLinesForTrackedOrder(shortCode, token);
  }

  if (!past || past.length === 0) {
    // Deliberately one message for "no such order", "not yours", "the read
    // failed" and "no row matched this caller". An empty array here does not
    // mean the order was empty (place_order never creates one with no
    // items); it means nothing matched this caller, which is overwhelmingly
    // "not yours" or "no such code". Telling somebody an order exists and is
    // empty when it is actually somebody else's order is both misleading and
    // a small disclosure, so every failure mode collapses to this one
    // message and a short code stays not worth guessing at.
    return { ok: false, error: "That order could not be read." };
  }

  // Guarded, unlike the page components that call getStorefrontMenu()
  // unguarded elsewhere in this codebase. Those are fine: a throw there
  // reaches Next's error boundary and renders an error page, a reasonable
  // outcome for a page. This is a Server Action invoked from a client
  // transition inside startTransition, and a throw here rejects the promise
  // instead of returning the typed result the button is built to render. Do
  // not "tidy" this back to match the page call sites; the difference is
  // deliberate.
  let categories;
  try {
    ({ categories } = await getStorefrontMenu());
  } catch (error) {
    // The token is out of scope by this point in the function and stays out
    // of scope here: only the underlying error is logged, never anything
    // from the caller's input.
    console.error("[reorder] menu read failed:", error);
    return { ok: false, error: "That order could not be read." };
  }

  const { lines, skipped } = rebuildCartLines(categories, past);

  return { ok: true, lines, skipped };
}
