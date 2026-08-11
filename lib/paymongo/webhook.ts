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

export function verifyPaymongoSignature(
  rawBody: string,
  header: string,
  secret: string,
  mode: "test" | "live" = process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_live") ? "live" : "test",
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
  type: string;
  paymentIntentId: string | null;
  paymentId: string | null;
} {
  const attributes = payload && typeof payload === "object"
    ? (payload as { data?: { attributes?: { type?: unknown; payment_intent_id?: unknown; data?: unknown } } }).data?.attributes
    : undefined;
  const resource = attributes?.data && typeof attributes.data === "object"
    ? attributes.data as { id?: unknown; attributes?: { payment_intent_id?: unknown } }
    : undefined;
  return {
    type: typeof attributes?.type === "string" ? attributes.type : "",
    paymentIntentId:
      (typeof attributes?.payment_intent_id === "string" ? attributes.payment_intent_id : null)
      ?? (typeof resource?.attributes?.payment_intent_id === "string" ? resource.attributes.payment_intent_id : null),
    paymentId: typeof resource?.id === "string" ? resource.id : null,
  };
}
