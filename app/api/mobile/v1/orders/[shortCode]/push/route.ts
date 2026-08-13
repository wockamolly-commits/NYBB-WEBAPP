import { registerPushDevice } from "@/lib/customer/push";
import { mobileCaller, mobileError, mobileOk, readMobileBody, trackingToken } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registering a phone to be told about one order.
 *
 * The token is checked in the database, by the same rule get_order_by_tracking
 * uses, so this route decides nothing about who may speak for an order. The
 * body carries the two things this route cannot get from the path or the
 * headers: the Expo push token and the platform it was minted on.
 */
export async function POST(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  const body = await readMobileBody(request);
  if (!body.ok) return body.response;

  const { shortCode } = await context.params;
  const request_ = typeof body.value === "object" && body.value !== null ? body.value : {};
  const result = await registerPushDevice(
    { ...request_, shortCode, trackingToken: trackingToken(request.headers) },
    mobileCaller(request),
  );

  return result.ok ? mobileOk({ registered: true }) : mobileError("conflict", result.error);
}
