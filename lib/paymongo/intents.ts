import "server-only";
import { createHash } from "node:crypto";
import { paymongoFetch } from "./client";
import { getPaymongoPublicKey } from "./config";
import type { OnlineMethod } from "./methods";

const PAYMONGO_METHOD: Record<OnlineMethod, string> = {
  qrph: "qrph",
  gcash: "gcash",
  maya: "paymaya",
  card: "card",
};

export function paymongoIdempotencyKey(
  operation: "intent" | "payment-method" | "attach",
  ...parts: string[]
): string {
  const digest = createHash("sha256").update(parts.join("\u001f")).digest("hex");
  return `nybb:${operation}:${digest}`;
}

export function buildPaymentIntentPayload(input: {
  amountCents: number;
  description: string;
  method: OnlineMethod;
  metadata: Record<string, string>;
}) {
  return {
    data: {
      attributes: {
        amount: input.amountCents,
        currency: "PHP",
        description: input.description,
        capture_type: "automatic",
        payment_method_allowed: [PAYMONGO_METHOD[input.method]],
        payment_method_options: { card: { request_three_d_secure: "any" } },
        metadata: input.metadata,
      },
    },
  };
}

export async function createPaymentIntent(input: {
  amountCents: number;
  description: string;
  method: OnlineMethod;
  metadata: Record<string, string>;
  idempotencyKey: string;
}): Promise<{ id: string; clientKey: string; status: string }> {
  const data = await paymongoFetch<{
    id: string;
    attributes: { client_key: string; status: string };
  }>("/payment_intents", {
    method: "POST",
    body: buildPaymentIntentPayload(input),
    idempotencyKey: input.idempotencyKey,
  });
  return { id: data.id, clientKey: data.attributes.client_key, status: data.attributes.status };
}

export async function getPaymentIntent(intentId: string): Promise<{
  id: string;
  clientKey: string;
  status: string;
}> {
  const data = await paymongoFetch<{
    id: string;
    attributes: { client_key: string; status: string };
  }>(`/payment_intents/${encodeURIComponent(intentId)}`);
  return { id: data.id, clientKey: data.attributes.client_key, status: data.attributes.status };
}

export async function createOnlinePaymentMethod(input: {
  method: Exclude<OnlineMethod, "card">;
  name: string;
  email: string | null;
  phone: string;
  idempotencyKey: string;
}): Promise<{ id: string }> {
  const key = getPaymongoPublicKey();
  if (!key) throw new Error("PayMongo public key not configured");
  return paymongoFetch<{ id: string }>("/payment_methods", {
    method: "POST",
    key,
    idempotencyKey: input.idempotencyKey,
    body: {
      data: {
        attributes: {
          type: PAYMONGO_METHOD[input.method],
          billing: { name: input.name, email: input.email ?? undefined, phone: input.phone },
        },
      },
    },
  });
}

export async function attachPaymentIntent(input: {
  intentId: string;
  paymentMethodId: string;
  clientKey: string;
  returnUrl: string;
  idempotencyKey: string;
}): Promise<{ status: string; qrImageUrl: string | null; redirectUrl: string | null; paymentId: string | null }> {
  const data = await paymongoFetch<{
    attributes: {
      status: string;
      next_action?: { code?: { image_url?: string }; redirect?: { url?: string } } | null;
      payments?: { id: string }[];
    };
  }>(`/payment_intents/${input.intentId}/attach`, {
    method: "POST",
    idempotencyKey: input.idempotencyKey,
    body: {
      data: {
        attributes: {
          payment_method: input.paymentMethodId,
          client_key: input.clientKey,
          return_url: input.returnUrl,
        },
      },
    },
  });
  return {
    status: data.attributes.status,
    qrImageUrl: data.attributes.next_action?.code?.image_url ?? null,
    redirectUrl: data.attributes.next_action?.redirect?.url ?? null,
    paymentId: data.attributes.payments?.[0]?.id ?? null,
  };
}
