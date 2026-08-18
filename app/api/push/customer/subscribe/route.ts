import { registerCustomerSubscription } from "@/lib/customer/push";
import { cookieCaller } from "@/lib/customer/cookie-caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A customer's browser handing over the subscription it just minted.
 *
 * This route decides nothing. `register_customer_push_subscription` (0047)
 * repeats the tracking-token and owner checks the order page already goes
 * through, so a wrong token, an order that is finished, and an endpoint
 * belonging to the counter tablet are all refused by the database rather than
 * by anything written here.
 *
 * One shape of failure for every cause, deliberately. A browser cannot act on
 * the difference between them, and the difference is worth something to
 * whoever is probing this endpoint.
 *
 * The caller comes from cookies so a signed-in owner works without a tracking
 * token, exactly as the arrival signal does.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const result = await registerCustomerSubscription(body, await cookieCaller());
  return result.ok
    ? Response.json({ registered: true })
    : Response.json({ error: result.error }, { status: 409 });
}
