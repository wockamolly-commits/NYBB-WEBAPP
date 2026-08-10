"use server";

import { headers } from "next/headers";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { checkoutFailure } from "@/lib/checkout/messages";
import { clientAddress } from "@/lib/rate-limit/address";
import { withinPlaceOrderAddressLimit } from "@/lib/rate-limit/limiter";
import {
  placeOrderInputSchema,
  placedOrderSchema,
  toPlaceOrderPayload,
} from "@/lib/checkout/schema";
import type { CheckoutField, PlaceOrderInput, PlaceOrderResult } from "@/lib/checkout/types";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { getStorefrontSession } from "@/lib/auth/session";

/**
 * Placing an order, from the browser's side.
 *
 * This is a thin thing on purpose, and the thinness is the design. It parses,
 * it calls one RPC, and it turns a machine code into a sentence. It does not
 * price anything, it does not check whether the shop is open, and it does not
 * decide whether a window still has room, because all three of those have to be
 * decided inside the same transaction that writes the order or they are just
 * opinions. Spec section 23 puts `place_order` in the third layer for exactly
 * that reason: anything that must be atomic or authorized lives in Postgres.
 *
 * The browser forwards its short-lived access token when signed in, and the
 * RPC verifies it through the normal authenticated role so `auth.uid()` stamps
 * `orders.user_id`. A read-only cookie client is the fallback. Neither path can
 * rotate or delete the browser's session during checkout. Guests still use the
 * cookie-free public client. A service-role client is never valid here: it has
 * no customer identity for `auth.uid()` to read.
 *
 * That warning is now load bearing rather than theoretical, because a
 * service-role client does exist in the tree and this file reaches it, one
 * layer down, through the address limiter. `createAdminClient` has no
 * `auth.uid()` at all, so using it for the RPC below would not make orders
 * anonymous by accident, it would make them anonymous by definition.
 *
 * A `"use server"` file may only export async functions. Types, schemas and the
 * message table live in `lib/checkout/` because exporting any of them from here
 * type-checks, passes the unit tests, and then fails `npm run build`.
 */

/** Which input a zod complaint belongs to, so the form can point at it. */
function fieldFor(path: PropertyKey[]): CheckoutField | undefined {
  if (path[0] === "lines") return "cart";
  if (path[0] === "pickupSlotStart") return "slot";
  if (path[0] !== "details") return undefined;
  const detail = path[1];
  return detail === "name" || detail === "phone" || detail === "email" ? detail : undefined;
}

export async function placeOrder(
  input: PlaceOrderInput,
  customerAccessToken?: string | null,
): Promise<PlaceOrderResult> {
  const parsed = placeOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = fieldFor(issue.path);
    // A message written into the schema is customer copy and is shown. A
    // structural complaint ("not a slug", "invalid uuid") is about a request no
    // form could have produced, so it gets the neutral wording instead of zod's.
    return {
      ok: false,
      error: field
        ? issue.message
        : "That order request did not look right. Please refresh the page and try again.",
      ...(field ? { field } : {}),
    };
  }

  // No database is not "no windows" here, it is "this cannot work". The slot
  // picker can honestly answer with an empty grid because no branch is live;
  // there is no equivalent honest answer to an order, and pretending to accept
  // one would be the worst outcome on this screen.
  if (!supabaseConfigured()) {
    return {
      ok: false,
      error:
        "Online ordering is not connected yet. The branches page has the " +
        "phone numbers, and they can take this now.",
    };
  }

  // The address dimension of spec section 22 item 6, and the only part of the
  // rate limit that cannot live in Postgres: the database is talking to
  // PostgREST, not to the customer, so it never sees who connected.
  //
  // Placed here, after the parse and before the RPC, on purpose. A malformed
  // request has already been refused above without touching the database, so
  // spamming garbage costs a caller a zod parse and nothing else; there is no
  // point spending a round trip to count something that was never going to
  // reach an order. What this guards is the expensive call directly below it.
  //
  // It fails open in every direction, including "no service-role key
  // configured", which is the state of every environment until the Supabase
  // project exists. `lib/rate-limit/limiter.ts` has the reasoning and the
  // figures.
  if (!(await withinPlaceOrderAddressLimit(clientAddress(await headers())))) {
    return { ok: false, ...checkoutFailure("RATE_LIMITED_ADDRESS") };
  }

  let supabase: SupabaseClient = createPublicClient();
  if (
    typeof customerAccessToken === "string" &&
    customerAccessToken.length > 0 &&
    customerAccessToken.length <= 4096
  ) {
    supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { accessToken: async () => customerAccessToken },
    );
  } else {
    // A client that did not forward a token may still have a valid cookie.
    // This fallback can read it but cannot rotate or clear it mid-checkout.
    const session = await getStorefrontSession();
    if (session) supabase = session.supabase;
  }

  const { data, error } = await supabase.rpc("place_order", {
    p_payload: toPlaceOrderPayload(parsed.data),
    p_attempt_id: parsed.data.attemptId,
  });

  if (error) {
    return { ok: false, ...checkoutFailure(error.message) };
  }

  const order = placedOrderSchema.safeParse(data);
  if (!order.success) {
    // The order may well exist. Saying "it failed" would be a lie that sends a
    // customer to place it twice, so this says what is actually true: it went
    // through, and we cannot show the code back.
    console.error("[checkout] place_order returned an unreadable result", order.error.issues);
    return {
      ok: false,
      error:
        "The order went through but we could not read the confirmation back. " +
        "Please call the branch with your name before ordering again, so you " +
        "do not end up with two.",
    };
  }

  return { ok: true, order: order.data };
}
