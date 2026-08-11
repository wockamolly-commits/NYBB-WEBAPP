import "server-only";

import { z } from "zod";
import { enabledOnlineMethods, type OnlineMethod } from "@/lib/paymongo/methods";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";

const publicSettingsSchema = z.object({
  paymongo_enabled: z.boolean().optional(),
  paymongo_methods: z.record(z.string(), z.boolean()).optional(),
});

/** The payment rails checkout may display. The database remains authoritative. */
export async function getCheckoutPaymentMethods(): Promise<OnlineMethod[]> {
  if (!supabaseConfigured()) return [];
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
