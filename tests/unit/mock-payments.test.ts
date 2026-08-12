import { describe, expect, it } from "vitest";
import { isMockPaymentId, mockPaymentsEnabled } from "@/lib/paymongo/mock";

describe("mock payments", () => {
  it("is explicit and cannot activate in production", () => {
    expect(mockPaymentsEnabled("development", "true")).toBe(true);
    expect(mockPaymentsEnabled("test", "true")).toBe(true);
    expect(mockPaymentsEnabled("development", "false")).toBe(false);
    expect(mockPaymentsEnabled("production", "true")).toBe(false);
  });

  it("only settles a payment created by the development simulator", () => {
    expect(isMockPaymentId("mock_pay_123")).toBe(true);
    expect(isMockPaymentId("pay_live_123")).toBe(false);
  });
});
