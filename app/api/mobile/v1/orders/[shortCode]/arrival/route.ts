import { signalArrival } from "@/lib/customer/arrival";
import { mobileCaller, mobileError, mobileOk, trackingToken } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "I am here", from a customer standing outside the branch.
 *
 * The only thing the app is trusted with is that somebody pressed the button.
 * `customer_mark_order_arrived` locks the order, repeats the authorization,
 * refuses anything that is not Ready, and makes a second press harmless, so a
 * client that sends this ten times has told the counter one thing ten times.
 */
export async function POST(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params;
  const result = await signalArrival(
    { shortCode, trackingToken: trackingToken(request.headers) },
    mobileCaller(request),
  );

  return result.ok ? mobileOk({ arrived: true }) : mobileError("conflict", result.error);
}
