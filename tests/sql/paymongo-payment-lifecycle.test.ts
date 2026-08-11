import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    update app_settings set
      paymongo_enabled = true,
      paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb,
      online_payment_expiry_minutes = 15
    where id = 1;
  `);
  return db;
}

async function addOnlineOrder(db: PGlite, code: string, intent: string) {
  const slotId = await scalar<string>(db, `
    insert into pickup_slots (branch_id, slot_start, capacity, reserved)
    select id, now() + interval '1 hour', 6, 1 from branches where slug = 'pilot'
    returning id::text
  `);
  const orderId = await scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_slot_id, pickup_code,
      customer_name, customer_phone, total_cents, placed_at
    )
    select '${code}', 'pending', b.id, b.price_list_id, '${slotId}', '2468',
           'Customer', '09170000000', 32900, now() - interval '20 minutes'
    from branches b where b.slug = 'pilot'
    returning id::text
  `);
  await db.exec(`
    insert into payments (
      order_id, method, provider, status, amount_cents, provider_intent_id, reference
    ) values ('${orderId}', 'qrph', 'paymongo', 'pending', 32900, '${intent}', 'client-key');
  `);
  return { orderId, slotId };
}

describe("PayMongo payment lifecycle", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("fails closed for disabled methods and keeps reconciliation functions service-role only", async () => {
    await expect(db.exec(`
      insert into payments (order_id, method, provider, status, amount_cents)
      select gen_random_uuid(), 'gcash', 'paymongo', 'pending', 100
    `)).rejects.toThrow(/PAYMENT_METHOD_UNAVAILABLE/);
    expect(await scalar<boolean>(db, `select has_function_privilege(
      'service_role', 'apply_paymongo_payment(text, text, text, jsonb)', 'execute'
    )`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege(
      'anon', 'apply_paymongo_payment(text, text, text, jsonb)', 'execute'
    )`)).toBe(false);
    expect(await scalar<boolean>(db, `select has_function_privilege(
      'authenticated', 'expire_unpaid_online_orders()', 'execute'
    )`)).toBe(false);
  });

  it("marks a matching pending intent paid without changing the order lifecycle", async () => {
    const { orderId } = await addOnlineOrder(db, "NY-PAY001", "pi_paid");
    await db.exec(`select apply_paymongo_payment('pi_paid', 'paid', 'pay_paid', '{"event":"paid"}'::jsonb)`);
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("paid");
    expect(await scalar<string>(db, `select status::text from orders where id = '${orderId}'`)).toBe("pending");
    expect(await scalar<string>(db, `select provider_payment_id from payments where order_id = '${orderId}'`)).toBe("pay_paid");
    await db.exec(`select apply_paymongo_payment('pi_paid', 'failed', 'pay_late_failure', '{}'::jsonb)`);
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("paid");
  });

  it("expires unpaid orders and releases their provisional slot", async () => {
    const { orderId, slotId } = await addOnlineOrder(db, "NY-EXPIRE", "pi_expire");
    expect(await scalar<number>(db, "select expire_unpaid_online_orders()")).toBe(1);
    expect(await scalar<string>(db, `select status::text from orders where id = '${orderId}'`)).toBe("cancelled");
    expect(await scalar<string>(db, `select cancelled_reason from orders where id = '${orderId}'`)).toBe("payment_timeout");
    expect(await scalar<number>(db, `select reserved from pickup_slots where id = '${slotId}'`)).toBe(0);
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("failed");
    expect(await scalar<number>(db, `select count(*)::int from order_status_events where order_id = '${orderId}' and reason = 'payment_timeout'`)).toBe(1);
  });

  it("records a late paid webhook as money needing a refund, without reopening the expired order", async () => {
    const { orderId } = await addOnlineOrder(db, "NY-LATE01", "pi_late");
    await db.exec("select expire_unpaid_online_orders()");
    await db.exec(`select apply_paymongo_payment('pi_late', 'paid', 'pay_late', '{"event":"paid"}'::jsonb)`);
    expect(await scalar<string>(db, `select status::text from orders where id = '${orderId}'`)).toBe("cancelled");
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("paid");
    expect(await scalar<boolean>(db, `select needs_refund from payments where order_id = '${orderId}'`)).toBe(true);
  });
});
