import { unsubscribeFromPromos } from "@/lib/customer/promo-push";
import { cookieCaller } from "@/lib/customer/cookie-caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A browser asking to stop hearing about promos.
 *
 * A POST rather than a GET or a DELETE with the endpoint in the path, because
 * a push endpoint is a device credential and has no business in an access log,
 * a referrer header or a browser history entry.
 *
 * It drops the promo consent and nothing else. The subscription row survives,
 * because the same device may be waiting on an order, and somebody turning off
 * adverts has not asked to stop being told their food is ready.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const result = await unsubscribeFromPromos(body, await cookieCaller());
  return result.ok
    ? Response.json({ subscribed: false })
    : Response.json({ error: result.error }, { status: 409 });
}
