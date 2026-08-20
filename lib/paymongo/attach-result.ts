export type PayOrderResult =
  // testUrl is PayMongo's own test-mode completion link. It is present only
  // outside production and only under a test key, and the screen that renders
  // it must say plainly that the QR beside it is real and must not be scanned.
  | { ok: true; qr: { imageUrl: string; testUrl?: string } }
  | { ok: true; redirectUrl: string }
  | { ok: true; mock: true }
  // orderId is set only when a caller with a request in flight needs to hand
  // a staff notification to after(): lib/customer/payment.ts's settleMockPayment
  // is the only source of this variant that fills it in.
  | { ok: true; done: true; orderId?: string }
  | { ok: false; error: string };

export function mapAttachResult(
  status: string,
  qrImageUrl: string | null,
  redirectUrl: string | null,
  qrTestUrl: string | null = null,
): PayOrderResult {
  if (qrImageUrl) {
    return { ok: true, qr: { imageUrl: qrImageUrl, ...(qrTestUrl ? { testUrl: qrTestUrl } : {}) } };
  }
  if (status === "awaiting_next_action" && redirectUrl) return { ok: true, redirectUrl };
  if (status === "succeeded" || status === "processing") return { ok: true, done: true };
  return { ok: false, error: "That payment was not completed. Please try again." };
}
