import { getPaymongoWebhookSecret } from "@/lib/paymongo/config";
import {
  parsePaymongoEvent,
  readWebhookBody,
  verifyPaymongoSignature,
} from "@/lib/paymongo/webhook";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reconciles PayMongo's signed payment webhook with the one payment row. */
export async function POST(request: Request) {
  const raw = await readWebhookBody(request);
  if (raw === null) return Response.json({ error: "payload too large" }, { status: 413 });

  const secret = getPaymongoWebhookSecret();
  const signature = request.headers.get("paymongo-signature") ?? "";
  if (!verifyPaymongoSignature(raw, signature, secret)) {
    return Response.json({ error: "invalid signature" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  const event = parsePaymongoEvent(payload);
  const status = event.type === "payment.paid" ? "paid" : event.type === "payment.failed" ? "failed" : null;
  if (!status || !event.paymentIntentId || !adminConfigured()) {
    // A 2xx response tells PayMongo that an irrelevant but valid event does
    // not need another delivery. Configuration failures stay observable in
    // deployment health checks rather than being mistaken for a bad signature.
    return Response.json({ received: true });
  }

  const { error } = await createAdminClient().rpc("apply_paymongo_payment", {
    p_intent_id: event.paymentIntentId,
    p_status: status,
    p_payment_id: event.paymentId ?? "",
    p_raw: payload,
  });
  if (error) {
    console.error("[payment] webhook reconciliation failed", error.message);
    return Response.json({ error: "reconciliation failed" }, { status: 500 });
  }

  return Response.json({ received: true });
}
