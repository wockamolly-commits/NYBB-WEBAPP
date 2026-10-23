"use server";

import { revalidatePath } from "next/cache";
import { acknowledgeReady } from "@/lib/customer/ready-acknowledgement";
import { sessionCaller } from "@/lib/customer/cookie-caller";
import type { CustomerArrivalInput, CustomerArrivalResult } from "@/lib/orders/arrival";
import { normalizeShortCode } from "@/lib/orders/tracking";

/**
 * The browser's way of saying "I'm coming" to a ready order.
 *
 * The decision and the authorization live in
 * `lib/customer/ready-acknowledgement.ts`. The counter's board hears it from its
 * own realtime subscription, so the only thing left here is rebuilding the
 * page the customer is looking at.
 */
export async function acknowledgeReadyOrder(
  input: CustomerArrivalInput,
): Promise<CustomerArrivalResult> {
  const result = await acknowledgeReady(input, sessionCaller());
  if (!result.ok) return result;

  const shortCode = normalizeShortCode(input.shortCode);
  if (shortCode) revalidatePath(`/order/${shortCode}`);
  return result;
}
