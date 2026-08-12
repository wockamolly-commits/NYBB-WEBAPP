import { startPayment } from "@/lib/customer/payment";
import type { MobilePaymentStart } from "@/lib/mobile/contract";
import {
  mobileCaller,
  mobileError,
  mobileOk,
  readMobileBody,
  trackingToken,
} from "@/lib/mobile/http";
import type { PayOrderResult } from "@/lib/paymongo/attach-result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Starting a payment for an order the app has already placed.
 *
 * The app sends which rail it wants and one attempt id. It does not send an
 * amount, and there is nowhere in this request for one: the amount comes from
 * the `payments` row the order created, and whether that rail is allowed at all
 * comes from `app_settings`. The channel is pinned to `app` here rather than
 * read from the body, so the return URL is always a deep link this server
 * built. A caller-supplied return address would be an open redirect with a
 * payment attached to it.
 *
 * What comes back is an instruction, not a result. Whether the order is paid is
 * decided by the PayMongo webhook and read back through the order endpoint.
 */
export async function POST(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const { shortCode } = await context.params;
  const request_ = typeof body.value === "object" && body.value !== null ? body.value : {};
  const result = await startPayment(
    {
      ...request_,
      shortCode,
      trackingToken: trackingToken(request.headers),
      channel: "app",
    },
    mobileCaller(request),
  );

  if (!result.ok) return mobileError("conflict", result.error);
  return mobileOk(nextAction(result));
}

function nextAction(result: Extract<PayOrderResult, { ok: true }>): MobilePaymentStart {
  if ("qr" in result) return { action: "qr", qrImageUrl: result.qr.imageUrl };
  if ("redirectUrl" in result) return { action: "redirect", redirectUrl: result.redirectUrl };
  if ("mock" in result) return { action: "mock" };
  return { action: "done" };
}
