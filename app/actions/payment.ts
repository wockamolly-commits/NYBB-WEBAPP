"use server";

import { after } from "next/server";
import { cookieCaller } from "@/lib/customer/cookie-caller";
import { settleMockPayment, startPayment } from "@/lib/customer/payment";
import type { PayOrderResult } from "@/lib/paymongo/attach-result";
import { notifyStaffOfNewOrder } from "@/lib/push/dispatch";

/**
 * Payment, from the browser's side.
 *
 * Both of these are adapters. `lib/customer/payment.ts` holds the
 * authorization, the rate limit, the settings check and every PayMongo call,
 * and this file is only the part that reads a cookie jar. The return URL is
 * built by the server in every case and is never accepted from the client.
 */
export async function payOrder(input: unknown): Promise<PayOrderResult> {
  const request = typeof input === "object" && input !== null ? input : {};
  return startPayment(request, await cookieCaller());
}

/** Applies an intentional development payment result through the webhook RPC. */
export async function completeMockPayment(input: unknown): Promise<PayOrderResult> {
  const request = typeof input === "object" && input !== null ? input : {};
  const result = await settleMockPayment(request, await cookieCaller());
  if (result.ok && "orderId" in result && result.orderId) {
    after(notifyStaffOfNewOrder(result.orderId));
  }
  return result;
}
