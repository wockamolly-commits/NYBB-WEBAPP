import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/** Migration 0094: what anon may call directly, and the preview's peso floor. */

const RIBS = { item_slug: "ribs-original", variation_slug: "regular", qty: 1 };

// counterPayments: false is the shipped state (0087), which the harness
// otherwise switches on for the older order tests.
async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true, counterPayments: false });
  await db.exec(`
    insert into branches (
      slug, name, short_name, format, price_list_id, address_line, city,
      is_active, is_accepting_orders, pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
    )
    select 'pilot', 'Branch pilot', 'pilot', 'street', pl.id, '1 Test Street', 'Cebu City',
           true, true, 15, 50, 20
    from price_lists pl order by pl.slug limit 1;
    update app_settings set vouchers_enabled = true where id = 1;
  `);
  return db;
}

const preview = (db: PGlite, code: string) =>
  db
    .query<{ verdict: { ok: boolean; reason?: string } }>(
      "select preview_voucher($1, 'pilot', $2::jsonb, '0917 123 4567') as verdict",
      [code, JSON.stringify([RIBS])],
    )
    .then((result) => result.rows[0].verdict);

describe("preview_voucher after 0094", () => {
  it("is not callable by anon, and is by a signed-in customer and the server", async () => {
    const db = await freshDatabase();
    const can = (role: string) =>
      scalar<boolean>(
        db,
        `select has_function_privilege('${role}', 'preview_voucher(text, text, jsonb, text)', 'execute')`,
      );
    expect(await can("anon")).toBe(false);
    expect(await can("authenticated")).toBe(true);
    expect(await can("service_role")).toBe(true);
  });

  it("refuses a code that would leave an online order under a peso, as placement does", async () => {
    const db = await world();
    await db.exec(`
      insert into vouchers (code, percent_off, max_uses_per_customer, is_active) values ('FREE', 100, 1, true);
      insert into vouchers (code, amount_cents, max_uses_per_customer, is_active) values ('FIFTY', 5000, 1, true);
    `);
    expect((await preview(db, "FREE")).reason).toBe("VOUCHER_TOTAL_TOO_LOW");
    expect((await preview(db, "FIFTY")).ok).toBe(true);
  });

  it("allows the same code while counter payments are on, because a peso can be handed over", async () => {
    const db = await world();
    await db.exec(`
      update app_settings set counter_payments_enabled = true where id = 1;
      insert into vouchers (code, percent_off, max_uses_per_customer, is_active) values ('FREE', 100, 1, true);
    `);
    expect((await preview(db, "FREE")).ok).toBe(true);
  });
});
