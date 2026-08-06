"use server";

import { checkoutFailure } from "@/lib/checkout/messages";
import {
  placeOrderInputSchema,
  placedOrderSchema,
  toPlaceOrderPayload,
} from "@/lib/checkout/schema";
import type { CheckoutField, PlaceOrderInput, PlaceOrderResult } from "@/lib/checkout/types";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";

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
 * Note which client it uses. `createPublicClient` holds the anon key and never
 * touches a cookie, so a failed token refresh cannot sign a customer out in the
 * middle of checkout, which is the failure spec section 14 warns about in as
 * many words. It also means every order placed today is a guest order, since
 * customer sign-in is the last step of Phase 1. When it lands, this function
 * takes the access token as an argument and builds the client with it, so that
 * `auth.uid()` inside `place_order` stamps `orders.user_id`. It must not switch
 * to a service-role client to achieve that: every order would become a guest
 * order with a key the storefront has no business holding.
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

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
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

  const supabase = createPublicClient();
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
