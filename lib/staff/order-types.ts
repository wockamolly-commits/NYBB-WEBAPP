import type { OrderStatus } from "@/lib/orders/types";

export type WorkspaceOrder = {
  id: string;
  shortCode: string;
  status: Extract<OrderStatus, "pending" | "accepted" | "preparing" | "ready" | "claimed">;
  isTest: boolean;
  customerName: string;
  totalCents: number;
  notes: string | null;
  placedAt: string;
  pickupAt: string | null;
  customerArrived: boolean;
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
