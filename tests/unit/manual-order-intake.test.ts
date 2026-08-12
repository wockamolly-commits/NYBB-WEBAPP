import { describe, expect, it } from "vitest";
import { manualOrderIntakeSchema } from "@/lib/manual-orders";

const ids = {
  branch: "10000000-0000-4000-8000-000000000001",
  item: "10000000-0000-4000-8000-000000000002",
  variation: "10000000-0000-4000-8000-000000000003",
  option: "10000000-0000-4000-8000-000000000004",
};

const common = {
  branchId: ids.branch,
  source: "Phone",
  customer: { name: "Ana Santos", phone: "09171234567" },
  lines: [
    {
      itemId: ids.item,
      variationId: ids.variation,
      optionIds: [ids.option],
      quantity: 1,
    },
  ],
};

describe("manual order intake contract", () => {
  it("accepts a staff-entered pickup order without a client price", () => {
    const result = manualOrderIntakeSchema.safeParse({
      ...common,
      serviceMode: "pickup",
      pickup: { promisedAt: "2026-08-12T19:15:00+08:00" },
    });

    expect(result.success).toBe(true);
  });

  it("requires a usable delivery address for delivery", () => {
    const result = manualOrderIntakeSchema.safeParse({
      ...common,
      serviceMode: "delivery",
      delivery: { addressLine: "Unit 5, Example Street", city: "Cebu City" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects delivery without the required address details", () => {
    const result = manualOrderIntakeSchema.safeParse({
      ...common,
      serviceMode: "delivery",
      delivery: { addressLine: "Unit 5, Example Street" },
    });

    expect(result.success).toBe(false);
  });

  it("does not admit client-supplied financial or POS authority fields", () => {
    const result = manualOrderIntakeSchema.safeParse({
      ...common,
      serviceMode: "pickup",
      totalCents: 1,
      discountCents: 999999,
      deliveryFeeCents: 0,
      paymentStatus: "paid",
      zenposReference: "ZP-42",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("totalCents");
      expect(result.data).not.toHaveProperty("discountCents");
      expect(result.data).not.toHaveProperty("deliveryFeeCents");
      expect(result.data).not.toHaveProperty("paymentStatus");
      expect(result.data).not.toHaveProperty("zenposReference");
    }
  });
});
