import { after } from "next/server";
import { getPaymongoWebhookSecret } from "@/lib/paymongo/config";
import {
  PAYMONGO_REFUND_EVENT_TYPES,
  parsePaymongoEvent,
  parsePaymongoRefundEvent,
  readWebhookBody,
  verifyPaymongoSignature,
} from "@/lib/paymongo/webhook";
import { notifyCustomer, notifyStaffOfNewOrder } from "@/lib/push/dispatch";
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
  if ((PAYMONGO_REFUND_EVENT_TYPES as readonly string[]).includes(event.type)) {
    const refund = parsePaymongoRefundEvent(payload);
    if (!refund.refundId && !refund.providerRefundId) return Response.json({ received: true });
    if (!adminConfigured()) return Response.json({ received: true });
    const { error } = await createAdminClient().rpc("apply_paymongo_refund", {
      p_refund_id: refund.refundId,
      p_provider_refund_id: refund.providerRefundId,
      p_status: refund.status ?? "pending",
      p_raw: payload,
      p_failure_message: null,
    });
    if (error) {
      console.error("[payment] refund webhook reconciliation failed", error.message);
      return Response.json({ error: "reconciliation failed" }, { status: 500 });
    }
    return Response.json({ received: true });
  }
  const status = event.type === "payment.paid" ? "paid" : event.type === "payment.failed" ? "failed" : null;
  if (!status || !event.paymentIntentId || !adminConfigured()) {
    // A 2xx response tells PayMongo that an irrelevant but valid event does
    // not need another delivery. Configuration failures stay observable in
    // deployment health checks rather than being mistaken for a bad signature.
    return Response.json({ received: true });
  }

  const { data: orderId, error } = await createAdminClient().rpc("apply_paymongo_payment", {
    p_intent_id: event.paymentIntentId,
    p_status: status,
    p_payment_id: event.paymentId ?? "",
    p_raw: payload,
  });
  if (error) {
    console.error("[payment] webhook reconciliation failed", error.message);
    return Response.json({ error: "reconciliation failed" }, { status: 500 });
  }

  // The counter hears about an order when it is paid for, not when it is
  // placed. Under payment first an unpaid order is not on the board at all, so
  // pinging at place_order would ring the tablet for orders that never arrive.
  //
  // A null order id is not only "no such intent". Since 0043 it also means the
  // call changed nothing: a redelivered paid event, or a failure arriving after
  // the payment succeeded. Both are ordinary traffic here, because this handler
  // answers 500 on a reconciliation error and PayMongo retries on any non-2xx.
  // So this guard is what stops a retry ringing the tablet twice.
  //
  if (status === "paid" && orderId) after(notifyStaffOfNewOrder(orderId));
  if (status === "failed" && orderId) after(notifyCustomer(orderId));

  return Response.json({ received: true });
}
