"use server";

import { cookieCaller } from "@/lib/customer/cookie-caller";
import { submitOrder } from "@/lib/customer/orders";
import type { PlaceOrderInput, PlaceOrderResult } from "@/lib/checkout/types";

/**
 * Placing an order, from the browser's side.
 *
 * There is almost nothing here now, and that is the point. Everything this
 * function used to do lives in `lib/customer/orders.ts`, where the mobile API
 * calls the same code with the same rate limit, the same validation and the
 * same refusal messages. What is left is the part that is genuinely about being
 * a browser: turning a cookie jar and a proxy header into a caller.
 *
 * The browser forwards its short-lived access token when signed in, and a
 * read-only cookie client is the fallback. Neither path can rotate or delete
 * the browser's session during checkout.
 *
 * A `"use server"` file may only export async functions. Types, schemas and the
 * message table live in `lib/checkout/` because exporting any of them from here
 * type-checks, passes the unit tests, and then fails `npm run build`.
 */
export async function placeOrder(
  input: PlaceOrderInput,
  customerAccessToken?: string | null,
): Promise<PlaceOrderResult> {
  return submitOrder(input, await cookieCaller(customerAccessToken));
}
