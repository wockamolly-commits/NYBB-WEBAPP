import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * 0048, the claim that makes telling the counter exactly once.
 *
 * The function is three lines of SQL and every one of its callers is a
 * retrying caller: a Server Action replayed by a flaky connection, a webhook
 * PayMongo redelivers. What is actually under test here is that the second
 * caller gets `false` and therefore sends nothing, because a duplicate alert
 * on a lock screen reads as a second order.
 */

let pickupCodeCounter = 4800;

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

async function addOrder(db: PGlite, code: string) {
  pickupCodeCounter += 1;
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents
    )
    select '${code}', 'pending', b.id, b.price_list_id, '${pickupCodeCounter}',
           'Customer', '09170000000', 32900
    from branches b where b.slug = 'pilot'
    returning id::text
  `);
}

const claim = (db: PGlite, id: string | null) =>
  scalar<boolean>(db, `
    select claim_staff_new_order_notice(${id ? `'${id}'::uuid` : "null::uuid"})
  `);

describe("claim_staff_new_order_notice", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("grants the claim to the first caller and refuses every one after it", async () => {
    const orderId = await addOrder(db, "NY-SNO001");

    expect(await claim(db, orderId)).toBe(true);
    expect(await claim(db, orderId)).toBe(false);
    expect(await claim(db, orderId)).toBe(false);
  });

  it("stamps the order the first time and does not move the stamp again", async () => {
    const orderId = await addOrder(db, "NY-SNO002");

    await claim(db, orderId);
    const first = await scalar<string>(db, `
      select staff_notified_at::text from orders where id = '${orderId}'
    `);
    expect(first).not.toBeNull();

    await claim(db, orderId);
    expect(await scalar<string>(db, `
      select staff_notified_at::text from orders where id = '${orderId}'
    `)).toBe(first);
  });

  it("leaves an unclaimed order unstamped", async () => {
    const orderId = await addOrder(db, "NY-SNO003");
    expect(await scalar<string | null>(db, `
      select staff_notified_at::text from orders where id = '${orderId}'
    `)).toBeNull();
  });

  it("claims each order separately", async () => {
    const first = await addOrder(db, "NY-SNO004");
    const second = await addOrder(db, "NY-SNO005");

    expect(await claim(db, first)).toBe(true);
    expect(await claim(db, second)).toBe(true);
  });

  // An order id nobody recognizes and an order already announced get the same
  // answer, and the caller does the same thing with it: nothing. A missing
  // order is not an error worth a different code path, because the only caller
  // is a notification that must never fail the mutation behind it.
  it("refuses an unknown order and a null id without raising", async () => {
    expect(await claim(db, "11111111-1111-4111-8111-111111111111")).toBe(false);
    expect(await claim(db, null)).toBe(false);
  });

  it("does not change the order's status or its lifecycle stamps", async () => {
    const orderId = await addOrder(db, "NY-SNO006");
    await claim(db, orderId);

    const row = await scalar<string>(db, `
      select status::text || ' ' ||
             coalesce(accepted_at::text, 'null') || ' ' ||
             coalesce(ready_at::text, 'null')
      from orders where id = '${orderId}'
    `);
    expect(row).toBe("pending null null");
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  // The dispatch path runs on the admin client, so service_role is the only
  // caller. A browser holding this would be able to keep the counter quiet by
  // claiming the notice before the server got to it, which is a worse failure
  // than any it could cause by calling it too often.
  it("exposes the claim to service_role and to nobody else", async () => {
    const signature = "claim_staff_new_order_notice(uuid)";
    const check = async (role: string) =>
      scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

    expect(await check("service_role")).toBe(true);
    expect(await check("anon")).toBe(false);
    expect(await check("authenticated")).toBe(false);
  });
});
