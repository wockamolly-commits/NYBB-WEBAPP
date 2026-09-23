import "server-only";
import { z } from "zod";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not change your promo alerts. Please try again.";

/**
 * A browser asking to hear about promos, or asking to stop.
 *
 * THE SHAPE IS THE BROWSER'S, NOT THE DATABASE'S. `PushSubscription.toJSON()`
 * nests the keys under `keys`, and the RPC takes them flat.
 * `lib/customer/push.ts` records what happens when a schema is written to the
 * database's shape instead: it passed a unit test written to the same wrong
 * assumption and refused every real subscription with a 409 that named no
 * cause. The browser's serialization is the contract and flattening happens
 * here.
 *
 * NO ORDER, AND THAT IS THE DIFFERENCE FROM ITS NEIGHBOUR. A promo subscriber
 * may never have ordered, so there is no short code to present and nothing to
 * prove. What stops this being a way to register arbitrary endpoints is that
 * an endpoint is an unguessable URL minted by the browser's own push service:
 * somebody who has one already has the device. The database still refuses an
 * endpoint that belongs to the staff audience, which is the check that keeps a
 * counter tablet from being quietly converted.
 */

export const promoSubscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.url().max(512),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export const promoUnsubscribeSchema = z.object({
  endpoint: z.url().max(512),
});

export type PromoPushResult = { ok: true } | { ok: false; error: string };

/** One shape of failure for every cause, the posture the order route takes. */
function refused(): PromoPushResult {
  return { ok: false, error: unavailable };
}

export async function subscribeToPromos(
  input: unknown,
  caller: CustomerCaller,
): Promise<PromoPushResult> {
  const parsed = promoSubscriptionSchema.safeParse(input);
  if (!parsed.success) return refused();
  if (!supabaseConfigured()) return refused();

  // 0047 needs no limiter because a valid short code and tracking token bound
  // it. Nothing bounds this one, so the address dimension is all there is.
  // Ten a minute is far above a person tapping a switch and far below anything
  // worth doing with it. Fails open like every other caller of this limiter.
  if (
    !(await withinAddressLimit({
      action: "promo_push_subscribe",
      address: caller.address,
      limit: 10,
      windowSeconds: 60,
    }))
  ) {
    return refused();
  }

  const { subscription } = parsed.data;
  const supabase = await callerClient(caller);
  const { data, error } = await supabase.rpc("register_promo_push_subscription", {
    p_endpoint: subscription.endpoint,
    p_p256dh: subscription.keys.p256dh,
    p_auth_key: subscription.keys.auth,
  });

  if (error) {
    console.error("[promo-push] subscribe failed", error.message);
    return refused();
  }
  // False is the database refusing: the flag is off, or the endpoint belongs
  // to a counter tablet. Neither is worth describing to the browser.
  return data === true ? { ok: true } : refused();
}

export async function unsubscribeFromPromos(
  input: unknown,
  caller: CustomerCaller,
): Promise<PromoPushResult> {
  const parsed = promoUnsubscribeSchema.safeParse(input);
  if (!parsed.success) return refused();
  if (!supabaseConfigured()) return refused();

  const supabase = await callerClient(caller);
  const { error } = await supabase.rpc("forget_promo_push_subscription", {
    p_endpoint: parsed.data.endpoint,
  });

  if (error) {
    console.error("[promo-push] unsubscribe failed", error.message);
    return refused();
  }
  // Deliberately not rate limited. Somebody should always be able to stop
  // hearing from us, and a limiter on the way out is a limiter on consent
  // being withdrawn.
  return { ok: true };
}
