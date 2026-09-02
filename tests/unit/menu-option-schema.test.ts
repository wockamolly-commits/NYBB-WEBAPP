import { describe, expect, it } from "vitest";
import { branchAvailabilityGridSchema, optionSchema } from "@/lib/staff/menu-schemas";

/**
 * The parse that decides whether an option has a heat level at all.
 *
 * These exist because the union that reads `heatPercent` was written with its
 * coercing branch first, so the empty string parsed as the number zero and
 * "no heat" became "0% heat" on every save. Nothing caught it: it is a valid
 * parse of a valid form, it type checks, and the only visible symptom was a
 * Heat % column appearing on a group of nine flavours. See the comment in
 * lib/staff/menu-schemas.ts.
 */

const base = {
  groupId: "9ef2ac98-5e10-43a9-908b-e2cf3bc1079c",
  name: "Sweet Spicy",
  pricing: "free" as const,
  isActive: "true" as const,
};

function parse(input: Record<string, unknown>) {
  const result = optionSchema.safeParse({ ...base, ...input });
  if (!result.success) throw new Error(`did not parse: ${result.error.message}`);
  return result.data;
}

describe("optionSchema heat percent", () => {
  it("reads an empty field as no heat, not as zero percent", () => {
    // The regression. Null means the option has no heat level; 0 means it has
    // one and it is 0%. The options screen opens a whole group's Heat % column
    // on the difference.
    expect(parse({ heatPercent: "" }).resolvedHeatPercent).toBeNull();
  });

  it("reads a missing field as no heat", () => {
    expect(parse({}).resolvedHeatPercent).toBeNull();
  });

  it("keeps a real zero, which is a heat level of zero percent", () => {
    // "No heat" is a genuine option on the Level of Hotness group and it
    // carries heat_percent 0. Blank and zero are opposite answers and both
    // have to survive.
    expect(parse({ heatPercent: "0" }).resolvedHeatPercent).toBe(0);
  });

  it("keeps every step of the real heat scale", () => {
    for (const percent of [20, 40, 60, 80, 100]) {
      expect(parse({ heatPercent: String(percent) }).resolvedHeatPercent).toBe(percent);
    }
  });

  it("refuses a heat percent outside the scale", () => {
    expect(optionSchema.safeParse({ ...base, heatPercent: "101" }).success).toBe(false);
    expect(optionSchema.safeParse({ ...base, heatPercent: "-1" }).success).toBe(false);
  });
});

describe("optionSchema pricing", () => {
  it("sends null for priced by size, which is not free", () => {
    // The other half of the same class of mistake, and the reason the pricing
    // field is a three way choice rather than a number: coalescing this to 0
    // would make every heat level free on every wing size.
    expect(parse({ pricing: "bySize", priceCents: "0" }).resolvedPriceCents).toBeNull();
  });

  it("sends zero for free", () => {
    expect(parse({ pricing: "free", priceCents: "3000" }).resolvedPriceCents).toBe(0);
  });

  it("sends the amount for a flat price, and ignores it otherwise", () => {
    expect(parse({ pricing: "flat", priceCents: "3000" }).resolvedPriceCents).toBe(3000);
    expect(parse({ pricing: "free", priceCents: "3000" }).resolvedPriceCents).toBe(0);
    expect(parse({ pricing: "bySize", priceCents: "3000" }).resolvedPriceCents).toBeNull();
  });
});

describe("branchAvailabilityGridSchema", () => {
  const branchId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

  it("parses a grid of ticked and unticked counters", () => {
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: false, reason: "equipment" }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.branches[0]?.sellHere).toBe(false);
    expect(parsed.data?.branches[0]?.reason).toBe("equipment");
  });

  it("refuses a counter taken off sale with no reason", () => {
    // The requirement is in three places on purpose: the select holds the
    // Save, this refuses a payload that got past it, and the RPC raises
    // HOLD_NEEDS_A_REASON. Only the last of those is load bearing against a
    // caller that is not this form, and the first is the only one a person
    // ever sees.
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: false, reason: "" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("allows no reason on a counter going back on sale", () => {
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: true, reason: "" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a reason that is not one of the four", () => {
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: false, reason: "because" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an empty list, which is Save pressed with nothing changed", () => {
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a hold kind smuggled in from the browser", () => {
    // The kind is decided in the action and never posted. If it were carried
    // here, a screen with no time field could still set a timed hold, which
    // would expire on its own and put the item back at a counter that was
    // meant to stop selling it.
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: false, reason: "temporary", kind: "today" }],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.branches[0]).not.toHaveProperty("kind");
  });

  it("refuses a branch id that is not a uuid", () => {
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId: "central-bloc", name: "Central Bloc", sellHere: false, reason: "temporary" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a sellHere that is a string rather than a boolean", () => {
    // A form posts strings, so "false" reaching a boolean field would be
    // truthy and turn "stop selling" into "keep selling". This grid posts
    // JSON precisely so the type survives.
    const parsed = branchAvailabilityGridSchema.safeParse({
      itemId: "0b6e7a34-3f5a-4c2e-8a1b-9d0c1e2f3a4b",
      branches: [{ branchId, name: "Central Bloc", sellHere: "false", reason: "temporary" }],
    });
    expect(parsed.success).toBe(false);
  });
});
