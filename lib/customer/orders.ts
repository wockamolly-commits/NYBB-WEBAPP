import "server-only";
import { checkoutFailure } from "@/lib/checkout/messages";
import {
  placeOrderInputSchema,
  placedOrderSchema,
  toPlaceOrderPayload,
} from "@/lib/checkout/schema";
import type { CheckoutField, PlaceOrderResult } from "@/lib/checkout/types";
import { withinPlaceOrderAddressLimit } from "@/lib/rate-limit/limiter";
import { supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

/**
 * Placing an order, for any client that can be reduced to a caller.
 *
 * This is a thin thing on purpose, and the thinness is the design. It parses,
 * it calls one RPC, and it turns a machine code into a sentence. It does not
 * price anything, it does not check whether the shop is open, and it does not
 * decide whether a window still has room, because all three of those have to be
 * decided inside the same transaction that writes the order or they are just
 * opinions. Spec section 23 puts `place_order` in the third layer for exactly
 * that reason: anything that must be atomic or authorized lives in Postgres.
 *
 * That property is what makes it safe to expose to a phone at all. Nothing in
 * the input names a peso, so an app build with a patched binary, a proxy in the
 * middle, or a rooted device rewriting its own traffic can ask for different
 * food but cannot ask for a different price.
 *
 * The caller's identity is forwarded to PostgREST and verified there, so
 * `auth.uid()` stamps `orders.user_id` when there is one. Guests use the
 * cookie-free public client. A service-role client is never valid here: it has
 * no customer identity for `auth.uid()` to read.
 */

/** Which input a zod complaint belongs to, so the form can point at it. */
function fieldFor(path: PropertyKey[]): CheckoutField | undefined {
  if (path[0] === "lines") return "cart";
  if (path[0] === "pickupSlotStart") return "slot";
  if (path[0] !== "details") return undefined;
  const detail = path[1];
  return detail === "name" || detail === "phone" || detail === "email" ? detail : undefined;
}

export async function submitOrder(
  input: unknown,
  caller: CustomerCaller,
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
      kind: "unavailable",
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
  if (!(await withinPlaceOrderAddressLimit(caller.address))) {
    return { ok: false, ...checkoutFailure("RATE_LIMITED_ADDRESS") };
  }

  const supabase = await callerClient(caller);
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
