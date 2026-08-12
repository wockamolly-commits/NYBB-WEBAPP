import type { PlaceOrderResult } from "@/lib/checkout/types";
import { submitOrder } from "@/lib/customer/orders";
import type { MobileErrorCode } from "@/lib/mobile/contract";
import { mobileCaller, mobileFailure, mobileOk, readMobileBody } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Placing an order from the app.
 *
 * The body is `PlaceOrderInput` and nothing else. There is no price in it, no
 * total, and no branch price list: `place_order` resolves every peso inside the
 * transaction that reserves the pickup window, so this endpoint could be called
 * with a hand-written payload all day and still only ever produce correctly
 * priced orders.
 *
 * The response carries the tracking token, which is a bearer credential and the
 * only way a guest reaches this order again. The app must put it in secure
 * storage, and this server must never log it.
 */
export async function POST(request: Request) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const result = await submitOrder(body.value, mobileCaller(request));
  if (result.ok) return mobileOk(result.order);

  return mobileFailure({
    code: codeFor(result),
    message: result.error,
    ...(result.field ? { field: result.field } : {}),
    ...(result.staleSlots ? { staleSlots: result.staleSlots } : {}),
    ...(result.newAttempt ? { newAttempt: result.newAttempt } : {}),
  });
}

/**
 * A refusal, as a status code.
 *
 * `kind` is set only where the service knows something a status code can carry:
 * a limit, or a database that is not there. A field error is the request's own
 * fault and is a 400. Everything else is the world having moved between the
 * screen loading and the order arriving (a window filling, the shop closing, an
 * item selling out), which is what 409 is for and is not something the app
 * should retry unchanged.
 */
function codeFor(failure: Extract<PlaceOrderResult, { ok: false }>): MobileErrorCode {
  if (failure.kind === "limited") return "rate_limited";
  if (failure.kind === "unavailable") return "unavailable";
  return failure.field ? "invalid_request" : "conflict";
}
