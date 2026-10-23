import { cookieCaller } from "@/lib/customer/cookie-caller";
import { readPaymentState } from "@/lib/customer/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A waiting payment screen asking whether it can move on.
 *
 * A POST, so the tracking token travels in a body and never in a URL that an
 * access log would keep. A route rather than a Server Action because this is
 * polled: an action re-renders the route it was called from on every call,
 * and a checkout re-rendering every few seconds underneath a QR code is not
 * something to invite.
 *
 * Every failure is the same 404. A browser can only keep waiting either way,
 * and the difference between them is worth something to whoever is probing.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const state = await readPaymentState(body, await cookieCaller());
  return state
    ? Response.json({ state }, { headers: { "cache-control": "no-store" } })
    : Response.json({ error: "Order not found." }, { status: 404 });
}
