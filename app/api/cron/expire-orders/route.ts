import { hasCronAuthorization } from "@/lib/cron/authorization";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Releases pickup capacity for online payments that were never completed.
 *
 * The sweep also runs on pg_cron every five minutes on its own. This route is
 * the manual handle on the same function, for when somebody wants it to happen
 * now rather than within five minutes.
 *
 * WHAT THIS ROUTE NO LONGER DOES.
 * ================================================================
 * It used to drain the `notifications` rows 0039's sweep queues, because that
 * sweep runs inside pg_cron and cannot send a push itself. The only thing
 * those rows were ever sent through was the native app's Expo transport, so
 * with the app gone the drain had nothing to deliver and was removed with it.
 *
 * The sweep still writes those rows: 0039 is applied in production and this
 * project is not migrating the database back. They accumulate as `queued` and
 * nothing reads them. That is a slow-growing table, not a broken one, and the
 * cancellation itself (the part a customer's money depends on) happens in the
 * sweep, not in the notification. Whoever adds a customer web push opt in
 * later inherits a queue that is already being filled.
 */
export async function GET(request: Request) {
  if (!hasCronAuthorization(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured()) {
    return Response.json({ error: "order system unavailable" }, { status: 503 });
  }

  const { data, error } = await createAdminClient().rpc("expire_unpaid_online_orders");
  if (error || typeof data !== "number") {
    console.error("[payment] expiry sweep failed", error?.message);
    return Response.json({ error: "expiry sweep failed" }, { status: 500 });
  }

  return Response.json(
    { expired: data },
    { headers: { "Cache-Control": "no-store" } },
  );
}
