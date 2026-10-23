import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0090: one customer, one phone number.
 *
 * Before it, the voucher engine recognised a customer by the digits of the
 * number exactly as typed, so "0917 123 4567" and "+63 917 123 4567" were two
 * customers. A once-per-customer code could be used again by retyping the
 * number, and a code restricted to one spelling refused the customer typing
 * another.
 */

const RIBS = { item_slug: "ribs-original", variation_slug: "regular", qty: 1 };

async function world(): Promise<{ db: PGlite; slot: string }> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into branches (
      slug, name, short_name, format, price_list_id, address_line, city,
      is_active, is_accepting_orders,
      pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
    )
    select 'pilot', 'Branch pilot', 'pilot', 'street', pl.id, '1 Test Street', 'Cebu City',
           true, true, 15, 50, 20
    from price_lists pl order by pl.slug limit 1;
    insert into store_hours (branch_id, weekday, opens_at, closes_at)
    select b.id, d, '00:00'::time, '23:59:59'::time
    from branches b, generate_series(0, 6) d where b.slug = 'pilot';
    update app_settings
      set vouchers_enabled = true,
          paymongo_enabled = true,
          paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb,
          counter_payments_enabled = true
      where id = 1;
  `);
  const slots = await db.query<{ payload: { slots: { startsAt: string }[] } }>(
    "select get_pickup_slots('pilot') as payload",
  );
  return { db, slot: slots.rows[0].payload.slots[0].startsAt };
}

let attempt = 0;
async function place(
  db: PGlite,
  slot: string,
  phone: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  attempt += 1;
  await db.query("select place_order($1::jsonb, $2::uuid)", [
    JSON.stringify({
      branch_slug: "pilot",
      customer_name: "Ana Reyes",
      customer_phone: phone,
      pickup_slot_start: slot,
      lines: [RIBS],
      ...extra,
    }),
    `00000000-0000-4000-8000-${attempt.toString().padStart(12, "0")}`,
  ]);
}

describe("normalize_phone_digits", () => {
  it("reduces every written form of a Philippine mobile to one", async () => {
    const db = await freshDatabase();
    for (const typed of ["0917 123 4567", "+63 917 123 4567", "917-123-4567", "0063 917 123 4567", "639171234567"]) {
      expect(await scalar<string>(db, `select normalize_phone_digits('${typed}')`)).toBe("639171234567");
    }
  });

  it("reduces every written form of a Philippine landline to one", async () => {
    const db = await freshDatabase();
    for (const typed of ["(032) 318-2405", "+63 32 318 2405", "+63 (032) 318 2405", "63323182405"]) {
      expect(await scalar<string>(db, `select normalize_phone_digits('${typed}')`)).toBe("63323182405");
    }
  });

  it("leaves foreign numbers as their digits, and nothing as null", async () => {
    const db = await freshDatabase();
    expect(await scalar<string>(db, "select normalize_phone_digits('+1 415 555 0100')")).toBe("14155550100");
    expect(await scalar<string | null>(db, "select normalize_phone_digits('call me')")).toBeNull();
  });
});

describe("the per-customer cap across spellings of one number", () => {
  it("counts a retyped number as the same customer", async () => {
    const { db, slot } = await world();
    await db.exec(`
      insert into vouchers (code, amount_cents, max_uses_per_customer, is_active)
      values ('ONCE', 5000, 1, true)
    `);
    await place(db, slot, "0917 123 4567", { voucher_code: "ONCE" });
    for (const retyped of ["+63 917 123 4567", "917 123 4567", "0063 917 123 4567"]) {
      await expect(place(db, slot, retyped, { voucher_code: "ONCE" })).rejects.toThrow(
        /VOUCHER_CUSTOMER_LIMIT/,
      );
    }
    expect(await scalar<number>(db, "select uses_count from vouchers where code = 'ONCE'")).toBe(1);
  });

  it("lets a restricted code through however the customer writes their number", async () => {
    const { db, slot } = await world();
    const voucherId = await scalar<string>(
      db,
      `insert into vouchers (code, amount_cents, max_uses_per_customer, is_active)
       values ('YOURS', 5000, 5, true) returning id`,
    );
    await db.query(
      "insert into voucher_customers (voucher_id, phone_digits) values ($1, normalize_phone_digits('0918 000 0000'))",
      [voucherId],
    );
    await place(db, slot, "+63 918 000 0000", { voucher_code: "YOURS" });
    await expect(place(db, slot, "0918 000 0001", { voucher_code: "YOURS" })).rejects.toThrow(
      /VOUCHER_NOT_YOURS/,
    );
  });
});

describe("unpaid online orders per number", () => {
  it("refuses a third unpaid online order from one number, and still takes a counter order", async () => {
    const { db, slot } = await world();
    await place(db, slot, "0917 555 0000", { payment_method: "qrph" });
    await place(db, slot, "+63 917 555 0000", { payment_method: "qrph" });
    await expect(place(db, slot, "917 555 0000", { payment_method: "qrph" })).rejects.toThrow(
      /UNPAID_ORDERS_OPEN/,
    );
    await place(db, slot, "0917 555 0000", { payment_method: "counter" });
    // Another number is unaffected.
    await place(db, slot, "0917 555 0001", { payment_method: "qrph" });
  });

  it("serialises the count per number, so two requests at once cannot both pass", async () => {
    // PGlite has one connection, so the race itself cannot be staged here.
    // What is checked is that the lock is taken before the count, on the
    // canonical number, which is what makes the second request wait.
    const db = await freshDatabase();
    const body = await scalar<string>(db, "select prosrc from pg_proc where proname = 'place_order'");
    const lock = body.indexOf("pg_advisory_xact_lock(hashtextextended('place_order:unpaid:' || v_digits");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(body.indexOf("UNPAID_ORDERS_OPEN"));
  });

  it("cannot be skipped by writing the number another way", async () => {
    const { db, slot } = await world();
    await place(db, slot, "0917 555 0100", { payment_method: "qrph" });
    await place(db, slot, "0063-917-555-0100", { payment_method: "qrph" });
    for (const typed of ["+63 917 555 0100", "917.555.0100", "(0917) 555 0100", "639175550100"]) {
      await expect(place(db, slot, typed, { payment_method: "qrph" })).rejects.toThrow(/UNPAID_ORDERS_OPEN/);
    }
  });

  it("stops counting an order once it is paid", async () => {
    const { db, slot } = await world();
    await place(db, slot, "0917 555 0002", { payment_method: "qrph" });
    await place(db, slot, "0917 555 0002", { payment_method: "qrph" });
    await db.exec("update payments set status = 'paid' where status = 'pending'");
    await place(db, slot, "0917 555 0002", { payment_method: "qrph" });
  });
});
