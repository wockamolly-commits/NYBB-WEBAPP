import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;
export const PAYMONGO_WEBHOOK_MAX_BYTES = 256 * 1024;

export async function readWebhookBody(request: Request): Promise<string | null> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > PAYMONGO_WEBHOOK_MAX_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > PAYMONGO_WEBHOOK_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

/**
 * Which of PayMongo's two environments this deployment is wired to, from the
 * secret key it calls the API with. The signature header carries one part per
 * environment (`te`, `li`) and every event says which one it came from
 * (`livemode`), and both have to agree with this.
 */
export function paymongoMode(): "test" | "live" {
  return process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_live") ? "live" : "test";
}

export function verifyPaymongoSignature(
  rawBody: string,
  header: string,
  secret: string,
  mode: "test" | "live" = paymongoMode(),
  nowSeconds: number = Math.floor(Date.now() / 1_000),
): boolean {
  if (!header || !secret) return false;
  const values = Object.fromEntries(header.split(",").map((part) => {
    const [key, value] = part.split("=", 2);
    return [key?.trim(), value?.trim()];
  })) as { t?: string; te?: string; li?: string };
  const timestamp = values.t;
  const provided = mode === "live" ? values.li : values.te;
  if (!timestamp || !provided || !/^\d+$/.test(timestamp)) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(nowSeconds - seconds) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export function parsePaymongoEvent(payload: unknown): {
  /** The event's own id (`evt_...`), which PayMongo keeps across redeliveries. */
  eventId: string | null;
  type: string;
  /** Null when the event does not say, which PayMongo's documented events always do. */
  livemode: boolean | null;
  paymentIntentId: string | null;
  paymentId: string | null;
} {
  const envelope = payload && typeof payload === "object"
    ? (payload as { data?: { id?: unknown; attributes?: { type?: unknown; livemode?: unknown; payment_intent_id?: unknown; data?: unknown } } }).data
    : undefined;
  const attributes = envelope?.attributes;
  const resource = attributes?.data && typeof attributes.data === "object"
    ? attributes.data as { id?: unknown; attributes?: { payment_intent_id?: unknown } }
    : undefined;
  return {
    eventId:
      typeof envelope?.id === "string" && envelope.id.length > 0 && envelope.id.length <= 255
        ? envelope.id
        : null,
    type: typeof attributes?.type === "string" ? attributes.type : "",
    livemode: typeof attributes?.livemode === "boolean" ? attributes.livemode : null,
    paymentIntentId:
      (typeof attributes?.payment_intent_id === "string" ? attributes.payment_intent_id : null)
      ?? (typeof resource?.attributes?.payment_intent_id === "string" ? resource.attributes.payment_intent_id : null),
    paymentId: typeof resource?.id === "string" ? resource.id : null,
  };
}

export const PAYMONGO_REFUND_EVENT_TYPES = [
  "payment.refunded",
  "payment.refund.updated",
] as const;

export type PaymongoRefundEvent = {
  refundId: string | null;
  providerRefundId: string | null;
  status: "succeeded" | "failed" | "pending" | null;
};

/**
 * PayMongo documents four refund statuses: pending, processing, succeeded and
 * failed. A QR Ph refund waits in `processing` until the customer claims the
 * transfer, so it is read as still pending rather than as unknown.
 */
function refundStatus(value: unknown): PaymongoRefundEvent["status"] {
  if (value === "processing") return "pending";
  return value === "succeeded" || value === "failed" || value === "pending" ? value : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads both documented refund delivery shapes without trusting webhook data. */
export function parsePaymongoRefundEvent(payload: unknown): PaymongoRefundEvent {
  const resource = payload && typeof payload === "object"
    ? (payload as { data?: { attributes?: { data?: unknown } } }).data?.attributes?.data
    : null;
  if (!resource || typeof resource !== "object") {
    return { refundId: null, providerRefundId: null, status: null };
  }
  const item = resource as {
    id?: unknown;
    attributes?: { status?: unknown; metadata?: { refund_id?: unknown }; refunds?: unknown };
  };
  // Our own refund row's id, which lib/paymongo/refunds.ts writes into the
  // metadata. Anything that is not a uuid did not come from there, and passing
  // it on would make the database raise and PayMongo retry it forever.
  const metadataId = typeof item.attributes?.metadata?.refund_id === "string"
    && UUID.test(item.attributes.metadata.refund_id)
    ? item.attributes.metadata.refund_id
    : null;
  const directStatus = refundStatus(item.attributes?.status);
  if (directStatus || metadataId) {
    return {
      refundId: metadataId,
      providerRefundId: typeof item.id === "string" ? item.id : null,
      status: directStatus,
    };
  }
  const nested = Array.isArray(item.attributes?.refunds) ? item.attributes.refunds[0] : null;
  if (!nested || typeof nested !== "object") {
    return { refundId: null, providerRefundId: null, status: null };
  }
  const refund = nested as { id?: unknown; status?: unknown };
  return {
    refundId: null,
    providerRefundId: typeof refund.id === "string" ? refund.id : null,
    status: refundStatus(refund.status),
  };
}
