import { hasCronAuthorization } from "@/lib/cron/authorization";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import { drainPushQueue } from "@/lib/push/drain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Releases pickup capacity for online payments that were never completed,
 * then drains whatever push notification that sweep queued (0039: the sweep
 * runs on pg_cron and cannot send one itself). The sweep also still runs on
 * pg_cron every five minutes on its own; this route remains the drain,
 * whether pg_cron's schedule triggers it or somebody runs it by hand.
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
