"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { CHECKOUT_ATTEMPT_PATTERN } from "@/lib/checkout/schema";
import { getOrderByTracking } from "@/lib/orders/reader";
import { normalizeShortCode, normalizeTrackingToken } from "@/lib/orders/tracking";
import { mapAttachResult, type PayOrderResult } from "@/lib/paymongo/attach-result";
import { PaymongoError } from "@/lib/paymongo/client";
import { paymongoConfigured } from "@/lib/paymongo/config";
import {
  attachPaymentIntent,
  createPaymentIntent,
  createOnlinePaymentMethod,
  getPaymentIntent,
  paymongoIdempotencyKey,
} from "@/lib/paymongo/intents";
import { canPayOnline, isOnlineMethod } from "@/lib/paymongo/methods";
import { clientAddress } from "@/lib/rate-limit/address";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { siteUrl } from "@/lib/site-url";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";

const paymentRequestSchema = z.object({
  shortCode: z.string(),
  trackingToken: z.string().nullable().optional(),
  paymentAttemptId: z.string().regex(CHECKOUT_ATTEMPT_PATTERN),
  method: z.string(),
});

function unavailable(): PayOrderResult {
  return { ok: false, error: "We could not start that payment. Please try again in a moment." };
}

function paymentReturnUrl(shortCode: string, trackingToken: string | null): string {
  const url = new URL(`/order/${encodeURIComponent(shortCode)}`, siteUrl());
  if (trackingToken) url.searchParams.set("t", trackingToken);
  return url.toString();
}

/** Starts a QR Ph payment after the customer has already placed an order. */
export async function payOrder(input: unknown): Promise<PayOrderResult> {
  const parsed = paymentRequestSchema.safeParse(input);
  if (!parsed.success || !isOnlineMethod(parsed.data.method)) return unavailable();

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken);
  if (!shortCode || !paymongoConfigured() || !adminConfigured()) return unavailable();

  if (
    !(await withinAddressLimit({
      action: "pay_order",
      address: clientAddress(await headers()),
      limit: 10,
      windowSeconds: 600,
    }))
  ) {
    return { ok: false, error: "Please wait a few minutes before trying that payment again." };
  }

  // This preserves the same guest-token or signed-in-owner authorization as
  // the tracking page before the service-role client reads payment metadata.
  const lookup = await getOrderByTracking(shortCode, trackingToken);
  if (lookup.state !== "found") return unavailable();
  if (lookup.order.status !== "pending") {
    return { ok: false, error: "This order is no longer waiting for payment." };
  }

  const admin = createAdminClient();
  const { data: settings, error: settingsError } = await admin
    .from("app_settings")
    .select("paymongo_enabled, paymongo_methods")
    .eq("id", 1)
    .single();
  if (settingsError || !settings) return unavailable();

  // The tracking RPC deliberately does not reveal an internal id. Read the
  // order by its public short code only after that authorization has passed.
  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .select("id, customer_name, customer_email, customer_phone, total_cents, payments ( id, provider, method, status, amount_cents, provider_intent_id )")
    .eq("short_code", shortCode)
    .single();
  if (orderError || !orderRow) return unavailable();

  const orderPayment = Array.isArray(orderRow.payments) ? orderRow.payments[0] : orderRow.payments;
  if (!orderPayment || orderPayment.provider !== "paymongo" || orderPayment.method !== parsed.data.method) {
    return unavailable();
  }
  if (orderPayment.status === "paid") return { ok: true, done: true };
  if (orderPayment.status !== "pending") {
    return { ok: false, error: "This payment link has expired. Please place a new order." };
  }

  const methodEnabled =
    settings.paymongo_enabled === true &&
    settings.paymongo_methods !== null &&
    typeof settings.paymongo_methods === "object" &&
    (settings.paymongo_methods as Record<string, unknown>)[parsed.data.method] === true;
  if (!methodEnabled || !canPayOnline(Number(orderPayment.amount_cents), parsed.data.method)) {
    return { ok: false, error: "This order cannot use that online payment method." };
  }

  try {
    const intent = orderPayment.provider_intent_id
      ? await getPaymentIntent(orderPayment.provider_intent_id)
      : await createPaymentIntent({
          amountCents: Number(orderPayment.amount_cents),
          description: `NY Buffalo Brad's order ${shortCode}`,
          method: parsed.data.method,
          metadata: { order_short_code: shortCode, order_id: orderRow.id },
          idempotencyKey: paymongoIdempotencyKey("intent", String(orderPayment.id)),
        });

    if (!orderPayment.provider_intent_id) {
      const { error } = await admin
        .from("payments")
        .update({ provider_intent_id: intent.id })
        .eq("id", orderPayment.id)
        .is("provider_intent_id", null);
      if (error) return unavailable();
    }

    if (parsed.data.method === "card") {
      return { ok: false, error: "That online payment method is not available yet." };
    }
    const paymentMethod = await createOnlinePaymentMethod({
      method: parsed.data.method,
      name: orderRow.customer_name,
      email: orderRow.customer_email,
      phone: orderRow.customer_phone,
      idempotencyKey: paymongoIdempotencyKey(
        "payment-method",
        String(orderPayment.id),
        parsed.data.paymentAttemptId,
      ),
    });
    const attached = await attachPaymentIntent({
      intentId: intent.id,
      paymentMethodId: paymentMethod.id,
      clientKey: intent.clientKey,
      returnUrl: paymentReturnUrl(shortCode, trackingToken),
      idempotencyKey: paymongoIdempotencyKey("attach", String(orderPayment.id), parsed.data.paymentAttemptId),
    });
    const { error } = await admin
      .from("payments")
      .update({
        provider_intent_id: intent.id,
        provider_source_id: paymentMethod.id,
        provider_payment_id: attached.paymentId,
      })
      .eq("id", orderPayment.id)
      .eq("status", "pending");
    if (error) return unavailable();
    return mapAttachResult(attached.status, attached.qrImageUrl, attached.redirectUrl);
  } catch (cause) {
    if (cause instanceof PaymongoError) {
      console.error("[payment] PayMongo request failed", cause.status, cause.code);
    } else {
      console.error("[payment] PayMongo request failed", cause);
    }
    return unavailable();
  }
}
