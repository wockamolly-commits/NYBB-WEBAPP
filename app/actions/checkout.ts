"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { cookieCaller } from "@/lib/customer/cookie-caller";
import { submitOrder } from "@/lib/customer/orders";
import type { PlaceOrderInput, PlaceOrderResult } from "@/lib/checkout/types";
import { notifyStaffOfNewOrder } from "@/lib/push/dispatch";
import {
  PROMO_USED_COOKIE,
  parseUsed,
  promoUsedKey,
  promoUsedCookieOptions,
  serializeUsed,
} from "@/lib/promos/used";

/**
 * Placing an order, from the browser's side.
 *
 * There is almost nothing here, and that is the point. Everything this function
 * used to do lives in `lib/customer/orders.ts`: the rate limit, the validation
 * and the refusal messages. What is left is the part that is genuinely about
 * being a browser, turning a cookie jar and a proxy header into a caller, and
 * handing the counter's notification to `after()`. The notification is here
 * for the same reason it is in `app/actions/payment.ts` rather than in the
 * service beside it: `after()` needs a request, and the service is written to
 * have none.
 *
 * That split was originally made so a native app's Route Handler could call the
 * same service with a bearer token. The app is gone and the browser is the only
 * caller now, but the split is kept: the service is where the rules are tested,
 * and folding it back into a Server Action would move them into a file that can
 * only be exercised through Next.
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
  const result = await submitOrder(input, await cookieCaller(customerAccessToken));

  // A counter order is work the moment it exists. Nothing else is going to
  // happen to it before the kitchen acts: `place_order` writes its payment row
  // as `due`, and the money is taken at claim, so there is no webhook coming
  // and no later event that could stand in for this one. Spec section 15 says
  // staff push fires on a new order landing, and for this rail landing is all
  // there is.
  //
  // An online order is deliberately NOT announced here. It is placed unpaid,
  // the expiry sweep cancels it if the customer walks away from the payment
  // page, and telling a kitchen to start cooking something nobody has paid for
  // is the business rule this project has held throughout. That order is
  // announced from the webhook, on `paid`, and that call site stays where it
  // is.
  //
  // after(), not a detached promise: on Vercel a promise the response does not
  // wait for is killed mid-flight, and the ECONNRESET surfaces on an unrelated
  // later request. Spec section 15, hard rule 2.
  //
  // Sending twice for one order is prevented in the database rather than here,
  // because a replayed Server Action reaches this line with a result identical
  // to the first one's. See `claim_staff_new_order_notice` (0048).
  if (result.ok && result.order.paymentMethod === "counter") {
    after(notifyStaffOfNewOrder(result.order.orderId));
  }

  // REMEMBER THAT THIS BROWSER SPENT THE CODE, so the bar stops advertising a
  // promo the customer has already had and checkout stops refusing them over a
  // cap they could not see.
  //
  // Recorded here rather than read back from anywhere, because this is the one
  // moment the browser and the outcome are in the same place. `place_order`
  // raises on a code it will not take, so a successful order carrying a code is
  // an order that got the discount.
  //
  // It is deliberately the cruder of the two mechanisms. For a signed-in
  // customer `list_customer_promos` (0076) counts redemptions instead, which
  // works on their other devices and, because 0065 deletes the redemption row
  // when an order is cancelled, gives the promo back when an order falls over.
  // This cookie cannot do that: an online order is placed unpaid, so a guest
  // who abandons the payment page has this code hidden from them although the
  // expiry sweep handed it back. Hiding one promo from one browser is the
  // smaller fault, and the code still works if they type it.
  //
  // The code is read defensively because `input` here is whatever the browser
  // sent: `submitOrder` is what validates it, and its schema is the thing that
  // gives `voucherCode` a default. Reaching into it as though it were already
  // a string is how this first shipped, and six existing tests that build a
  // payload without the field said so immediately.
  //
  // The discount is the server's own answer and is what actually proves the
  // code was taken. `resolve_voucher` refuses a code worth nothing with
  // VOUCHER_NO_DISCOUNT, so the two conditions agree, and gating on both means
  // nothing is recorded for an order that somehow carried a code without
  // getting anything off.
  const usedCode = typeof input.voucherCode === "string" ? input.voucherCode.trim() : "";

  if (result.ok && usedCode !== "" && result.order.discountCents > 0) {
    const jar = await cookies();
    jar.set(
      PROMO_USED_COOKIE,
      serializeUsed([
        promoUsedKey(usedCode),
        ...parseUsed(jar.get(PROMO_USED_COOKIE)?.value),
      ]),
      promoUsedCookieOptions,
    );
  }

  return result;
}
