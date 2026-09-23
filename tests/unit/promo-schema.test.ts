import { describe, expect, it } from "vitest";
import {
  promoCodeFromParams,
  promoListSchema,
  promoRowSchema,
  promoSentence,
  type Promo,
} from "@/lib/promos/schema";

/**
 * The parse at the storefront's edge, and the reason AGENTS.md rule 6 exists.
 *
 * Four of these columns are nullable and none of the nulls means zero. The
 * heat_percent bug shipped through lint, types, 900 tests and a production
 * build because the logic that was wrong had nowhere it could be tested from.
 * This is that place for the promo reader, so the cases below are deliberately
 * one per column rather than one happy path.
 */

function row(over: Partial<Record<string, unknown>> = {}): unknown {
  return {
    code: "LAUNCH50",
    description: "Fifty off the launch week",
    amountCents: 5000,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    expiresAt: null,
    personal: false,
    itemNames: [],
    categoryNames: [],
    branchNames: [],
    ...over,
  };
}

function parse(over: Partial<Record<string, unknown>> = {}): Promo {
  return promoRowSchema.parse(row(over));
}

describe("a null is not a zero", () => {
  it("keeps a percentage promo's null amount null", () => {
    // Coerced, this becomes a fixed discount of PHP 0.00 and the page says
    // "₱0.00 off" to every customer who looks at it.
    const promo = parse({ amountCents: null, percentOff: 15 });
    expect(promo.amountCents).toBeNull();
    expect(promo.percentOff).toBe(15);
  });

  it("keeps an uncapped percentage promo's ceiling null", () => {
    // Coerced, this becomes a cap of zero pesos, which is a promo that
    // discounts nothing while looking entirely healthy.
    expect(parse({ percentOff: 15, amountCents: null }).maxDiscountCents).toBeNull();
  });

  it("keeps a never-expiring promo's expiry null", () => {
    expect(parse({ expiresAt: null }).expiresAt).toBeNull();
  });

  it("keeps a missing description null rather than empty", () => {
    expect(parse({ description: null }).description).toBeNull();
  });

  it("still reads a real zero minimum as zero", () => {
    // min_order_cents is `not null default 0`, so here a zero is the column's
    // own honest value and coercion is the correct tool. This is the contrast
    // the rule turns on.
    expect(parse({ minOrderCents: 0 }).minOrderCents).toBe(0);
  });
});

describe("the numbers arrive in either wire shape", () => {
  it("reads a bigint that came back as a string", () => {
    // PostgREST hands a bigint back as a string; jsonb hands it back as a
    // number. Both have to land on the same value.
    expect(parse({ amountCents: "5000" }).amountCents).toBe(5000);
    expect(parse({ minOrderCents: "50000" }).minOrderCents).toBe(50000);
  });

  it("does not let the coercion swallow the null", () => {
    // The union puts the null branch first for exactly this reason. Zod takes
    // the first member that parses, and a greedy coercion would accept null
    // by turning it into 0, which is how the heat_percent bug worked.
    expect(parse({ amountCents: null }).amountCents).toBeNull();
    expect(parse({ maxDiscountCents: null }).maxDiscountCents).toBeNull();
  });
});

describe("a row that is not a promo", () => {
  it("is refused rather than half read", () => {
    expect(promoRowSchema.safeParse({ code: "X" }).success).toBe(false);
    expect(promoRowSchema.safeParse(null).success).toBe(false);
    expect(promoRowSchema.safeParse({ ...(row() as object), code: "" }).success).toBe(false);
  });

  it("refuses a list that is not a list", () => {
    expect(promoListSchema.safeParse({}).success).toBe(false);
    expect(promoListSchema.safeParse([row(), { code: "X" }]).success).toBe(false);
  });

  it("accepts an empty list, which is the ordinary answer", () => {
    expect(promoListSchema.parse([])).toEqual([]);
  });
});

describe("the sentence a customer reads", () => {
  it("describes a fixed promo on the whole order", () => {
    expect(promoSentence(parse())).toBe("₱50.00 off, on the whole order.");
  });

  it("describes a capped percentage promo", () => {
    expect(
      promoSentence(parse({ amountCents: null, percentOff: 10, maxDiscountCents: 8000 })),
    ).toBe("10% off, up to ₱80.00, on the whole order.");
  });

  it("names the minimum, which is the term customers get wrong", () => {
    expect(promoSentence(parse({ minOrderCents: 50000 }))).toBe(
      "₱50.00 off, on the whole order, once that reaches ₱500.00.",
    );
  });

  it("names the scope it is limited to", () => {
    expect(promoSentence(parse({ itemNames: ["Classic Buffalo"] }))).toBe(
      "₱50.00 off, on Classic Buffalo.",
    );
  });

  it("names the counter when the promo is tied to one", () => {
    expect(promoSentence(parse({ branchNames: ["IT Park"] }))).toBe(
      "₱50.00 off, on the whole order, at IT Park.",
    );
  });

  it("never tells a customer how many people a promo was issued to", () => {
    // customerCount is passed 0 deliberately. "for one named customer" is a
    // statement about somebody, and it is also the kind of fact the listing
    // refuses to return at all.
    const promo = parse({ personal: true });
    expect(promoSentence(promo)).not.toContain("named customer");
  });
});

describe("reading a code out of the URL", () => {
  it("takes an ordinary code", () => {
    expect(promoCodeFromParams({ promo: "LAUNCH50" })).toBe("LAUNCH50");
  });

  it("trims and upper cases, because a link may be hand typed", () => {
    expect(promoCodeFromParams({ promo: "  launch50 " })).toBe("LAUNCH50");
  });

  it("takes the first when the parameter is repeated", () => {
    // ?promo=A&promo=B arrives as an array. There is no reading of that where
    // refusing the whole request helps anybody.
    expect(promoCodeFromParams({ promo: ["FIRST", "SECOND"] })).toBe("FIRST");
  });

  it("is null when there is no parameter at all", () => {
    expect(promoCodeFromParams({})).toBeNull();
  });

  it("is null for junk, rather than an error on a checkout screen", () => {
    expect(promoCodeFromParams({ promo: "" })).toBeNull();
    expect(promoCodeFromParams({ promo: "   " })).toBeNull();
    expect(promoCodeFromParams({ promo: "has space" })).toBeNull();
    expect(promoCodeFromParams({ promo: "X".repeat(41) })).toBeNull();
    expect(promoCodeFromParams({ promo: [] })).toBeNull();
  });

  it("accepts a code exactly at the database's length ceiling", () => {
    const code = "X".repeat(40);
    expect(promoCodeFromParams({ promo: code })).toBe(code);
  });
});
