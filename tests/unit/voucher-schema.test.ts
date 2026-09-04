import { describe, expect, it } from "vitest";
import { formatPeso } from "@/lib/format";
import {
  toVoucher,
  voucherFormSchema,
  voucherRowSchema,
  type VoucherFormInput,
} from "@/lib/vouchers/schema";
import {
  usageLabel,
  voucherStatus,
  voucherSummary,
  VOUCHER_STATUS_LABELS,
} from "@/lib/vouchers/status";

/**
 * The parse, and specifically the six nullable fields it must not flatten.
 *
 * Spec section 18 warns about exactly two of these by name and AGENTS.md rule 6
 * records the day the same mistake shipped on menu_options.heat_percent, where
 * a blank field coerced to 0 and turned "no heat level" into "0% heat" on every
 * save. It passed lint, types, 900 unit tests and a production build, and was
 * found weeks later by reading an audit row. This file is the test that would
 * have caught it.
 */

function form(over: Partial<VoucherFormInput> = {}): VoucherFormInput {
  return {
    code: "LAUNCH50",
    discountKind: "fixed",
    amountPesos: 50,
    maxUsesPerCustomer: 1,
    isActive: true,
    ...over,
  };
}

function parsed(over: Partial<VoucherFormInput> = {}) {
  const result = voucherFormSchema.safeParse(form(over));
  if (!result.success) {
    throw new Error(`expected a parse: ${JSON.stringify(result.error.issues)}`);
  }
  return result.data;
}

describe("the nullable fields, none of which mean zero", () => {
  it("keeps an unlimited voucher unlimited rather than usable zero times", () => {
    // The one spec section 18 calls the more dangerous of the two: 0 is a
    // plausible looking cap, so nothing downstream would flag it, and the
    // effect is every open promo code refusing to redeem.
    expect(parsed({ maxUses: "" }).maxUses).toBeNull();
    expect(parsed({ maxUses: "" }).maxUses).not.toBe(0);
  });

  it("keeps a percentage voucher a percentage, not a fixed PHP 0.00 discount", () => {
    const value = parsed({ discountKind: "percent", percentOff: 10, amountPesos: "" });
    expect(value.percentOff).toBe(10);
    expect(value.amountCents).toBeNull();
    expect(value.amountCents).not.toBe(0);
  });

  it("keeps an uncapped percentage uncapped", () => {
    const value = parsed({
      discountKind: "percent",
      percentOff: 10,
      amountPesos: "",
      maxDiscountPesos: "",
    });
    expect(value.maxDiscountCents).toBeNull();
  });

  it("keeps a voucher with no dates open ended at both ends", () => {
    const value = parsed({ startsAt: "", expiresAt: "" });
    expect(value.startsAt).toBeNull();
    expect(value.expiresAt).toBeNull();
    // The epoch is what a coerced empty date becomes, and it would make every
    // voucher look like it opened in 1970 and expired there too.
    expect(value.startsAt).not.toBe("1970-01-01T00:00:00.000Z");
  });

  it("reads no minimum as zero, because there the two do mean the same thing", () => {
    // min_order_cents is `not null default 0`. A minimum of nothing is a real
    // minimum of nothing, which is why this one field is allowed to collapse.
    expect(parsed({ minOrderPesos: "" }).minOrderCents).toBe(0);
  });

  it("refuses a blank per-customer cap instead of saving it as zero", () => {
    // The deliberate exception in AGENTS.md rule 6: coercion is safe only where
    // a stray zero would be rejected anyway, and this range starts at 1. An
    // empty string coerces to 0, fails min(1), and the person sees an error
    // rather than a voucher nobody can use.
    const result = voucherFormSchema.safeParse(form({ maxUsesPerCustomer: "" }));
    expect(result.success).toBe(false);
  });
});

describe("the discount kind", () => {
  it("turns pesos into centavos", () => {
    expect(parsed({ amountPesos: 50 }).amountCents).toBe(5000);
    expect(parsed({ amountPesos: 12.5 }).amountCents).toBe(1250);
  });

  it("keeps only the figure the chosen kind uses", () => {
    // A form switched from percentage to fixed still holds the old percentage
    // in its state. Saving both would trip vouchers_one_discount_kind at the
    // database, which is a constraint violation rather than a message.
    const value = parsed({ discountKind: "fixed", amountPesos: 50, percentOff: 10 });
    expect(value.amountCents).toBe(5000);
    expect(value.percentOff).toBeNull();
  });

  it("drops a ceiling set against a fixed amount", () => {
    // A cap on a fixed discount is the fixed discount, so it can only confuse
    // whoever reads the row next.
    expect(parsed({ discountKind: "fixed", maxDiscountPesos: 10 }).maxDiscountCents).toBeNull();
  });

  it("insists a fixed voucher says how much, and a percentage says what percent", () => {
    expect(voucherFormSchema.safeParse(form({ amountPesos: "" })).success).toBe(false);
    expect(
      voucherFormSchema.safeParse(
        form({ discountKind: "percent", percentOff: "", amountPesos: "" }),
      ).success,
    ).toBe(false);
  });
});

describe("the code itself", () => {
  it("upper-cases, because the unique index is on the upper-cased value", () => {
    expect(parsed({ code: "launch50" }).code).toBe("LAUNCH50");
  });

  it("refuses a code with a space in it", () => {
    // Untypable from a poster, and the lookup trims but does not squash.
    expect(voucherFormSchema.safeParse(form({ code: "LAUNCH 50" })).success).toBe(false);
  });

  it("refuses an empty code", () => {
    expect(voucherFormSchema.safeParse(form({ code: "   " })).success).toBe(false);
  });
});

describe("the dates", () => {
  it("reads a Manila wall clock as an instant", () => {
    const value = parsed({ startsAt: "2026-09-10T09:00" });
    // 09:00 in Cebu is 01:00 UTC. Reading it as the server's own zone would put
    // a campaign eight hours out.
    expect(value.startsAt).toBe(new Date("2026-09-10T09:00:00+08:00").toISOString());
  });

  it("refuses a code that expires before it opens", () => {
    expect(
      voucherFormSchema.safeParse(
        form({ startsAt: "2026-09-10T09:00", expiresAt: "2026-09-01T09:00" }),
      ).success,
    ).toBe(false);
  });
});

describe("reading a row back", () => {
  const row = {
    id: "1b4e28ba-2fa1-4d3b-a3f5-cc0f8a9a1111",
    code: "LAUNCH50",
    description: null,
    note: null,
    amount_cents: null,
    percent_off: 10,
    max_discount_cents: null,
    min_order_cents: "50000",
    max_uses: null,
    max_uses_per_customer: 1,
    uses_count: 0,
    starts_at: null,
    expires_at: null,
    is_active: true,
    owner_user_id: null,
    created_at: "2026-09-04T00:00:00Z",
  };

  it("carries every null through as a null", () => {
    const value = toVoucher(voucherRowSchema.parse(row));
    expect(value.amountCents).toBeNull();
    expect(value.maxUses).toBeNull();
    expect(value.maxDiscountCents).toBeNull();
    expect(value.expiresAt).toBeNull();
  });

  it("coerces the bigint that PostgREST sends as a string, because it cannot be null", () => {
    // min_order_cents is `not null default 0`, which is the one shape AGENTS.md
    // rule 6 says coercion is actually correct for.
    expect(voucherRowSchema.parse(row).min_order_cents).toBe(50000);
  });
});

describe("the status one word has to carry", () => {
  const live = {
    isActive: true,
    startsAt: null,
    expiresAt: null,
    maxUses: null,
    usesCount: 0,
  };
  const now = new Date("2026-09-04T12:00:00+08:00");

  it("calls an unrestricted live voucher live", () => {
    expect(voucherStatus(live, now)).toBe("active");
  });

  it("does not call an unlimited voucher used up", () => {
    // The null-is-not-zero trap again, this time on the screen: reading null as
    // 0 would mark every open promo code as exhausted the day it was made.
    expect(voucherStatus({ ...live, maxUses: null, usesCount: 500 }, now)).toBe("active");
  });

  it("calls a voucher at its cap used up", () => {
    expect(voucherStatus({ ...live, maxUses: 5, usesCount: 5 }, now)).toBe("exhausted");
  });

  it("calls a future voucher scheduled and a past one expired", () => {
    expect(voucherStatus({ ...live, startsAt: "2099-01-01T00:00:00Z" }, now)).toBe("scheduled");
    expect(voucherStatus({ ...live, expiresAt: "2020-01-01T00:00:00Z" }, now)).toBe("expired");
  });

  it("leads with the switch when a voucher is several things at once", () => {
    // Documented order. Of the reasons a code might not work, the switch is the
    // only one somebody set deliberately and the only one a click undoes.
    expect(
      voucherStatus(
        { ...live, isActive: false, expiresAt: "2020-01-01T00:00:00Z", maxUses: 1, usesCount: 1 },
        now,
      ),
    ).toBe("disabled");
  });

  it("gives every status a label", () => {
    for (const status of Object.values(VOUCHER_STATUS_LABELS)) {
      expect(status.trim().length).toBeGreaterThan(0);
      // AGENTS.md rule 4. These are shipped UI copy.
      expect(status).not.toContain("—");
    }
  });

  it("says no limit rather than a number it does not have", () => {
    expect(usageLabel(3, null)).toBe("3, no limit");
    expect(usageLabel(3, 100)).toBe("3 of 100");
  });
});

describe("the sentence above the form", () => {
  const base = {
    amountCents: null,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    branchNames: [],
    itemNames: [],
    categoryNames: [],
    customerCount: 0,
  };

  // Money is written through formatPeso rather than spelled out, so these
  // assert the sentence rather than Intl's currency symbol, which varies with
  // the ICU build Node was compiled against.
  it("describes the plain case without reciting what it does not restrict", () => {
    expect(voucherSummary({ ...base, amountCents: 5000 })).toBe(
      `${formatPeso(5000)} off, on the whole order.`,
    );
  });

  it("names the scope a voucher actually has", () => {
    expect(
      voucherSummary({
        ...base,
        percentOff: 10,
        maxDiscountCents: 10000,
        minOrderCents: 50000,
        branchNames: ["Mango Avenue"],
        categoryNames: ["Chicken Wings", "Sides"],
      }),
    ).toBe(
      `10% off, up to ${formatPeso(10000)}, on Chicken Wings and Sides, ` +
        `at Mango Avenue, once that reaches ${formatPeso(50000)}.`,
    );
  });

  it("says so plainly while the form is still half filled", () => {
    expect(voucherSummary(base)).toBe("Choose a fixed amount or a percentage.");
  });

  it("writes no em dashes, because this is shipped copy", () => {
    expect(voucherSummary({ ...base, amountCents: 5000, branchNames: ["A", "B", "C"] })).not.toContain(
      "—",
    );
  });
});
