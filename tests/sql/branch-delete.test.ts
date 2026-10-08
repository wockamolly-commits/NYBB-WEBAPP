import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const MANAGER = "84000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "84000000-0000-4000-8000-000000000003";

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$; set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER}', 'manager@example.com'),
      ('${ROVING_MANAGER}', 'roving@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'spare', 'Spare', 'Spare', 'mall', id, 'Mall', 'Cebu City' from price_lists;
    insert into store_hours (branch_id, weekday, opens_at, closes_at)
    select id, 1, '11:00', '22:00' from branches where slug = 'spare';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');
  `);
  return db;
}

const id = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);
const remove = (branchId: string) => `select staff_delete_branch('${branchId}')`;

describe("staff_delete_branch", () => {
  let db: PGlite;

  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants the workspace, never anon", async () => {
    expect(await scalar<boolean>(db, "select has_function_privilege('authenticated', 'staff_delete_branch(uuid)', 'execute')")).toBe(true);
    expect(await scalar<boolean>(db, "select has_function_privilege('anon', 'staff_delete_branch(uuid)', 'execute')")).toBe(false);
  });

  it("deletes an unused branch with its hours, and keeps its audit trail detached", async () => {
    const spare = await id(db, "spare");
    await asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${spare}', 10.3, 123.9)`);
    await asUser(db, ROVING_MANAGER, remove(spare));

    expect(await scalar<number>(db, `select count(*)::int from branches where id = '${spare}'`)).toBe(0);
    expect(await scalar<number>(db, `select count(*)::int from store_hours where branch_id = '${spare}'`)).toBe(0);

    const trail = await db.query<{ action: string; branch_id: string | null; short_name: string | null }>(
      `select action, branch_id::text, diff->'before'->>'short_name' as short_name
       from audit_logs where target_id = '${spare}' order by id`,
    );
    expect(trail.rows).toEqual([
      { action: "store.branch_location_changed", branch_id: null, short_name: null },
      { action: "store.branch_deleted", branch_id: null, short_name: "Spare" },
    ]);
  });

  it("refuses a branch manager tied to one counter", async () => {
    await expect(asUser(db, MANAGER, remove(await id(db, "spare")))).rejects.toThrow(/BUSINESS_WIDE_FORBIDDEN/);
  });

  it("refuses a branch that is still switched on", async () => {
    await db.exec("update branches set is_active = false where slug = 'pilot'; update profiles set branch_id = null");
    await db.exec("update branches set is_active = true where slug = 'spare'");
    await expect(asUser(db, ROVING_MANAGER, remove(await id(db, "spare")))).rejects.toThrow(/BRANCH_ACTIVE/);
  });

  it("refuses a branch that has taken an order", async () => {
    await db.exec(`
      insert into orders (short_code, branch_id, price_list_id, pickup_code, customer_name, customer_phone)
      select 'NY-SPARE1', id, price_list_id, '1111', 'Customer', '09170000000' from branches where slug = 'spare';
    `);
    await expect(asUser(db, ROVING_MANAGER, remove(await id(db, "spare")))).rejects.toThrow(/BRANCH_HAS_ORDERS/);
  });

  // A null branch on a profile means business wide, so deleting the branch
  // out from under a cashier would promote them to every counter.
  it("refuses a branch somebody is assigned to, or invited to", async () => {
    await db.exec("update branches set is_active = false where slug = 'pilot'");
    await expect(asUser(db, ROVING_MANAGER, remove(await id(db, "pilot")))).rejects.toThrow(/BRANCH_HAS_STAFF/);

    await db.exec(`
      insert into staff_invitations (email, display_name, branch_id, token_hash, invited_by_profile_id, expires_at)
      select 'new@example.com', 'New', id, 'hash', '${ROVING_MANAGER}', now() + interval '2 days' from branches where slug = 'spare';
    `);
    await expect(asUser(db, ROVING_MANAGER, remove(await id(db, "spare")))).rejects.toThrow(/BRANCH_HAS_STAFF/);

    // An invitation nobody can accept any more holds nothing up.
    await db.exec("update staff_invitations set expires_at = now() - interval '1 minute'");
    await asUser(db, ROVING_MANAGER, remove(await id(db, "spare")));
    expect(await scalar<number>(db, "select count(*)::int from branches where slug = 'spare'")).toBe(0);
  });

  // A code with no branch rows is valid everywhere, so the cascade would widen it.
  it("refuses a branch a promo code is limited to", async () => {
    await db.exec(`
      insert into vouchers (code, amount_cents, note) values ('SPARE', 5000, 'spare only');
      insert into voucher_branches (voucher_id, branch_id)
      select v.id, b.id from vouchers v, branches b where v.code = 'SPARE' and b.slug = 'spare';
    `);
    await expect(asUser(db, ROVING_MANAGER, remove(await id(db, "spare")))).rejects.toThrow(/BRANCH_HAS_PROMOS/);
  });
});
