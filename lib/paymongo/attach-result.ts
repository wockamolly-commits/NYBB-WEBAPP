export type PayOrderResult =
  | { ok: true; qr: { imageUrl: string } }
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
): PayOrderResult {
  if (qrImageUrl) return { ok: true, qr: { imageUrl: qrImageUrl } };
  if (status === "awaiting_next_action" && redirectUrl) return { ok: true, redirectUrl };
  if (status === "succeeded" || status === "processing") return { ok: true, done: true };
  return { ok: false, error: "That payment was not completed. Please try again." };
}
