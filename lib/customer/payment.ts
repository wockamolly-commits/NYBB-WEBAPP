import "server-only";
import { z } from "zod";
import { CHECKOUT_ATTEMPT_PATTERN } from "@/lib/checkout/schema";
import { readOrderByTracking } from "@/lib/orders/reader";
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
import { mockPaymentsEnabled } from "@/lib/paymongo/mock";
import { withinAddressLimit } from "@/lib/rate-limit/limiter";
import { siteUrl } from "@/lib/site-url";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import type { CustomerCaller } from "./caller";

/**
 * Starting a payment for an order that already exists.
 *
 * Every value that decides money is read from the database inside this
 * function: the amount comes from the `payments` row, the enabled methods come
 * from `app_settings`, and whether the order may be paid at all comes from its
 * status. The client contributes three things and they are all references: which
 * order, which rail, and one attempt id that keeps a double tap from becoming
 * two PayMongo payment methods.
 *
 * The customer is authorized before any of that, through the same tracking
 * lookup the order page uses, so the service-role client below is only ever
 * reached by somebody who could already read this order.
 *
 * The final word on whether an order is paid is the PayMongo webhook, never a
 * return URL and never a client saying so. Both the browser and the app resolve
 * payment state by reading the order back.
 */

const paymentRequestSchema = z.object({
  shortCode: z.string(),
  trackingToken: z.string().nullable().optional(),
  paymentAttemptId: z.string().regex(CHECKOUT_ATTEMPT_PATTERN),
  method: z.string(),
  /**
   * Where PayMongo should send the customer back to. Two fixed destinations
   * that this server builds, never a URL from the client: a caller-supplied
   * return address is an open redirect with a payment page attached to it.
   */
  channel: z.enum(["web", "app"]).optional(),
});

function unavailable(): PayOrderResult {
  return { ok: false, error: "We could not start that payment. Please try again in a moment." };
}

/**
 * The app's deep-link scheme, which has to match `apps/customer/app.json`.
 *
 * Validated rather than interpolated blind. This value ends up as the scheme of
 * a URL handed to a payment provider, and an unchecked environment variable is
 * a strange place to allow arbitrary text.
 */
const APP_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;

export function mobileAppScheme(value: string | undefined = process.env.MOBILE_APP_SCHEME): string {
  const scheme = value?.trim().toLowerCase();
  return scheme && APP_SCHEME_PATTERN.test(scheme) ? scheme : "nybb-order";
}

export function paymentReturnUrl(
  channel: "web" | "app",
  shortCode: string,
  trackingToken: string | null,
): string {
  // The app already holds its own tracking token in device storage, so the
  // deep link does not carry one. That is one fewer copy of a bearer credential
  // travelling through a payment provider's redirect chain, and the app can
  // still read the order when it comes back to the foreground.
  if (channel === "app") {
    return `${mobileAppScheme()}://order/${encodeURIComponent(shortCode)}`;
  }

  const url = new URL(`/order/${encodeURIComponent(shortCode)}`, siteUrl());
  if (trackingToken) url.searchParams.set("t", trackingToken);
  return url.toString();
}

/** Starts a QR Ph payment after the customer has already placed an order. */
export async function startPayment(
  input: unknown,
  caller: CustomerCaller,
): Promise<PayOrderResult> {
  const parsed = paymentRequestSchema.safeParse(input);
  if (!parsed.success || !isOnlineMethod(parsed.data.method)) return unavailable();

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken);
  const mockEnabled = mockPaymentsEnabled();
  if (!shortCode || !adminConfigured() || (!mockEnabled && !paymongoConfigured())) {
    return unavailable();
  }

  if (
    !(await withinAddressLimit({
      action: "pay_order",
      address: caller.address,
      limit: 10,
      windowSeconds: 600,
    }))
  ) {
    return { ok: false, error: "Please wait a few minutes before trying that payment again." };
  }

  // This preserves the same guest-token or signed-in-owner authorization as
  // the tracking page before the service-role client reads payment metadata.
  const lookup = await readOrderByTracking(caller, shortCode, trackingToken);
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
    .select(
      "id, customer_name, customer_email, customer_phone, total_cents, payments ( id, provider, method, status, amount_cents, provider_intent_id )",
    )
    .eq("short_code", shortCode)
    .single();
  if (orderError || !orderRow) return unavailable();

  const orderPayment = Array.isArray(orderRow.payments) ? orderRow.payments[0] : orderRow.payments;
  if (
    !orderPayment ||
    orderPayment.provider !== "paymongo" ||
    orderPayment.method !== parsed.data.method
  ) {
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

  if (mockEnabled) {
    const intentId = orderPayment.provider_intent_id ?? `mock_pi_${orderPayment.id}`;
    if (!orderPayment.provider_intent_id) {
      const { error } = await admin
        .from("payments")
        .update({ provider_intent_id: intentId })
        .eq("id", orderPayment.id)
        .is("provider_intent_id", null);
      if (error) return unavailable();
    }
    return { ok: true, mock: true };
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
      returnUrl: paymentReturnUrl(parsed.data.channel ?? "web", shortCode, trackingToken),
      idempotencyKey: paymongoIdempotencyKey(
        "attach",
        String(orderPayment.id),
        parsed.data.paymentAttemptId,
      ),
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

/** Applies an intentional development payment result through the webhook RPC. */
export async function settleMockPayment(
  input: unknown,
  caller: CustomerCaller,
): Promise<PayOrderResult> {
  const parsed = paymentRequestSchema
    .extend({ outcome: z.enum(["paid", "failed"]) })
    .safeParse(input);
  if (!parsed.success || !mockPaymentsEnabled()) return unavailable();

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken);
  if (!shortCode || !adminConfigured()) return unavailable();

  const lookup = await readOrderByTracking(caller, shortCode, trackingToken);
  if (lookup.state !== "found" || lookup.order.status !== "pending") return unavailable();

  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin
    .from("orders")
    .select("payments ( id, provider, status, provider_intent_id )")
    .eq("short_code", shortCode)
    .single();
  if (orderError || !order) return unavailable();

  const payment = Array.isArray(order.payments) ? order.payments[0] : order.payments;
  if (
    !payment ||
    payment.provider !== "paymongo" ||
    payment.status !== "pending" ||
    !payment.provider_intent_id?.startsWith("mock_pi_")
  ) {
    return unavailable();
  }

  const { data: orderId, error } = await admin.rpc("apply_paymongo_payment", {
    p_intent_id: payment.provider_intent_id,
    p_status: parsed.data.outcome,
    p_payment_id: `mock_pay_${payment.id}`,
    p_raw: { provider: "mock", outcome: parsed.data.outcome },
  });
  if (error) {
    console.error("[payment] mock reconciliation failed", error.message);
    return unavailable();
  }
  // The order id travels back to the caller rather than being acted on here:
  // this module is framework-neutral and has no request to hand after() to.
  // Both callers have one, and call notifyStaffOfNewOrder(orderId) themselves.
  return parsed.data.outcome === "paid"
    ? { ok: true, done: true, orderId: orderId ?? undefined }
    : { ok: false, error: "Mock payment failed. This order was cancelled." };
}
