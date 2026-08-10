"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StaffOrderActionResult } from "@/lib/staff/order-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

const idSchema = z.uuid();
const codeSchema = z.string().regex(/^\d{4}$/);

function friendly(message: string | undefined): string {
  if (message?.includes("PICKUP_CODE_INVALID")) return "That pickup code does not match.";
  if (message?.includes("PAYMENT_REQUIRED")) return "Payment must clear before this step.";
  if (message?.includes("INVALID_TRANSITION")) return "This order has already moved. Refresh the board.";
  if (message?.includes("ORDER_NOT_FOUND")) return "That order no longer exists.";
  if (message?.includes("FORBIDDEN")) return "You do not have access to change this order.";
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
