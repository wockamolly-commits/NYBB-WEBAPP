import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Order history reads the closed orders and six child tables in one embedded
 * select (lib/staff/order-history.ts). The page narrows to the person's own
 * branch with `.eq("branch_id", ...)`, but that is a convenience, not the
 * guard: the anon key is in every browser, so anyone signed in can send the
 * same select to PostgREST with the filter removed, a different branch id, or
 * another counter's order id. Each of these reads therefore has to come back
 * empty from the policies alone, which is what this file checks, one table at
 * a time, as the real `authenticated` role.
 */

const PINNED_MANAGER = "76000000-0000-4000-8000-000000000001";
const PINNED_CASHIER = "76000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "76000000-0000-4000-8000-000000000003";
const SUPER_ADMIN = "76000000-0000-4000-8000-000000000004";

async function actingAs<T>(
  db: PGlite,
  profileId: string,
  sql: string,
): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${profileId}'::uuid $$;
  `);
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function count(db: PGlite, profileId: string, sql: string): Promise<number> {
  const rows = await actingAs<{ n: number }>(db, profileId, `select count(*)::int as n from (${sql}) q`);
  return rows[0]!.n;
}

describe("Order history branch scope", () => {
  let db: PGlite;
  let homeOrder: string;
  let otherOrder: string;
  let otherBranch: string;

  async function addClosedOrder(code: string, branchSlug: string): Promise<string> {
    const slot = await scalar<string>(db, `
      insert into pickup_slots (branch_id, slot_start, capacity, reserved)
      select id, '2026-10-01T03:00:00Z'::timestamptz, 6, 1
      from branches where slug = '${branchSlug}'
      on conflict (branch_id, slot_start) do update set reserved = pickup_slots.reserved
      returning id::text
    `);
    const orderId = await scalar<string>(db, `
      insert into orders (
        short_code, status, branch_id, price_list_id, pickup_code, pickup_slot_id,
        customer_name, customer_phone, total_cents, claimed_at
      )
      select '${code}', 'claimed', b.id, b.price_list_id, '1357', '${slot}',
             'Customer ${code}', '09170000000', 30000, now()
      from branches b where b.slug = '${branchSlug}'
      returning id::text
    `);
    const lineId = await scalar<string>(db, `
      insert into order_items (
        order_id, item_id, variation_id, item_name_snapshot,
        variation_label_snapshot, unit_price_cents, qty, line_total_cents
      )
      select '${orderId}', v.item_id, v.id, 'Wings', v.label, 30000, 1, 30000
      from item_variations v order by v.id limit 1
      returning id::text
    `);
    await db.exec(`
      insert into order_item_options (order_item_id, option_id, group_name_snapshot, name_snapshot)
      select '${lineId}', o.id, 'Flavour', 'Buffalo' from menu_options o order by o.id limit 1;
      insert into payments (order_id, method, provider, status, amount_cents, provider_payment_id)
      values ('${orderId}', 'qrph', 'paymongo', 'paid', 30000, 'pay_${code}');
      insert into refunds (payment_id, order_id, amount_cents, reason, status)
      select id, order_id, 1000, 'others', 'succeeded' from payments where order_id = '${orderId}';
      insert into order_status_events (order_id, from_status, to_status)
      values ('${orderId}', 'ready', 'claimed');
    `);
    return orderId;
  }

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await db.exec(`
      update app_settings set
        paymongo_enabled = true,
        paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb
      where id = 1;
      insert into auth.users (id, email) values
        ('${PINNED_MANAGER}', 'pinned.manager@example.com'),
        ('${PINNED_CASHIER}', 'pinned.cashier@example.com'),
        ('${ROVING_MANAGER}', 'roving@example.com'),
        ('${SUPER_ADMIN}', 'admin@example.com');
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${PINNED_MANAGER}', 'staff', 'manager', 'Pinned Manager', id
      from branches where slug = 'garden-bloc';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${PINNED_CASHIER}', 'staff', 'cashier', 'Pinned Cashier', id
      from branches where slug = 'garden-bloc';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${SUPER_ADMIN}', 'admin', null, 'Super Admin', null);
    `);
    homeOrder = await addClosedOrder("NY-HOME01", "garden-bloc");
    otherOrder = await addClosedOrder("NY-AWAY01", "shell-gorordo");
    otherBranch = await scalar<string>(db, "select id::text from branches where slug = 'shell-gorordo'");
  }, 120_000);

  // Every table the history select embeds, addressed by the other counter's
  // order id, which is the record-ID manipulation the page has to survive.
  const childReads = (orderId: string) => ({
    orders: `select id from orders where id = '${orderId}'`,
    order_items: `select id from order_items where order_id = '${orderId}'`,
    order_item_options: `select oio.id from order_item_options oio
      join order_items oi on oi.id = oio.order_item_id where oi.order_id = '${orderId}'`,
    payments: `select id from payments where order_id = '${orderId}'`,
    refunds: `select id from refunds where order_id = '${orderId}'`,
    order_status_events: `select id from order_status_events where order_id = '${orderId}'`,
    pickup_slots: `select s.id from pickup_slots s
      where s.id = (select pickup_slot_id from orders o where o.id = '${orderId}')`,
  });

  it("refuses another counter's order and every row under it, read by id", async () => {
    for (const persona of [PINNED_MANAGER, PINNED_CASHIER]) {
      for (const [table, sql] of Object.entries(childReads(otherOrder))) {
        expect(await count(db, persona, sql), `${table} leaked to ${persona}`).toBe(0);
      }
    }
  });

  it("refuses another counter's rows when the branch filter is swapped or removed", async () => {
    expect(await count(db, PINNED_MANAGER, `select id from orders where branch_id = '${otherBranch}'`)).toBe(0);
    expect(await count(db, PINNED_MANAGER, "select id from orders where short_code = 'NY-AWAY01'")).toBe(0);
    const codes = await actingAs<{ short_code: string }>(db, PINNED_MANAGER, "select short_code from orders");
    expect(codes.map((row) => row.short_code)).toEqual(["NY-HOME01"]);
  });

  it("still shows the person their own counter's order in full", async () => {
    for (const [table, sql] of Object.entries(childReads(homeOrder))) {
      // pickup_slots is read through orders, so it is present when orders is.
      expect(await count(db, PINNED_MANAGER, sql), `${table} missing`).toBeGreaterThan(0);
    }
  });

  it("shows both counters to a business wide manager and the Super Admin", async () => {
    for (const persona of [ROVING_MANAGER, SUPER_ADMIN]) {
      for (const [table, sql] of Object.entries(childReads(otherOrder))) {
        expect(await count(db, persona, sql), `${table} hidden from ${persona}`).toBeGreaterThan(0);
      }
    }
  });

  it("refuses a refund on another counter's order", async () => {
    await expect(
      actingAs(db, PINNED_MANAGER, `select staff_request_refund(
        '${otherOrder}', 1000, 'requested_by_customer', null
      )`),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});
