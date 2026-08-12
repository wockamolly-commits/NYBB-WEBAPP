"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin-client";
import { paymongoConfigured } from "@/lib/paymongo/config";
import { PaymongoError } from "@/lib/paymongo/client";
import { classifyRefundFailure, isRefundReason, type RefundActionResult } from "@/lib/paymongo/refund-outcome";
import { createPaymongoRefund } from "@/lib/paymongo/refunds";
import { isMockPaymentId, mockPaymentsEnabled } from "@/lib/paymongo/mock";
import { isRejectReasonCode } from "@/lib/orders/reject-reasons";
import type { StaffOrderActionResult } from "@/lib/staff/order-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const codeSchema = z.string().regex(/^\d{4}$/);
const amountSchema = z.number().int().min(100).max(10_000_000);
const refundReservationSchema = z.object({
  refund_id: z.uuid(),
  amount_cents: z.coerce.number().int().positive(),
  provider_payment_id: z.string().min(1),
});

function friendly(message: string | undefined): string {
  if (message?.includes("PICKUP_CODE_INVALID")) return "That pickup code does not match.";
  if (message?.includes("PAYMENT_REQUIRED")) return "Payment must clear before this step.";
  if (message?.includes("INVALID_TRANSITION")) return "This order has already moved. Refresh the board.";
  if (message?.includes("ORDER_NOT_FOUND")) return "That order no longer exists.";
  if (message?.includes("FORBIDDEN")) return "You do not have access to change this order.";
  if (message?.includes("REJECT_REASON_INVALID")) return "Choose a reason before refusing this order.";
  return "The order could not be updated. Try again.";
}

async function setStatus(
  orderId: string,
  status: "preparing" | "ready" | "claimed",
  pickupCode: string | null,
): Promise<StaffOrderActionResult> {
  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "orders:manage")) {
    return { ok: false, error: "You do not have access to change orders." };
  }
  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) return { ok: false, error: "Invalid order." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_order_status", {
    p_order_id: parsedId.data,
    p_to: status,
    p_pickup_code: pickupCode,
  });
  if (error) {
    console.error("[workspace] staff_set_order_status failed", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidatePath("/workspace/orders");
  revalidatePath("/workspace");
  return { ok: true };
}

export async function startOrder(orderId: string): Promise<StaffOrderActionResult> {
  return setStatus(orderId, "preparing", null);
}

export async function markOrderReady(orderId: string): Promise<StaffOrderActionResult> {
  return setStatus(orderId, "ready", null);
}

export async function claimOrder(
  orderId: string,
  pickupCode: string,
): Promise<StaffOrderActionResult> {
  const parsed = codeSchema.safeParse(pickupCode.trim());
  if (!parsed.success) return { ok: false, error: "Enter the four-digit pickup code." };
  return setStatus(orderId, "claimed", parsed.data);
}

/**
 * Refusing an order, which is a different act from moving one along.
 *
 * It does not refund. The owner's ruling is that rejecting and refunding are
 * two deliberate steps by a person, so this marks the money as owed
 * (`payments.needs_refund`) and the rejected order stays reachable in the
 * workspace history, where the refund control lives.
 *
 * The reason is a code, never prose. `lib/orders/status.ts` turns it into the
 * sentence the customer reads, and a text box filled in at a counter under
 * pressure is not a safe way to write to a stranger's phone. The database
 * checks the same closed list, because a client-side list is a suggestion.
 */
export async function rejectOrder(
  orderId: string,
  reason: string,
): Promise<StaffOrderActionResult> {
  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "orders:manage")) {
    return { ok: false, error: "You do not have access to change orders." };
  }
  const parsedId = idSchema.safeParse(orderId);
  if (!parsedId.success) return { ok: false, error: "Invalid order." };
  if (!isRejectReasonCode(reason)) {
    return { ok: false, error: "Choose a reason before refusing this order." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_reject_order", {
    p_order_id: parsedId.data,
    p_reason: reason,
  });
  if (error) {
    console.error("[workspace] staff_reject_order failed", error.message);
    return { ok: false, error: friendly(error.message) };
  }
  revalidatePath("/workspace/orders");
  revalidatePath("/workspace/orders/history");
  revalidatePath("/workspace");
  return { ok: true };
}

export async function refundOrder(input: {
  orderId: string;
  amountCents: number | null;
  reason: string;
  note: string;
}): Promise<RefundActionResult> {
  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "refunds:manage")) {
    return { ok: false, error: "You do not have access to issue refunds." };
  }
  const orderId = idSchema.safeParse(input.orderId);
  const amount = input.amountCents === null ? null : amountSchema.safeParse(input.amountCents);
  if (!orderId.success || (amount !== null && !amount.success) || !isRefundReason(input.reason)) {
    return { ok: false, error: "Enter a valid refund amount and reason." };
  }
  const mockEnabled = mockPaymentsEnabled();
  if ((!mockEnabled && !paymongoConfigured()) || !adminConfigured()) {
    return { ok: false, error: "PayMongo refunds are not configured for this environment." };
  }

  const note = input.note.trim().slice(0, 255);
  const staff = await createStaffClient();
  const { data, error } = await staff.rpc("staff_request_refund", {
    p_order_id: orderId.data,
    p_amount_cents: amount?.data ?? null,
    p_reason: input.reason,
    p_note: note || null,
  });
  if (error) {
    console.error("[workspace] refund reservation failed", error.message);
    return { ok: false, error: friendlyRefund(error.message) };
  }
  const reservation = refundReservationSchema.safeParse(data);
  if (!reservation.success) {
    console.error("[workspace] refund reservation returned invalid data");
    return { ok: false, error: "The refund could not be reserved. Try again." };
  }

  const admin = createAdminClient();
  if (mockEnabled) {
    if (!isMockPaymentId(reservation.data.provider_payment_id)) {
      await admin.rpc("apply_paymongo_refund", {
        p_refund_id: reservation.data.refund_id,
        p_provider_refund_id: null,
        p_status: "failed",
        p_raw: { provider: "mock", reason: "payment_not_mock" },
        p_failure_message: "This payment was not created by the mock payment simulator.",
      });
      return { ok: false, error: "Only mock payments can use the mock refund simulator." };
    }
    const { error: reconcileError } = await admin.rpc("apply_paymongo_refund", {
      p_refund_id: reservation.data.refund_id,
      p_provider_refund_id: `mock_ref_${reservation.data.refund_id}`,
      p_status: "succeeded",
      p_raw: { provider: "mock", outcome: "succeeded" },
      p_failure_message: null,
    });
    if (reconcileError) {
      console.error("[workspace] mock refund reconciliation failed", reconcileError.message);
      return { ok: false, error: "The mock refund could not be completed." };
    }
    revalidateRefundPages();
    return { ok: true, settled: true, message: "Mock refund issued." };
  }
  try {
    const providerRefund = await createPaymongoRefund({
      paymentId: reservation.data.provider_payment_id,
      amountCents: reservation.data.amount_cents,
      reason: input.reason,
      note,
      refundId: reservation.data.refund_id,
      orderId: orderId.data,
      idempotencyKey: `nybb:refund:${reservation.data.refund_id}`,
    });
    const providerStatus = providerRefund.status === "succeeded"
      ? "succeeded"
      : providerRefund.status === "failed"
        ? "failed"
        : "pending";
    const { error: reconcileError } = await admin.rpc("apply_paymongo_refund", {
      p_refund_id: reservation.data.refund_id,
      p_provider_refund_id: providerRefund.id,
      p_status: providerStatus,
      p_raw: null,
      p_failure_message: null,
    });
    if (reconcileError) {
      console.error("[workspace] refund reconciliation failed", reconcileError.message);
      return { ok: false, error: "The refund is pending confirmation. Do not submit it again." };
    }
    revalidateRefundPages();
    return providerStatus === "succeeded"
      ? { ok: true, settled: true, message: "Refund issued." }
      : providerStatus === "failed"
        ? { ok: false, error: "PayMongo did not approve this refund." }
        : { ok: true, settled: false, message: "Refund submitted and awaiting confirmation." };
  } catch (error) {
    if (classifyRefundFailure(error) === "rejected") {
      const message = error instanceof PaymongoError ? error.message : "PayMongo rejected this refund.";
      const { error: reconcileError } = await admin.rpc("apply_paymongo_refund", {
        p_refund_id: reservation.data.refund_id,
        p_provider_refund_id: null,
        p_status: "failed",
        p_raw: null,
        p_failure_message: message,
      });
      if (reconcileError) console.error("[workspace] rejected refund cleanup failed", reconcileError.message);
      revalidateRefundPages();
      return { ok: false, error: "PayMongo rejected this refund. No money was returned." };
    }
    console.error("[workspace] refund request outcome is unknown", error);
    revalidateRefundPages();
    return { ok: false, error: "The refund is pending confirmation. Do not submit it again." };
  }
}

function friendlyRefund(message: string | undefined): string {
  if (message?.includes("REFUND_EXCEEDS_PAYMENT")) return "The requested amount exceeds what remains refundable.";
  if (message?.includes("REFUND_PAYMENT_NOT_PAID")) return "This payment is not available for a refund.";
  if (message?.includes("REFUND_PROVIDER_UNSUPPORTED")) return "Only PayMongo payments can be refunded here.";
  if (message?.includes("FORBIDDEN")) return "You do not have access to issue refunds.";
  return "The refund could not be started. Try again.";
}

function revalidateRefundPages(): void {
  revalidatePath("/workspace/orders");
  revalidatePath("/workspace/orders/history");
  revalidatePath("/workspace");
}
