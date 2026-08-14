import "server-only";
import { z } from "zod";
import { createStaffClient, supabaseConfigured } from "@/lib/supabase/server";

const unavailable = "We could not turn on alerts on this device. Please try again.";

/**
 * The shape a browser actually sends, which is not the shape it is convenient
 * to write down.
 *
 * `PushSubscription.toJSON()` nests the two keys under `keys`, alongside an
 * `expirationTime` nothing here wants. The first cut of this schema expected
 * `p256dh` and `auth` at the top level, which is the shape the DATABASE
 * function takes, and it passed a unit test written to the same assumption
 * while refusing every real subscription with a 409 that named no cause. The
 * browser's serialization is the contract; flattening happens below.
 *
 * `expirationTime` is deliberately not declared, and `z.object` ignores what it
 * is not told about, so a browser that adds a field does not start failing.
 */
export const staffSubscriptionSchema = z.object({
  endpoint: z.url().max(512),
  keys: z.object({
    p256dh: z.string().min(1).max(255),
    auth: z.string().min(1).max(255),
  }),
});

export type StaffSubscriptionResult = { ok: true } | { ok: false; error: string };

/**
 * A counter tablet asking to be told about new orders.
 *
 * The staff client, not the admin one: `register_staff_push_subscription`
 * reads `auth.uid()` and then asks `current_staff_has_permission('orders:view')`
 * about that person, so the caller has to BE the staff member. Going through
 * the admin client would hand the permission check a null uid and turn a
 * database decision into one this file makes, which is the shape of bug the
 * whole RLS-first arrangement exists to prevent.
 *
 * Nothing here is logged but the failure itself. A push subscription's keys
 * are what let anyone send to that device, so they belong in the same class as
 * a tracking token: passed through, never printed.
 */
export async function registerStaffSubscription(input: unknown): Promise<StaffSubscriptionResult> {
  const parsed = staffSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    // Which fields, never their values: `issues` names paths and constraints,
    // and the values here are what let anyone send to that device. Without
    // this line a shape mismatch is a 409 with no cause anywhere, which is
    // exactly how the nested-keys bug above reached a browser.
    console.error("[push] staff subscription body rejected", parsed.error.issues);
    return { ok: false, error: unavailable };
  }
  if (!supabaseConfigured()) return { ok: false, error: unavailable };

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("register_staff_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth_key: parsed.data.keys.auth,
  });

  if (error) {
    console.error(`[push] staff subscription failed: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  // false is the function refusing: no session, or no orders:view. Both are
  // the same answer to the tablet, which cannot fix either by retrying.
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
