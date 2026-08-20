import { describe, expect, it } from "vitest";
import { isMockPaymentId, mockPaymentsEnabled, paymentSimulationVisible } from "@/lib/paymongo/mock";

describe("mock payments", () => {
  it("is explicit and cannot activate in production", () => {
    expect(mockPaymentsEnabled("development", "true")).toBe(true);
    expect(mockPaymentsEnabled("test", "true")).toBe(true);
    expect(mockPaymentsEnabled("development", "false")).toBe(false);
    expect(mockPaymentsEnabled("production", "true")).toBe(false);
  });

  it("shows PayMongo's own test link only off production, and only under a test key", () => {
    expect(paymentSimulationVisible("development", "sk_test_abc")).toBe(true);
    // A live key never produces a test_url, but never offer the affordance.
    expect(paymentSimulationVisible("development", "sk_live_abc")).toBe(false);
    // The one that matters: a link that completes a payment must never reach
    // a real customer's screen, whatever the key says.
    expect(paymentSimulationVisible("production", "sk_test_abc")).toBe(false);
    expect(paymentSimulationVisible("development", undefined)).toBe(false);
  });

  it("only settles a payment created by the development simulator", () => {
    expect(isMockPaymentId("mock_pay_123")).toBe(true);
    expect(isMockPaymentId("pay_live_123")).toBe(false);
  });
});
