import "server-only";
import { z } from "zod";
import { CHECKOUT_ATTEMPT_PATTERN } from "@/lib/checkout/schema";
import { readOrderByTracking } from "@/lib/orders/reader";
import { normalizeShortCode, normalizeTrackingToken } from "@/lib/orders/tracking";
import { mapAttachResult, type PayOrderResult } from "@/lib/paymongo/attach-result";
import { PaymongoError } from "@/lib/paymongo/client";
import { onlinePaymentsServiceable } from "@/lib/paymongo/config";
import {
  attachPaymentIntent,
  createPaymentIntent,
  createOnlinePaymentMethod,
  getPaymentIntent,
  paymongoIdempotencyKey,
} from "@/lib/paymongo/intents";
import { canPayOnline, isOnlineMethod } from "@/lib/paymongo/methods";
import { mockPaymentsEnabled, paymentSimulationVisible } from "@/lib/paymongo/mock";
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
 * return URL and never a client saying so. The browser resolves payment state
 * by reading the order back.
 */

const paymentRequestSchema = z.object({
  shortCode: z.string(),
  trackingToken: z.string().nullable().optional(),
  paymentAttemptId: z.string().regex(CHECKOUT_ATTEMPT_PATTERN),
  method: z.string(),
});

function unavailable(): PayOrderResult {
  return { ok: false, error: "We could not start that payment. Please try again in a moment." };
}

/**
 * Where PayMongo sends the customer once they are done with the QR.
 *
 * There is one destination and this server builds it. There used to be two,
 * the second being a `scheme://` deep link back into the native app; that app
 * is gone and so is the environment variable that named its scheme.
 */
export function paymentReturnUrl(
  shortCode: string,
  trackingToken: string | null,
): string {
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
  if (!shortCode || !adminConfigured()) return unavailable();

  // Logged, and named, because this branch used to be the quietest failure in
  // the system. `app_settings.paymongo_enabled` is shared by every
  // environment, so switching QR Ph on opened it on a production deployment
  // with no PayMongo keys, where the simulator is hard-disabled. Every press
  // of the pay button returned the generic "try again in a moment" and wrote
  // nothing anywhere, so there was no evidence that this was the branch being
  // taken rather than PayMongo refusing us. Checkout no longer offers a rail
  // this deployment cannot service; an order placed before that fix still
  // reaches here.
  if (!onlinePaymentsServiceable()) {
    console.error(
      "[payment] online payment is switched on in app_settings but this " +
        "deployment cannot service it: no PayMongo keys, and the simulator " +
        "is unavailable outside development",
    );
    return {
      ok: false,
      error:
        "Online payment is not available on this site yet. Please call the " +
        "branch on your order page, and they can take this now.",
    };
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
      returnUrl: paymentReturnUrl(shortCode, trackingToken),
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
    return mapAttachResult(
      attached.status,
      attached.qrImageUrl,
      attached.redirectUrl,
      paymentSimulationVisible() ? attached.qrTestUrl : null,
    );
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
  //
  // Since 0043 a null id can also mean the call was a no-op. This path cannot
  // produce one: the guard above refuses anything whose payment is not still
  // `pending`, so the already-paid early return is unreachable from here. The
  // `?? undefined` below is for the no-matching-intent case, which a race
  // against the expiry sweep could still produce.
  return parsed.data.outcome === "paid"
    ? { ok: true, done: true, orderId: orderId ?? undefined }
    : { ok: false, error: "Mock payment failed. This order was cancelled." };
}
