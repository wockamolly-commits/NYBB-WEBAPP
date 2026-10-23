import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * 0080, the claim that makes "the customer is here" ring the counter once.
 *
 * customer_mark_order_arrived answers true to every tap, so the push cannot
 * key on its answer. What is under test is that the second caller gets false,
 * and that an order which has not arrived, or is no longer waiting, is never
 * announced at all.
 */

let pickupCodeCounter = 5800;

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
  `);
  return db;
}

async function addOrder(db: PGlite, code: string, status: string, arrived: boolean) {
  pickupCodeCounter += 1;
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, customer_arrived_at
    )
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCodeCounter}',
           'Customer', '09170000000', 32900, ${arrived ? "now()" : "null"}
    from branches b where b.slug = 'pilot'
    returning id::text
  `);
}

const claim = (db: PGlite, id: string | null) =>
  scalar<boolean>(db, `
    select claim_staff_arrival_notice(${id ? `'${id}'::uuid` : "null::uuid"})
  `);

describe("claim_staff_arrival_notice", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("grants the claim to the first caller and refuses every one after it", async () => {
    const orderId = await addOrder(db, "NY-SAN001", "ready", true);

    expect(await claim(db, orderId)).toBe(true);
    expect(await claim(db, orderId)).toBe(false);
    expect(await claim(db, orderId)).toBe(false);
  });

  it("refuses an order whose customer has not arrived", async () => {
    const orderId = await addOrder(db, "NY-SAN002", "ready", false);
    expect(await claim(db, orderId)).toBe(false);
  });

  it("refuses an order that is no longer waiting at the counter", async () => {
    const orderId = await addOrder(db, "NY-SAN003", "claimed", true);
    expect(await claim(db, orderId)).toBe(false);
  });

  it("refuses an unknown order and a null id without raising", async () => {
    expect(await claim(db, "11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(await claim(db, null)).toBe(false);
  });

  it("leaves the new-order notice and the status alone", async () => {
    const orderId = await addOrder(db, "NY-SAN004", "ready", true);
    await claim(db, orderId);
    expect(await scalar<string>(db, `
      select status::text || ' ' || coalesce(staff_notified_at::text, 'null')
      from orders where id = '${orderId}'
    `)).toBe("ready null");
  });

  it("exposes the claim to service_role and to nobody else", async () => {
    const signature = "claim_staff_arrival_notice(uuid)";
    const check = async (role: string) =>
      scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

    expect(await check("service_role")).toBe(true);
    expect(await check("anon")).toBe(false);
    expect(await check("authenticated")).toBe(false);
  });
});
