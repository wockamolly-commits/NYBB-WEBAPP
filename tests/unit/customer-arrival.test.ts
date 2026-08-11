import { describe, expect, it } from "vitest";
import {
  customerArrivalInputSchema,
  normalizeCustomerArrivalInput,
} from "@/lib/orders/arrival";

describe("customer arrival input", () => {
  it("accepts the two references the server action needs", () => {
    expect(customerArrivalInputSchema.safeParse({
      shortCode: "NY-ABCD23",
      trackingToken: "77000000-0000-4000-8000-000000000010",
    }).success).toBe(true);
  });

  it("normalizes a valid code and token before the RPC call", () => {
    expect(normalizeCustomerArrivalInput({
      shortCode: " ny-abcd23 ",
      trackingToken: "77000000-0000-4000-8000-000000000010",
    })).toEqual({
      shortCode: "NY-ABCD23",
      trackingToken: "77000000-0000-4000-8000-000000000010",
    });
  });

  it("turns malformed credentials into the same null shape used for a missing credential", () => {
    expect(normalizeCustomerArrivalInput({
      shortCode: "not an order code",
      trackingToken: "not-a-token",
    })).toEqual({ shortCode: null, trackingToken: null });
  });

  it("rejects an omitted token and oversized references at the action boundary", () => {
    expect(customerArrivalInputSchema.safeParse({ shortCode: "NY-ABCD23" }).success).toBe(false);
    expect(customerArrivalInputSchema.safeParse({
      shortCode: "N".repeat(65),
      trackingToken: null,
    }).success).toBe(false);
  });
});
