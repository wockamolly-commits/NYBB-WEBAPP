import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * Tests over the publicise switch, migration 0073.
 *
 * The one that matters is "it works on a locked code". 0067 freezes a
 * voucher's terms once it has met an order, and it deliberately left
 * admin_set_voucher_active outside that freeze because switching a code off is
 * the brake, and a freeze that froze the brake would be worse than the bug it
 * fixed. Publicise is the gentler brake: taking a promo off the storefront
 * without refusing it for the customers already holding it. If it were frozen,
 * an owner whose campaign had gone wrong would have to reach for the hard
 * brake instead and break somebody's checkout, which is the same failure 0067
 * describes.
 *
 * The other half is that it is genuinely not a term. Nothing below changes
 * what a code is worth, where it applies, or who may hold it, so no past
 * order's record can be made to disagree with itself by flipping it.
 */

const MANAGER_ID = "78000000-0000-4000-8000-000000000001";
const CASHIER_ID = "78000000-0000-4000-8000-000000000002";

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
    set role authenticated;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

function payload(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    code: "LAUNCH50",
    description: "Fifty off the launch week",
    amountCents: 5000,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    maxUses: null,
    maxUsesPerCustomer: 1,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    branchIds: [],
    itemIds: [],
    categoryIds: [],
    customerPhones: [],
    customerUserIds: [],
    ...over,
  }).replace(/'/g, "''");
}

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER_ID}', 'manager@example.com'),
      ('${CASHIER_ID}', 'cashier@example.com');
    insert into profiles (id, role, staff_role, display_name, branch_id) values
      ('${MANAGER_ID}', 'staff', 'manager', 'Manager', null),
      ('${CASHIER_ID}', 'staff', 'cashier', 'Cashier', null);
  `);
  return db;
}

async function create(db: PGlite, over: Record<string, unknown> = {}): Promise<string> {
  const rows = await asUser<{ id: string }>(
    db,
    MANAGER_ID,
    `select admin_upsert_voucher('${payload(over)}'::jsonb) as id`,
  );
  return rows[0].id;
}

async function publiciseOf(db: PGlite, id: string): Promise<boolean> {
  const rows = await db.query<{ publicise: boolean }>(
    `select publicise from vouchers where id = '${id}'`,
  );
  return rows.rows[0].publicise;
}

/** An order that named the code, which is what 0067 counts as "used". */
async function redeemed(db: PGlite, id: string): Promise<void> {
  await db.exec(`
    insert into orders (
      short_code, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, voucher_id
    )
    select 'ZZZ111', b.id, b.price_list_id, '0001', 'Steven', '09170000000', '${id}'
    from branches b order by b.slug limit 1;
  `);
}

describe("creating a code", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("does not advertise it unless asked", async () => {
    // No feature ships defaulted to on, and this one decides whether a code
    // the owner may have meant to keep quiet goes on a public page.
    const id = await create(db);
    expect(await publiciseOf(db, id)).toBe(false);
  });

  it("advertises it when the form says so", async () => {
    const id = await create(db, { publicise: true });
    expect(await publiciseOf(db, id)).toBe(true);
  });

  it("leaves it off when the form omits the field entirely", async () => {
    // A payload from an older client must not start advertising anything.
    const id = await create(db);
    await asUser(
      db,
      MANAGER_ID,
      `select admin_upsert_voucher('${payload({ id })}'::jsonb)`,
    );
    expect(await publiciseOf(db, id)).toBe(false);
  });
});

describe("the switch on its own", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("turns advertising on and back off", async () => {
    const id = await create(db);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_publicise('${id}', true)`);
    expect(await publiciseOf(db, id)).toBe(true);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_publicise('${id}', false)`);
    expect(await publiciseOf(db, id)).toBe(false);
  });

  it("refuses somebody without vouchers:manage", async () => {
    const id = await create(db);
    await expect(
      asUser(db, CASHIER_ID, `select admin_set_voucher_publicise('${id}', true)`),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("names a voucher that does not exist rather than silently doing nothing", async () => {
    await expect(
      asUser(
        db,
        MANAGER_ID,
        `select admin_set_voucher_publicise('78000000-0000-4000-8000-0000000000ff', true)`,
      ),
    ).rejects.toThrow(/VOUCHER_NOT_FOUND/);
  });

  it("records who changed it and what it was before", async () => {
    const id = await create(db);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_publicise('${id}', true)`);
    const rows = await db.query<{ action: string; diff: { before: boolean; after: boolean } }>(
      `select action, diff from audit_logs
       where target_table = 'vouchers' and target_id = '${id}'
         and action like 'voucher.%publicise'`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].action).toBe("voucher.publicise");
    expect(rows.rows[0].diff.before).toBe(false);
    expect(rows.rows[0].diff.after).toBe(true);
  });
});

describe("a code that has met an order", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("still refuses an edit to its terms", async () => {
    // 0067's rule is untouched. This is the guard the switch below exists to
    // route around, so a test that stopped proving it still holds would let
    // the freeze quietly disappear.
    const id = await create(db);
    await redeemed(db, id);
    await expect(
      asUser(
        db,
        MANAGER_ID,
        `select admin_upsert_voucher('${payload({ id, amountCents: 9900 })}'::jsonb)`,
      ),
    ).rejects.toThrow(/VOUCHER_LOCKED/);
  });

  it("can still be taken off the storefront", async () => {
    // The whole point. The owner keeps the gentle brake, so a campaign that
    // has gone wrong does not have to be switched off under the customers
    // already holding the code.
    const id = await create(db, { publicise: true });
    await redeemed(db, id);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_publicise('${id}', false)`);
    expect(await publiciseOf(db, id)).toBe(false);
  });

  it("can still be put on the storefront", async () => {
    // Soft launch, check it works on a real order, then announce. A freeze
    // here would make the ordinary campaign sequence impossible.
    const id = await create(db);
    await redeemed(db, id);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_publicise('${id}', true)`);
    expect(await publiciseOf(db, id)).toBe(true);
  });

  it("can still be switched off, which 0067 already guaranteed", async () => {
    const id = await create(db);
    await redeemed(db, id);
    await asUser(db, MANAGER_ID, `select admin_set_voucher_active('${id}', false)`);
    const rows = await db.query<{ is_active: boolean }>(
      `select is_active from vouchers where id = '${id}'`,
    );
    expect(rows.rows[0].is_active).toBe(false);
  });
});

describe("who may call it", () => {
  it("is reachable by a signed-in staff session and by nobody else", async () => {
    const db = await world();
    const rows = await db.query<{ grantee: string }>(`
      select grantee from information_schema.routine_privileges
      where routine_name = 'admin_set_voucher_publicise' and privilege_type = 'EXECUTE'
    `);
    expect(rows.rows.map((r) => r.grantee).sort()).toEqual(
      ["authenticated", "postgres"].sort(),
    );
  });
});
