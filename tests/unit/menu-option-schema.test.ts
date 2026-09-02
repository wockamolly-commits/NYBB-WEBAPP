import { describe, expect, it } from "vitest";
import { optionSchema } from "@/lib/staff/menu-schemas";

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
