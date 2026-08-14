import { registerStaffSubscription } from "@/lib/staff/push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The counter tablet handing over the subscription the browser just minted.
 *
 * This route decides nothing. `register_staff_push_subscription` reads the
 * session cookie's `auth.uid()` and asks the same permission resolver every
 * policy asks, so a signed-out browser and a staff member without `orders:view`
 * are both refused by the database rather than by anything written here.
 *
 * One shape of failure for every cause, deliberately: a tablet cannot act on
 * the difference between an expired session, a revoked permission and a
 * malformed subscription, and the difference is worth something to whoever is
 * probing this endpoint.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const result = await registerStaffSubscription(body);
  return result.ok
    ? Response.json({ registered: true })
    : Response.json({ error: result.error }, { status: 409 });
}
