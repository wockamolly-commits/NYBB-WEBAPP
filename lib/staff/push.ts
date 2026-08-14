import "server-only";
import { z } from "zod";
import { createStaffClient, supabaseConfigured } from "@/lib/supabase/server";

const unavailable = "We could not turn on alerts on this device. Please try again.";

export const staffSubscriptionSchema = z.object({
  endpoint: z.url().max(512),
  p256dh: z.string().min(1).max(255),
  auth: z.string().min(1).max(255),
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
  if (!parsed.success || !supabaseConfigured()) {
    return { ok: false, error: unavailable };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("register_staff_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth_key: parsed.data.auth,
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
