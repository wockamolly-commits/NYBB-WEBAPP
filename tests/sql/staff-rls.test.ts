import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const STAFF_ID = "74000000-0000-4000-8000-000000000001";
const COLLEAGUE_ID = "74000000-0000-4000-8000-000000000002";

async function asAuthenticated<T>(
  db: PGlite,
  sql: string,
): Promise<readonly T[]> {
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

describe("Workspace row security", () => {
  let db: PGlite;
  let pilotBranchId: string;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email)
      values
        ('${STAFF_ID}', 'staff@example.com'),
        ('${COLLEAGUE_ID}', 'colleague@example.com');
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select '${STAFF_ID}'::uuid $$;

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';

      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${STAFF_ID}', 'staff', 'cashier', 'Cashier', id
      from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id, phone)
      select '${COLLEAGUE_ID}', 'staff', 'kitchen', 'Colleague', id, '09170000002'
      from branches where slug = 'pilot';

      insert into menu_categories (slug, name) values ('wings', 'Wings');
      insert into orders
        (short_code, branch_id, price_list_id, pickup_code,
         customer_name, customer_phone)
      select 'NY-PILOT1', id, price_list_id, '1111', 'Pilot Customer', '09170000000'
      from branches where slug = 'pilot';
      insert into orders
        (short_code, branch_id, price_list_id, pickup_code,
         customer_name, customer_phone)
      select 'NY-OTHER1', id, price_list_id, '2222', 'Other Customer', '09170000001'
      from branches where slug = 'other';
    `);
    pilotBranchId = await scalar<string>(
      db,
      `select id::text from branches where slug = 'pilot'`,
    );
  }, 120_000);

  it("keeps branch-scoped staff inside their assigned order rows", async () => {
    const rows = await asAuthenticated<{ short_code: string }>(
      db,
      "select short_code from orders order by short_code",
    );
    expect(rows).toEqual([{ short_code: "NY-PILOT1" }]);
    expect(
      await asAuthenticated<{ allowed: boolean }>(
        db,
        `select current_staff_can_access_branch('${pilotBranchId}') as allowed`,
      ),
    ).toEqual([{ allowed: true }]);
  });

  it("honors an explicit orders:view denial in direct Data API reads", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'orders:view', false)
    `);
    const rows = await asAuthenticated<{ count: number }>(
      db,
      "select count(*)::int as count from orders",
    );
    expect(rows).toEqual([{ count: 0 }]);
    await db.exec(`delete from staff_permission_overrides where profile_id = '${STAFF_ID}'`);
  });

  it("does not expose coworker profiles without audit permission", async () => {
    expect(
      await asAuthenticated<{ id: string }>(
        db,
        "select id::text from profiles order by id",
      ),
    ).toEqual([{ id: STAFF_ID }]);

    await db.exec(`update profiles set staff_role = 'manager' where id = '${STAFF_ID}'`);
    expect(
      await asAuthenticated<{ count: number }>(
        db,
        "select count(*)::int as count from profiles",
      ),
    ).toEqual([{ count: 2 }]);

    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'audit:view', false)
    `);
    expect(
      await asAuthenticated<{ id: string }>(
        db,
        "select id::text from profiles order by id",
      ),
    ).toEqual([{ id: STAFF_ID }]);
    await db.exec(`
      delete from staff_permission_overrides where profile_id = '${STAFF_ID}';
      update profiles set staff_role = 'cashier' where id = '${STAFF_ID}';
    `);
  });

  it("applies role defaults to catalog reads and denies bare writes", async () => {
    expect(
      await asAuthenticated<{ count: number }>(
        db,
        "select count(*)::int as count from menu_categories",
      ),
    ).toEqual([{ count: 1 }]);

    await db.exec(`update profiles set staff_role = 'kitchen' where id = '${STAFF_ID}'`);
    expect(
      await asAuthenticated<{ count: number }>(
        db,
        "select count(*)::int as count from menu_categories",
      ),
    ).toEqual([{ count: 0 }]);

    await db.exec("set role authenticated");
    try {
      await expect(
        db.exec("insert into menu_categories (slug, name) values ('unsafe', 'Unsafe')"),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});
