"use server";

import { revalidatePath } from "next/cache";
import { signalArrival } from "@/lib/customer/arrival";
import { sessionCaller } from "@/lib/customer/cookie-caller";
import type { CustomerArrivalInput, CustomerArrivalResult } from "@/lib/orders/arrival";
import { normalizeShortCode } from "@/lib/orders/tracking";

/**
 * The browser's way of telling the counter a customer is here.
 *
 * The decision and the authorization live in `lib/customer/arrival.ts`, which
 * the mobile API calls too. What is left here is the one thing only a browser
 * needs: the rendered tracking page has to be rebuilt, because it is what the
 * customer is looking at when they press the button.
 */
export async function markCustomerArrived(
  input: CustomerArrivalInput,
): Promise<CustomerArrivalResult> {
  const result = await signalArrival(input, sessionCaller());
  if (!result.ok) return result;

  const shortCode = normalizeShortCode(input.shortCode);
  if (shortCode) revalidatePath(`/order/${shortCode}`);
  return result;
}
