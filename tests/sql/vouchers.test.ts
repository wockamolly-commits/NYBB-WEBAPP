import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over the voucher engine, migrations 0064 and 0065.
 *
 * Three things have to be true here and none of them is about the screen:
 *
 *   1. a code is worth what the vouchers row says and never what the request
 *      says, which is spec section 22 item 4
 *   2. the caps hold when two people check out at once, which is the reason
 *      uses_count exists at all
 *   3. an order that does not survive hands its voucher back, so an abandoned
 *      payment cannot quietly burn a one-use code
 *
 * The refusal codes are asserted by name rather than by message. They are the
 * contract between resolve_voucher and lib/checkout/messages.ts, and a rename
 * on either side has to break something.
 */

type PayloadLine = {
  item_slug: string;
  variation_slug: string;
  qty: number;
  options?: { group_slug: string; option_slug: string }[];
};

type Placed = {
  orderId: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

type Verdict = {
  ok: boolean;
  reason?: string;
  code?: string;
  description?: string | null;
  discountCents?: number;
  eligibleCents?: number;
  subtotalCents?: number;
};

/** Full wings, Classic Buffalo, Insane. 529.00 + 60.00, twice. */
const WINGS: PayloadLine = {
  item_slug: "chicken-wings",
  variation_slug: "full",
  qty: 2,
  options: [
    { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
    { group_slug: "level-of-hotness", option_slug: "insane" },
  ],
};
const WINGS_CENTS = (52900 + 6000) * 2;

/** Ribs carry no option groups, so they price without any choices. */
const RIBS: PayloadLine = { item_slug: "ribs-original", variation_slug: "regular", qty: 1 };
const RIBS_CENTS = 34900;

/** Same branch fixture as place-order.test.ts: live, accepting, open all day. */
async function openBranch(db: PGlite, slug = "pilot"): Promise<string> {
  const branchId = await scalar<string>(
    db,
    `insert into branches (
       slug, name, short_name, format, price_list_id, address_line, city,
       is_active, is_accepting_orders,
       pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
     )
     select '${slug}', 'Branch ${slug}', '${slug}', 'street', pl.id, '1 Test Street', 'Cebu City',
            true, true, 15, 50, 20
     from price_lists pl
     order by pl.slug
     limit 1
     returning id`,
  );
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await db.query(
      `insert into store_hours (branch_id, weekday, opens_at, closes_at)
       values ($1, $2, '00:00'::time, '23:59:59'::time)`,
      [branchId, weekday],
    );
  }
  return branchId;
}

async function firstSlot(db: PGlite, slug = "pilot"): Promise<string> {
  const result = await db.query<{ payload: { slots: { startsAt: string }[] } }>(
    `select get_pickup_slots('${slug}') as payload`,
  );
  return result.rows[0].payload.slots[0].startsAt;
}

let attemptCounter = 0;
function attemptId(): string {
  attemptCounter += 1;
  return `00000000-0000-4000-8000-${attemptCounter.toString().padStart(12, "0")}`;
}

/**
 * A different number per order unless a test is deliberately reusing one.
 *
 * place_order rate limits five orders per minute per phone (0052:335), so a
 * suite that ordered as one customer would start failing on the sixth test for
 * a reason that has nothing to do with vouchers.
 */
let phoneCounter = 0;
function freshPhone(): string {
  phoneCounter += 1;
  return `0906 440 ${(1000 + phoneCounter).toString()}`;
}

type VoucherSpec = {
  code: string;
  amountCents?: number | null;
  percentOff?: number | null;
  minOrderCents?: number;
  maxUses?: number | null;
  maxUsesPerCustomer?: number;
  maxDiscountCents?: number | null;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive?: boolean;
  description?: string | null;
  ownerUserId?: string | null;
};

async function makeVoucher(db: PGlite, spec: VoucherSpec): Promise<string> {
  return scalar<string>(
    db,
    `insert into vouchers (
       code, amount_cents, percent_off, min_order_cents, max_uses,
       max_uses_per_customer, max_discount_cents, starts_at, expires_at,
       is_active, description, owner_user_id
     ) values (
       '${spec.code}',
       ${spec.amountCents ?? "null"},
       ${spec.percentOff ?? "null"},
       ${spec.minOrderCents ?? 0},
       ${spec.maxUses ?? "null"},
       ${spec.maxUsesPerCustomer ?? 1},
       ${spec.maxDiscountCents ?? "null"},
       ${spec.startsAt ? `'${spec.startsAt}'` : "null"},
       ${spec.expiresAt ? `'${spec.expiresAt}'` : "null"},
       ${spec.isActive ?? true},
       ${spec.description === undefined || spec.description === null ? "null" : `'${spec.description}'`},
       ${spec.ownerUserId ? `'${spec.ownerUserId}'` : "null"}
     )
     returning id`,
  );
}

async function place(
  db: PGlite,
  lines: PayloadLine[],
  slot: string,
  overrides: Record<string, unknown> = {},
): Promise<Placed> {
  const result = await db.query<{ result: Placed }>(
    "select place_order($1::jsonb, $2::uuid) as result",
    [
      JSON.stringify({
        branch_slug: "pilot",
        customer_name: "Steven Cruz",
        customer_phone: freshPhone(),
        pickup_slot_start: slot,
        lines,
        ...overrides,
      }),
      attemptId(),
    ],
  );
  return result.rows[0].result;
}

async function preview(
  db: PGlite,
  code: string,
  lines: PayloadLine[],
  phone = freshPhone(),
  branchSlug: string | null = "pilot",
): Promise<Verdict> {
  const result = await db.query<{ verdict: Verdict }>(
    "select preview_voucher($1, $2, $3::jsonb, $4) as verdict",
    [code, branchSlug, JSON.stringify(lines), phone],
  );
  return result.rows[0].verdict;
}

/** A world with the flag on, one branch, and a slot to book. */
async function liveWorld(): Promise<{ db: PGlite; slot: string }> {
  const db = await freshDatabase({ seed: true });
  await openBranch(db);
  await db.exec("update app_settings set vouchers_enabled = true where id = 1");
  return { db, slot: await firstSlot(db) };
}

describe("the voucher engine while the flag is off", () => {
  it("previews nothing, rather than a discount the placement would refuse", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    await makeVoucher(db, { code: "LAUNCH50", amountCents: 5000 });

    // The flag is false by default and the whole engine is dark behind it. A
    // preview that answered here would put a discount on a screen whose
    // checkout raises VOUCHERS_DISABLED, which is the exact failure spec
    // section 18 opens by warning about.
    expect((await preview(db, "LAUNCH50", [WINGS])).reason).toBe("VOUCHERS_DISABLED");
  });
});

describe("resolve_voucher, the rules in the order the customer meets them", () => {
  let db: PGlite;

  beforeAll(async () => {
    ({ db } = await liveWorld());
    await makeVoucher(db, { code: "GOOD", amountCents: 5000 });
    await makeVoucher(db, { code: "OFF", amountCents: 5000, isActive: false });
    await makeVoucher(db, {
      code: "LATER",
      amountCents: 5000,
      startsAt: "2099-01-01T00:00:00+08:00",
    });
    await makeVoucher(db, {
      code: "GONE",
      amountCents: 5000,
      expiresAt: "2020-01-01T00:00:00+08:00",
    });
  });

  it("accepts a code that passes every rule", async () => {
    const verdict = await preview(db, "GOOD", [WINGS]);
    expect(verdict.ok).toBe(true);
    expect(verdict.discountCents).toBe(5000);
    expect(verdict.subtotalCents).toBe(WINGS_CENTS);
  });

  it("does not care how the code was typed", async () => {
    // vouchers_code_key indexes upper(code), so the lookup has to agree with it
    // or a customer reading a code off a poster in lower case is refused.
    expect((await preview(db, "  good  ", [WINGS])).ok).toBe(true);
  });

  it("refuses a code that does not exist", async () => {
    expect((await preview(db, "NOPE", [WINGS])).reason).toBe("VOUCHER_NOT_FOUND");
  });

  it("refuses a code that has been switched off", async () => {
    expect((await preview(db, "OFF", [WINGS])).reason).toBe("VOUCHER_INACTIVE");
  });

  it("refuses a code whose campaign has not opened", async () => {
    expect((await preview(db, "LATER", [WINGS])).reason).toBe("VOUCHER_NOT_STARTED");
  });

  it("refuses a code that has expired", async () => {
    expect((await preview(db, "GONE", [WINGS])).reason).toBe("VOUCHER_EXPIRED");
  });

  it("tells an expired code holder it expired, not that they are at the wrong counter", async () => {
    // The ordering claim from the migration's header, asserted rather than
    // trusted. Both facts are true of this code; only one of them is still
    // true tomorrow, and that is the one worth telling somebody.
    const id = await makeVoucher(db, {
      code: "GONEHERE",
      amountCents: 5000,
      expiresAt: "2020-01-01T00:00:00+08:00",
    });
    await openBranch(db, "second");
    await db.query(
      `insert into voucher_branches (voucher_id, branch_id)
       select $1, id from branches where slug = 'second'`,
      [id],
    );
    expect((await preview(db, "GONEHERE", [WINGS])).reason).toBe("VOUCHER_EXPIRED");
  });
});

describe("the discount arithmetic", () => {
  let db: PGlite;

  beforeAll(async () => {
    ({ db } = await liveWorld());
  });

  it("takes a fixed amount off", async () => {
    await makeVoucher(db, { code: "FIXED", amountCents: 10000 });
    expect((await preview(db, "FIXED", [WINGS])).discountCents).toBe(10000);
  });

  it("takes a percentage of the eligible total", async () => {
    await makeVoucher(db, { code: "TENOFF", percentOff: 10 });
    expect((await preview(db, "TENOFF", [WINGS])).discountCents).toBe(WINGS_CENTS / 10);
  });

  it("floors a percentage rather than rounding it up", async () => {
    // Called directly, because no basket in this seed can produce a fraction:
    // every seeded price is a whole number of pesos, so a percentage of it is
    // always a whole number of centavos and the floor never runs. An eligible
    // total of 1015 centavos at 33% is 334.95, and the business keeps the
    // remainder rather than rounding it towards the customer.
    await makeVoucher(db, { code: "ODD", percentOff: 33 });
    const verdict = await scalar<Verdict>(
      db,
      "select resolve_voucher('ODD', null, null, null, 1015, 1015, now())",
    );
    expect(verdict.discountCents).toBe(334);
  });

  it("caps a percentage at the maximum discount when one is set", async () => {
    await makeVoucher(db, { code: "CAPPED", percentOff: 50, maxDiscountCents: 5000 });
    // Half of 117800 is 58900, and the cap is what the customer gets.
    expect((await preview(db, "CAPPED", [WINGS])).discountCents).toBe(5000);
  });

  it("never discounts more than the order is worth", async () => {
    await makeVoucher(db, { code: "HUGE", amountCents: 999_00 });
    const verdict = await preview(db, "HUGE", [RIBS]);
    expect(verdict.discountCents).toBe(RIBS_CENTS);
  });

  it("refuses a percentage that floors away to nothing", async () => {
    // A "voucher applied" line beside a PHP 0.00 discount reads as a bug rather
    // than as arithmetic, so the code is refused instead of applied for zero.
    // Direct again: the cheapest thing in the seed is Set A at 102.00, and 1%
    // of it still rounds to a centavo.
    await makeVoucher(db, { code: "CRUMB", percentOff: 1 });
    const verdict = await scalar<Verdict>(
      db,
      "select resolve_voucher('CRUMB', null, null, null, 50, 50, now())",
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe("VOUCHER_NO_DISCOUNT");
  });
});

describe("scope", () => {
  let db: PGlite;

  beforeAll(async () => {
    ({ db } = await liveWorld());
    await openBranch(db, "elsewhere");
  });

  it("applies everywhere when it names nowhere", async () => {
    await makeVoucher(db, { code: "ANYWHERE", amountCents: 5000 });
    expect((await preview(db, "ANYWHERE", [WINGS])).ok).toBe(true);
  });

  it("refuses a counter it was not issued for", async () => {
    const id = await makeVoucher(db, { code: "ELSEWHERE", amountCents: 5000 });
    await db.query(
      `insert into voucher_branches (voucher_id, branch_id)
       select $1, id from branches where slug = 'elsewhere'`,
      [id],
    );
    expect((await preview(db, "ELSEWHERE", [WINGS])).reason).toBe("VOUCHER_WRONG_BRANCH");
  });

  it("measures an item-scoped discount on the eligible lines only", async () => {
    const id = await makeVoucher(db, { code: "RIBSONLY", percentOff: 10 });
    await db.query(
      `insert into voucher_items (voucher_id, item_id)
       select $1, id from menu_items where slug = 'ribs-original'`,
      [id],
    );

    // Owner decision, 2026-09-04: "10% off ribs" takes 10% off the ribs and
    // nothing off the wings sitting beside them in the same basket.
    const verdict = await preview(db, "RIBSONLY", [WINGS, RIBS]);
    expect(verdict.subtotalCents).toBe(WINGS_CENTS + RIBS_CENTS);
    expect(verdict.eligibleCents).toBe(RIBS_CENTS);
    expect(verdict.discountCents).toBe(RIBS_CENTS / 10);
  });

  it("measures a category-scoped discount the same way", async () => {
    const id = await makeVoucher(db, { code: "WINGCAT", percentOff: 10 });
    await db.query(
      `insert into voucher_categories (voucher_id, category_id)
       select $1, id from menu_categories where slug = 'chicken-wings'`,
      [id],
    );
    const verdict = await preview(db, "WINGCAT", [WINGS, RIBS]);
    expect(verdict.eligibleCents).toBe(WINGS_CENTS);
    expect(verdict.discountCents).toBe(WINGS_CENTS / 10);
  });

  it("refuses when the basket holds none of the items it covers", async () => {
    const id = await makeVoucher(db, { code: "NOMATCH", percentOff: 10 });
    await db.query(
      `insert into voucher_items (voucher_id, item_id)
       select $1, id from menu_items where slug = 'ribs-original'`,
      [id],
    );
    // Distinct from "your order is too small", and it has to be: the customer
    // needs to be told to add ribs, not to spend more on wings.
    expect((await preview(db, "NOMATCH", [WINGS])).reason).toBe("VOUCHER_NO_ELIGIBLE_ITEMS");
  });

  it("refuses a customer the code was not issued to", async () => {
    const id = await makeVoucher(db, { code: "MINEONLY", amountCents: 5000 });
    await db.query(
      "insert into voucher_customers (voucher_id, phone_digits) values ($1, '09991112222')",
      [id],
    );
    expect((await preview(db, "MINEONLY", [WINGS], "0906 440 9999")).reason).toBe(
      "VOUCHER_NOT_YOURS",
    );
    expect((await preview(db, "MINEONLY", [WINGS], "0999 111 2222")).ok).toBe(true);
  });

  it("measures the minimum against the eligible lines, not the whole order", async () => {
    const id = await makeVoucher(db, {
      code: "RIBSMIN",
      percentOff: 10,
      minOrderCents: 100000,
    });
    await db.query(
      `insert into voucher_items (voucher_id, item_id)
       select $1, id from menu_items where slug = 'ribs-original'`,
      [id],
    );
    // The basket is worth 1527.00 but only 349.00 of it is ribs, and the
    // minimum is about the ribs.
    const verdict = await preview(db, "RIBSMIN", [WINGS, RIBS]);
    expect(verdict.reason).toBe(`VOUCHER_BELOW_MINIMUM:100000`);
  });

  it("carries the shortfall so the screen can say how much more is needed", async () => {
    await makeVoucher(db, { code: "BIGMIN", amountCents: 5000, minOrderCents: 200000 });
    expect((await preview(db, "BIGMIN", [WINGS])).reason).toBe("VOUCHER_BELOW_MINIMUM:200000");
  });
});

describe("usage limits", () => {
  it("stops the total cap being exceeded", async () => {
    const { db, slot } = await liveWorld();
    await makeVoucher(db, { code: "TWICE", amountCents: 5000, maxUses: 2 });

    await place(db, [WINGS], slot, { voucher_code: "TWICE" });
    await place(db, [WINGS], slot, { voucher_code: "TWICE" });

    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'TWICE'")).toBe(2);
    await expect(place(db, [WINGS], slot, { voucher_code: "TWICE" })).rejects.toThrow(
      /VOUCHER_EXHAUSTED/,
    );
  });

  it("treats a null cap as unlimited rather than as zero", async () => {
    // The trap spec section 18 calls the more dangerous of the two: a null
    // max_uses read as 0 is a promo code that refuses everybody, and nothing
    // downstream would flag it because 0 is a plausible looking cap.
    const { db, slot } = await liveWorld();
    await makeVoucher(db, { code: "OPEN", amountCents: 5000, maxUses: null });
    for (let i = 0; i < 3; i += 1) {
      await place(db, [WINGS], slot, { voucher_code: "OPEN" });
    }
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'OPEN'")).toBe(3);
  });

  it("stops one customer using a one-per-person code twice", async () => {
    const { db, slot } = await liveWorld();
    await makeVoucher(db, {
      code: "ONEEACH",
      amountCents: 5000,
      maxUses: null,
      maxUsesPerCustomer: 1,
    });
    const phone = "0917 000 1234";

    await place(db, [WINGS], slot, { voucher_code: "ONEEACH", customer_phone: phone });
    await expect(
      place(db, [WINGS], slot, { voucher_code: "ONEEACH", customer_phone: phone }),
    ).rejects.toThrow(/VOUCHER_CUSTOMER_LIMIT/);

    // A different number is a different customer and is unaffected.
    const other = await place(db, [WINGS], slot, {
      voucher_code: "ONEEACH",
      customer_phone: "0917 000 5678",
    });
    expect(other.discountCents).toBe(5000);
  });

  it("recognises the same customer through however they typed their number", async () => {
    // The reason normalize_phone_digits exists: +63 917 000 4321 and
    // 09170004321 are not the same string and are the same person. This is the
    // same normalisation the rate limiter and the returning-customer figure use.
    const { db, slot } = await liveWorld();
    await makeVoucher(db, { code: "ONCE", amountCents: 5000, maxUses: null });

    await place(db, [WINGS], slot, { voucher_code: "ONCE", customer_phone: "09170004321" });
    await expect(
      place(db, [WINGS], slot, { voucher_code: "ONCE", customer_phone: "0917-000-4321" }),
    ).rejects.toThrow(/VOUCHER_CUSTOMER_LIMIT/);
  });

  it("holds the total cap against concurrent checkouts", async () => {
    // The claim uses_count exists to make true. PGlite runs one connection, so
    // a genuine wall-clock race cannot be staged here; what is asserted instead
    // is the guard the race would meet, which is the CHECK rather than a prior
    // read. A second transaction that got past resolve_voucher's read would
    // still have to survive this, and it does not.
    const { db } = await liveWorld();
    await makeVoucher(db, { code: "LASTONE", amountCents: 5000, maxUses: 1 });
    await db.exec("update vouchers set uses_count = 1 where code = 'LASTONE'");

    await expect(
      db.exec("update vouchers set uses_count = uses_count + 1 where code = 'LASTONE'"),
    ).rejects.toThrow(/vouchers_within_max_uses/);
  });
});

describe("placing an order with a voucher", () => {
  let db: PGlite;
  let slot: string;

  beforeAll(async () => {
    ({ db, slot } = await liveWorld());
    await makeVoucher(db, { code: "PLACE50", amountCents: 5000, maxUses: null, maxUsesPerCustomer: 9 });
  });

  it("preserves the subtotal, records the discount, and charges the difference", async () => {
    const placed = await place(db, [WINGS], slot, { voucher_code: "PLACE50" });
    expect(placed.subtotalCents).toBe(WINGS_CENTS);
    expect(placed.discountCents).toBe(5000);
    expect(placed.totalCents).toBe(WINGS_CENTS - 5000);

    const row = await db.query<{
      subtotal_cents: number;
      discount_cents: number;
      total_cents: number;
      voucher_id: string | null;
    }>(
      "select subtotal_cents, discount_cents, total_cents, voucher_id from orders where id = $1",
      [placed.orderId],
    );
    expect(Number(row.rows[0].subtotal_cents)).toBe(WINGS_CENTS);
    expect(Number(row.rows[0].discount_cents)).toBe(5000);
    expect(Number(row.rows[0].total_cents)).toBe(WINGS_CENTS - 5000);
    expect(row.rows[0].voucher_id).not.toBeNull();
  });

  it("bills the payment row the discounted total, not the subtotal", async () => {
    // What actually reaches PayMongo. lib/customer/payment.ts reads
    // payments.amount_cents and nothing else, so this is the assertion that the
    // provider is asked for the right money.
    const placed = await place(db, [WINGS], slot, { voucher_code: "PLACE50" });
    expect(
      Number(
        await scalar<number>(
          db,
          `select amount_cents from payments where order_id = '${placed.orderId}'`,
        ),
      ),
    ).toBe(WINGS_CENTS - 5000);
  });

  it("ignores a discount the client tried to send for itself", async () => {
    // Spec section 22 item 4. The payload carries a code and nothing that names
    // a peso; anything else in it is decoration the function never reads.
    const placed = await place(db, [WINGS], slot, {
      voucher_code: "PLACE50",
      discount_cents: 99999,
      total_cents: 1,
      subtotal_cents: 1,
    });
    expect(placed.discountCents).toBe(5000);
    expect(placed.totalCents).toBe(WINGS_CENTS - 5000);
  });

  it("records what the usage report needs", async () => {
    const placed = await place(db, [WINGS], slot, { voucher_code: "PLACE50" });
    const row = await db.query<{
      amount_cents: number;
      subtotal_cents: number;
      total_cents: number;
      phone_digits: string;
      branch_id: string;
    }>(
      `select amount_cents, subtotal_cents, total_cents, phone_digits, branch_id
       from voucher_redemptions where order_id = $1`,
      [placed.orderId],
    );
    expect(row.rows).toHaveLength(1);
    expect(Number(row.rows[0].amount_cents)).toBe(5000);
    expect(Number(row.rows[0].subtotal_cents)).toBe(WINGS_CENTS);
    expect(Number(row.rows[0].total_cents)).toBe(WINGS_CENTS - 5000);
    expect(row.rows[0].phone_digits).toMatch(/^\d+$/);
    expect(row.rows[0].branch_id).not.toBeNull();
  });

  it("refuses a second voucher on one order", async () => {
    // The stacking rule, and it is the unique index that enforces it rather
    // than a check somebody could later forget to write.
    const placed = await place(db, [WINGS], slot, { voucher_code: "PLACE50" });
    const voucherId = await scalar<string>(db, "select id from vouchers where code = 'PLACE50'");
    await expect(
      db.query(
        `insert into voucher_redemptions (voucher_id, order_id, amount_cents)
         values ($1, $2, 100)`,
        [voucherId, placed.orderId],
      ),
    ).rejects.toThrow(/voucher_redemptions_order_key/);
  });

  it("refuses a code that would leave less to pay than the rail accepts", async () => {
    const { db: fresh, slot: freshSlot } = await liveWorld();
    // All four keys, because app_settings_paymongo_methods_shape (0030)
    // requires the object to name every method rather than only the enabled one.
    await fresh.exec(
      `update app_settings
         set paymongo_enabled = true,
             paymongo_methods =
               '{"qrph": false, "gcash": true, "maya": false, "card": false}'::jsonb
       where id = 1`,
    );
    await makeVoucher(fresh, { code: "NEARLYALL", amountCents: WINGS_CENTS - 50 });
    // MIN_ONLINE_PAYMENT_CENTS is 100 for every method, so 50 centavos left to
    // pay is an intent PayMongo would reject. Better refused on the form.
    await expect(
      place(fresh, [WINGS], freshSlot, {
        voucher_code: "NEARLYALL",
        payment_method: "gcash",
      }),
    ).rejects.toThrow(/VOUCHER_TOTAL_TOO_LOW/);
  });
});

describe("giving the voucher back", () => {
  async function placedWithVoucher(): Promise<{ db: PGlite; orderId: string }> {
    const { db, slot } = await liveWorld();
    await makeVoucher(db, { code: "RETURNME", amountCents: 5000, maxUses: 1 });
    const placed = await place(db, [WINGS], slot, { voucher_code: "RETURNME" });
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'RETURNME'")).toBe(
      1,
    );
    return { db, orderId: placed.orderId };
  }

  it("returns the use when the order is cancelled", async () => {
    // The path an abandoned or failed online payment takes: 0030:193 and
    // 0039:63 both land on cancelled, so neither of those functions had to be
    // edited for this to work.
    const { db, orderId } = await placedWithVoucher();
    await db.query("update orders set status = 'cancelled' where id = $1", [orderId]);

    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'RETURNME'")).toBe(
      0,
    );
    expect(
      await scalar<number>(
        db,
        `select count(*) from voucher_redemptions where order_id = '${orderId}'`,
      ),
    ).toBe(0);
  });

  it("returns the use when the counter rejects the order", async () => {
    const { db, orderId } = await placedWithVoucher();
    await db.query("update orders set status = 'rejected' where id = $1", [orderId]);
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'RETURNME'")).toBe(
      0,
    );
  });

  it("frees the code for somebody else once it comes back", async () => {
    const { db, orderId } = await placedWithVoucher();
    const slot = await firstSlot(db);
    await db.query("update orders set status = 'cancelled' where id = $1", [orderId]);

    const second = await place(db, [WINGS], slot, { voucher_code: "RETURNME" });
    expect(second.discountCents).toBe(5000);
  });

  it("keeps the use when the customer does not collect", async () => {
    // A no-show ordered, paid and redeemed the code. What happens to the money
    // afterwards is a different question, and is open question 5b.
    const { db, orderId } = await placedWithVoucher();
    await db.query("update orders set status = 'no_show' where id = $1", [orderId]);
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'RETURNME'")).toBe(
      1,
    );
  });

  it("does not double-return when a cancelled order is updated again", async () => {
    const { db, orderId } = await placedWithVoucher();
    await db.query("update orders set status = 'cancelled' where id = $1", [orderId]);
    await db.query("update orders set notes = 'touched again' where id = $1", [orderId]);
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'RETURNME'")).toBe(
      0,
    );
  });
});

describe("the preview and the placement agree", () => {
  it("shows the discount the order is then charged", async () => {
    const { db, slot } = await liveWorld();
    await makeVoucher(db, { code: "AGREE", percentOff: 15, maxUses: null });

    const shown = await preview(db, "AGREE", [WINGS, RIBS]);
    const placed = await place(db, [WINGS, RIBS], slot, { voucher_code: "AGREE" });

    expect(shown.ok).toBe(true);
    expect(placed.discountCents).toBe(shown.discountCents);
    expect(placed.subtotalCents).toBe(shown.subtotalCents);
  });

  it("refuses a cart it cannot price rather than discounting part of it", async () => {
    const { db } = await liveWorld();
    await makeVoucher(db, { code: "CARTGONE", amountCents: 5000 });
    expect(
      (await preview(db, "CARTGONE", [WINGS, { ...RIBS, item_slug: "not-on-the-menu" }])).reason,
    ).toBe("VOUCHER_CART_CHANGED");
  });
});
