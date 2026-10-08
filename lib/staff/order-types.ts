import type { OrderStatus } from "@/lib/orders/types";

export type WorkspaceOrder = {
  id: string;
  shortCode: string;
  status: Extract<OrderStatus, "pending" | "accepted" | "preparing" | "ready" | "claimed">;
  isTest: boolean;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  notes: string | null;
  placedAt: string;
  pickupAt: string | null;
  customerArrived: boolean;
  /** The customer tapped "I'm coming" (0085). Cleared by a ring from here. */
  readyAcknowledgedAt: string | null;
  /** The last time the counter rang the customer again. */
  readyRingAt: string | null;
  payment: { method: string; provider: string; status: string; isMock?: boolean } | null;
  items: Array<{
    quantity: number;
    name: string;
    variation: string;
    options: string[];
  }>;
  heatLevels: string[];
};

export type StaffOrderActionResult =
  | { ok: true }
  | { ok: false; error: string };
