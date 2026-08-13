import { after } from "next/server";
import { settleMockPayment } from "@/lib/customer/payment";
import {
  mobileCaller,
  mobileError,
  mobileOk,
  readMobileBody,
  trackingToken,
} from "@/lib/mobile/http";
import { mockPaymentsEnabled } from "@/lib/paymongo/mock";
import { notifyStaffOfNewOrder } from "@/lib/push/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The development payment simulator, for a phone that has no QR to scan.
 *
 * `mockPaymentsEnabled()` is false whenever `NODE_ENV` is production, so this
 * cannot be switched on there by an environment variable alone. When it is off
 * the route answers 404 rather than 403: an endpoint that does not exist is a
 * more honest thing to say than an endpoint that exists and refuses, and it
 * gives nothing away.
 *
 * Even here the app does not declare a payment paid. It asks for an outcome and
 * the server applies it through `apply_paymongo_payment`, the same RPC the real
 * webhook uses, so the mock path exercises the real state machine rather than a
 * shortcut around it.
 */
export async function POST(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  if (!mockPaymentsEnabled()) {
    return mobileError("not_found", "That is not available.");
  }

  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const { shortCode } = await context.params;
  const submitted = typeof body.value === "object" && body.value !== null ? body.value : {};
  const result = await settleMockPayment(
    {
      ...submitted,
      shortCode,
      trackingToken: trackingToken(request.headers),
      channel: "app",
    },
    mobileCaller(request),
  );

  if (result.ok && "orderId" in result && result.orderId) {
    after(notifyStaffOfNewOrder(result.orderId));
  }

  return result.ok
    ? mobileOk({ action: "done" as const })
    : mobileError("conflict", result.error);
}
