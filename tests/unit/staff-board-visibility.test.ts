import { describe, expect, it, vi } from "vitest";
import type { WorkspaceOrder } from "@/lib/staff/order-types";

vi.mock("@/lib/supabase/server", () => ({ createReadOnlyStaffClient: vi.fn() }));
const { onTheBoard } = await import("@/lib/staff/orders");

/**
 * Which orders reach the board. A refunded order used to be filtered out with
 * the unpaid ones, which left it live but on no screen at all.
 */
function withPayment(payment: WorkspaceOrder["payment"]): WorkspaceOrder {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    shortCode: "NY-ABC234",
    status: "preparing",
    isTest: false,
    customerName: "Maria Santos",
    customerPhone: "+639064405297",
    totalCents: 45000,
    notes: null,
    placedAt: "2026-08-12T02:00:00.000Z",
    pickupAt: null,
    customerArrived: false,
    readyAcknowledgedAt: null,
    readyRingAt: null,
    payment,
    items: [],
    heatLevels: [],
  };
}

describe("onTheBoard", () => {
  it("keeps an online order off until it is paid", () => {
    expect(onTheBoard(withPayment({ method: "qrph", provider: "paymongo", status: "pending" }))).toBe(false);
    expect(onTheBoard(withPayment({ method: "qrph", provider: "paymongo", status: "failed" }))).toBe(false);
    expect(onTheBoard(withPayment({ method: "qrph", provider: "paymongo", status: "paid" }))).toBe(true);
  });

  it("keeps a refunded order on, so it can be refused", () => {
    expect(onTheBoard(withPayment({ method: "qrph", provider: "paymongo", status: "refunded" }))).toBe(true);
  });

  it("always shows counter orders and orders without a payment row", () => {
    expect(onTheBoard(withPayment({ method: "counter", provider: "manual", status: "due" }))).toBe(true);
    expect(onTheBoard(withPayment(null))).toBe(true);
  });
});
