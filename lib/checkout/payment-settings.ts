import "server-only";

import { z } from "zod";
import { onlinePaymentsServiceable } from "@/lib/paymongo/config";
import { enabledOnlineMethods, type OnlineMethod } from "@/lib/paymongo/methods";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";

const publicSettingsSchema = z.object({
  paymongo_enabled: z.boolean().optional(),
  paymongo_methods: z.record(z.string(), z.boolean()).optional(),
});

/**
 * The payment rails checkout may display.
 *
 * TWO GATES, AND BOTH ARE REQUIRED. The database is authoritative on whether
 * the business takes a rail at all; this deployment is authoritative on
 * whether it can carry one through. `app_settings` is shared by every
 * environment, so the owner switching QR Ph on switched it on for the
 * production deployment as well, which holds no PayMongo keys and cannot run
 * the simulator. Checkout offered QR Ph, orders were placed on it, and the pay
 * button answered "We could not start that payment. Please try again in a
 * moment." every single time.
 *
 * Offering nothing online is a safe answer rather than a broken one: checkout
 * falls back to paying at the counter, so a customer can still order.
 */
export async function getCheckoutPaymentMethods(): Promise<OnlineMethod[]> {
  if (!supabaseConfigured() || !onlinePaymentsServiceable()) return [];
  const { data, error } = await createPublicClient().rpc("get_public_settings");
  if (error) {
    console.error("[checkout] could not read payment settings", error.message);
    return [];
  }
  const parsed = publicSettingsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[checkout] unreadable payment settings", parsed.error.issues);
    return [];
  }
  return enabledOnlineMethods(parsed.data.paymongo_methods, parsed.data.paymongo_enabled === true);
}
