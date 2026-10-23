import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/** Migration 0097: who a push reaches, and how often. */

const CASHIER = "7b000000-0000-4000-8000-000000000001";

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values ('${CASHIER}', 'cashier@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City' from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches;
    insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key, profile_id)
    values ('staff', 'web', 'https://fcm.googleapis.com/fcm/send/tablet', 'k', 'a', '${CASHIER}');
  `);
  return db;
}

const targets = (db: PGlite) =>
  scalar<number>(db, "select count(*)::int from staff_push_targets((select id from branches))");

describe("staff_push_targets", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("reaches a cashier who can view orders", async () => {
    expect(await targets(db)).toBe(1);
  });

  it("stops once an override takes orders:view away", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${CASHIER}', 'orders:view', false)
    `);
    expect(await targets(db)).toBe(0);
  });
});

describe("claim_customer_ready_notice", () => {
  it("is won once per ready order", async () => {
    const db = await setup();
    const orderId = await scalar<string>(
      db,
      `insert into orders (short_code, pickup_code, status, branch_id, price_list_id, customer_name, customer_phone, total_cents)
       select 'NY-RDY001', '1234', 'ready', b.id, b.price_list_id, 'C', '09170000000', 100 from branches b
       returning id::text`,
    );
    expect(await scalar<boolean>(db, `select claim_customer_ready_notice('${orderId}')`)).toBe(true);
    expect(await scalar<boolean>(db, `select claim_customer_ready_notice('${orderId}')`)).toBe(false);
  });

  it("is never won for an order that is not ready", async () => {
    const db = await setup();
    const orderId = await scalar<string>(
      db,
      `insert into orders (short_code, pickup_code, status, branch_id, price_list_id, customer_name, customer_phone, total_cents)
       select 'NY-PRP001', '1235', 'preparing', b.id, b.price_list_id, 'C', '09170000000', 100 from branches b
       returning id::text`,
    );
    expect(await scalar<boolean>(db, `select claim_customer_ready_notice('${orderId}')`)).toBe(false);
  });

  it("is server only", async () => {
    const db = await freshDatabase();
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(db, `select has_function_privilege('${role}', 'claim_customer_ready_notice(uuid)', 'execute')`),
      ).toBe(false);
    }
  });
});
