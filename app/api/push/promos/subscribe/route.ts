import { subscribeToPromos } from "@/lib/customer/promo-push";
import { cookieCaller } from "@/lib/customer/cookie-caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A browser asking to be told when a promo starts.
 *
 * This route decides nothing. `register_promo_push_subscription` (0075)
 * refuses while `vouchers_enabled` is off and refuses an endpoint belonging to
 * the staff audience, so both the "there is nothing to subscribe to" case and
 * the counter-tablet case are answered by the database rather than by anything
 * written here.
 *
 * One shape of failure for every cause, the same posture the order route
 * takes: a browser cannot act on the difference, and the difference is worth
 * something to whoever is probing this.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const result = await subscribeToPromos(body, await cookieCaller());
  return result.ok
    ? Response.json({ subscribed: true })
    : Response.json({ error: result.error }, { status: 409 });
}
