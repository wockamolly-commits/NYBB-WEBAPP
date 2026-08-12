import { branchSlugParam, mobileError, mobileOk } from "@/lib/mobile/http";
import { getPickupSlots } from "@/lib/slots/reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The pickup windows a branch is currently offering.
 *
 * `get_pickup_slots()` is the authority and the app gets exactly what the web
 * gets, including `unavailableReason`, which is the difference between "the
 * shop is shut" and "every window is full" and is worth showing as itself.
 *
 * The clock is the database's. `p_at` is deliberately not passed anywhere in
 * this codebase, because a clock sent by a client is a clock an attacker
 * chooses, and a phone's clock is wrong more often than a browser's.
 */
export async function GET(request: Request) {
  const branch = branchSlugParam(request);
  if (!branch.ok) return branch.response;

  try {
    return mobileOk(await getPickupSlots(branch.value));
  } catch (cause) {
    console.error("[mobile] pickup slot read failed", cause);
    return mobileError(
      "unavailable",
      "We could not load the pickup times just now. Please try again.",
    );
  }
}
