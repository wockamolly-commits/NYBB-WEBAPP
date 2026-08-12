import "server-only";

import { paymongoFetch } from "./client";
import type { RefundReason } from "./refund-outcome";

const NOTE_MAX_LENGTH = 255;

export function buildRefundPayload(input: {
  paymentId: string;
  amountCents: number;
  reason: RefundReason;
  note?: string | null;
  refundId: string;
  orderId: string;
}) {
  const note = input.note?.trim().slice(0, NOTE_MAX_LENGTH) ?? "";
  return {
    data: {
      attributes: {
        amount: input.amountCents,
        payment_id: input.paymentId,
        reason: input.reason,
        ...(note ? { notes: note } : {}),
        metadata: { refund_id: input.refundId, order_id: input.orderId },
      },
    },
  };
}

export async function createPaymongoRefund(input: {
  paymentId: string;
  amountCents: number;
  reason: RefundReason;
  note?: string | null;
  refundId: string;
  orderId: string;
  idempotencyKey: string;
}): Promise<{ id: string; status: string }> {
  const data = await paymongoFetch<{
    id: string;
    attributes: { status: string };
  }>("/refunds", {
    method: "POST",
    body: buildRefundPayload(input),
    idempotencyKey: input.idempotencyKey,
  });
  return { id: data.id, status: data.attributes.status };
}
