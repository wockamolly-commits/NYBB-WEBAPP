import { describe, expect, it } from "vitest";
import { promoHeadline, promoRowSchema, type Promo } from "@/lib/promos/schema";

/**
 * The short form the bar, the floating reminder and the checkout suggestions
 * print. Rule 6 applies here as much as to the full sentence: a null amount is
 * a percentage promo, and must never come out as "PHP 0.00 off".
 */

function promo(over: Partial<Record<string, unknown>> = {}): Promo {
  return promoRowSchema.parse({
    code: "LAUNCH50",
    description: null,
    amountCents: 5000,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    expiresAt: null,
    personal: false,
    itemNames: [],
    categoryNames: [],
    branchNames: ["Central Bloc", "Mango Avenue", "Shell Gorordo"],
    ...over,
  });
}

describe("promoHeadline", () => {
  it("prints a fixed amount and the whole order", () => {
    const headline = promoHeadline(promo());
    expect(headline.value).toBe("₱50.00 off");
    expect(headline.scope).toBe("On the whole order");
  });

  it("never names the counters, which made the old bar truncate mid name", () => {
    expect(promoHeadline(promo()).scope).not.toContain("Central Bloc");
  });

  it("reads a null amount as a percentage promo, not as zero", () => {
    const headline = promoHeadline(promo({ amountCents: null, percentOff: 20 }));
    expect(headline.value).toBe("20% off");
    expect(headline.value).not.toContain("0.00");
  });

  it("states a cap only when there is one", () => {
    expect(promoHeadline(promo({ amountCents: null, percentOff: 20 })).scope).toBe(
      "On the whole order",
    );
    expect(
      promoHeadline(promo({ amountCents: null, percentOff: 20, maxDiscountCents: 10000 })).scope,
    ).toBe("On the whole order, up to ₱100.00");
  });

  it("names what it covers and the minimum spend", () => {
    const headline = promoHeadline(
      promo({ itemNames: ["Classic Buffalo"], categoryNames: ["Ribs"], minOrderCents: 50000 }),
    );
    expect(headline.scope).toBe("On Classic Buffalo and Ribs, from ₱500.00");
  });

  it("says nothing rather than inventing a value for a row with neither", () => {
    expect(promoHeadline(promo({ amountCents: null, percentOff: null })).value).toBe("");
  });
});
