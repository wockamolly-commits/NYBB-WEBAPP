import { mobileCaller, mobileError, mobileOk, trackingToken } from "@/lib/mobile/http";
import { readOrderByTracking } from "@/lib/orders/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reading one order back, which is how the app learns anything about state.
 *
 * Every screen that wants to know whether an order is paid, accepted, ready or
 * cancelled asks this, and nothing else. The app never decides those, it never
 * caches them as facts, and it never infers "paid" from having returned from a
 * payment page: the PayMongo webhook writes the payment state and this read is
 * how the phone finds out.
 *
 * The token arrives in a header rather than in the path or the query string,
 * because it is a bearer credential and URLs end up in logs. A signed-in
 * customer with no token can still open their own order, which is what makes
 * order history work without minting a second credential.
 *
 * "Not found" and "wrong token" are the same answer on purpose. Telling them
 * apart would make the short code space worth scraping.
 */
export async function GET(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params;
  const lookup = await readOrderByTracking(
    mobileCaller(request),
    shortCode,
    trackingToken(request.headers),
  );

  if (lookup.state === "found") return mobileOk(lookup.order);
  if (lookup.state === "missing") {
    return mobileError("not_found", "We could not find that order.");
  }

  // The order may well exist. Saying "not found" here would tell a customer
  // their order is gone while it sits safely in a database we cannot reach,
  // and that customer orders again and the kitchen cooks it twice.
  return mobileError("unavailable", "We could not reach that order just now. Please try again.");
}
