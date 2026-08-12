export type PayOrderResult =
  | { ok: true; qr: { imageUrl: string } }
  | { ok: true; redirectUrl: string }
  | { ok: true; mock: true }
  | { ok: true; done: true }
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
