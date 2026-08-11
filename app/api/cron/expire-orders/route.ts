import { hasCronAuthorization } from "@/lib/cron/authorization";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Releases pickup capacity for online payments that were never completed. */
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
  return Response.json({ expired: data }, { headers: { "Cache-Control": "no-store" } });
}
