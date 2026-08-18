import { hasCronAuthorization } from "@/lib/cron/authorization";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import { drainPushQueue } from "@/lib/push/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Releases pickup capacity for online payments that were never completed, then
 * drains whatever push notification that sweep queued.
 *
 * `0039`'s sweep cancels an order from inside a pg_cron job, deliberately,
 * because cancellation cannot depend on Vercel or an HTTP round trip. It cannot
 * send a push itself for the same reason, so it inserts a `notifications` row
 * and this route turns that row into an actual notification. The sweep also
 * still runs on pg_cron every five minutes on its own; this route remains the
 * drain, whether pg_cron triggers it or somebody runs it by hand.
 *
 * The drain was deleted with the mobile app on 2026-08-17, because the only
 * transport it had was Expo. Rows queued between then and now are still there,
 * and the first run of this route after deployment will send them. That is the
 * intended behaviour: a customer whose order was cancelled for non-payment is
 * better told late than never.
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

  const drained = await drainPushQueue();
  return Response.json(
    { expired: data, ...drained },
    { headers: { "Cache-Control": "no-store" } },
  );
}
