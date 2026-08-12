"use server";

import { cookieCaller } from "@/lib/customer/cookie-caller";
import { settleMockPayment, startPayment } from "@/lib/customer/payment";
import type { PayOrderResult } from "@/lib/paymongo/attach-result";

/**
 * Payment, from the browser's side.
 *
 * Both of these are adapters now. `lib/customer/payment.ts` holds the
 * authorization, the rate limit, the settings check and every PayMongo call,
 * and the mobile API reaches the same code with a bearer token instead of a
 * cookie. The browser channel is pinned here rather than accepted from the
 * client, so a return URL is always one this server built.
 */
export async function payOrder(input: unknown): Promise<PayOrderResult> {
  const request = typeof input === "object" && input !== null ? input : {};
  return startPayment({ ...request, channel: "web" }, await cookieCaller());
}

/** Applies an intentional development payment result through the webhook RPC. */
export async function completeMockPayment(input: unknown): Promise<PayOrderResult> {
  const request = typeof input === "object" && input !== null ? input : {};
  return settleMockPayment({ ...request, channel: "web" }, await cookieCaller());
}
