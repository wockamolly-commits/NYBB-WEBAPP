import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { mapAttachResult } from "@/lib/paymongo/attach-result";
import { buildPaymentIntentPayload, paymongoIdempotencyKey } from "@/lib/paymongo/intents";
import { canPayOnline, enabledOnlineMethods } from "@/lib/paymongo/methods";
import { parsePaymongoEvent, verifyPaymongoSignature } from "@/lib/paymongo/webhook";

describe("PayMongo payment helpers", () => {
  it("shows only enabled methods, in the payment provider's intended order", () => {
    expect(enabledOnlineMethods({ maya: true, qrph: true }, true)).toEqual(["qrph", "maya"]);
    expect(enabledOnlineMethods({ qrph: true }, false)).toEqual([]);
  });

  it("uses the provider minimum and includes only the chosen rail in an intent", () => {
    expect(canPayOnline(99, "qrph")).toBe(false);
    expect(canPayOnline(100, "qrph")).toBe(true);
    expect(buildPaymentIntentPayload({
      amountCents: 32900,
      description: "NYBB NY-ABC234",
      method: "qrph",
      metadata: { order_id: "order" },
    }).data.attributes.payment_method_allowed).toEqual(["qrph"]);
  });

  it("derives a stable, opaque idempotency key", () => {
    expect(paymongoIdempotencyKey("intent", "payment-id"))
      .toBe(paymongoIdempotencyKey("intent", "payment-id"));
    expect(paymongoIdempotencyKey("intent", "payment-id"))
      .not.toBe(paymongoIdempotencyKey("attach", "payment-id"));
  });

  it("maps QR, redirect, and completed attachment outcomes", () => {
    expect(mapAttachResult("awaiting_next_action", "https://qr.example", null))
      .toEqual({ ok: true, qr: { imageUrl: "https://qr.example" } });
    expect(mapAttachResult("awaiting_next_action", null, "https://wallet.example"))
      .toEqual({ ok: true, redirectUrl: "https://wallet.example" });
    expect(mapAttachResult("succeeded", null, null)).toEqual({ ok: true, done: true });
  });

  it("accepts only a current, constant-time-comparable signature", () => {
    const body = '{"ok":true}';
    const timestamp = "1000";
    const signature = createHmac("sha256", "whsec_test").update(`${timestamp}.${body}`).digest("hex");
    expect(verifyPaymongoSignature(body, `t=${timestamp},te=${signature}`, "whsec_test", "test", 1001)).toBe(true);
    expect(verifyPaymongoSignature(body, `t=${timestamp},te=wrong`, "whsec_test", "test", 1001)).toBe(false);
    expect(verifyPaymongoSignature(body, `t=${timestamp},te=${signature}`, "whsec_test", "test", 2000)).toBe(false);
  });

  it("extracts the payment identifiers from a payment event", () => {
    expect(parsePaymongoEvent({
      data: { attributes: { type: "payment.paid", data: { id: "pay_1", attributes: { payment_intent_id: "pi_1" } } } },
    })).toEqual({ type: "payment.paid", paymentIntentId: "pi_1", paymentId: "pay_1" });
  });
});
