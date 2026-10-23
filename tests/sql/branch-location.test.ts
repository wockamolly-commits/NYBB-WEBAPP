import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "82000000-0000-4000-8000-000000000001";
const MANAGER = "82000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "82000000-0000-4000-8000-000000000003";

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
      ('${CASHIER}', 'cashier@example.com'),
      ('${MANAGER}', 'manager@example.com'),
      ('${ROVING_MANAGER}', 'roving@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active, sort_order)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true, 1 from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, phones, sort_order)
    select 'new-site', 'New site', 'New site', 'mall', id, 'Mall', 'Cebu City', array['0917'], 2 from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');
  `);
  return db;
}

const id = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);

describe("branch directory and location", () => {
  let db: PGlite;

  beforeEach(async () => { db = await setup(); }, 120_000);

  it("lets anon read every branch, switched on or not, but not set a pin", async () => {
    expect(await scalar<boolean>(db, "select has_function_privilege('anon', 'get_branch_directory()', 'execute')")).toBe(true);
    expect(await scalar<boolean>(db, "select has_function_privilege('anon', 'staff_set_branch_location(uuid, numeric, numeric)', 'execute')")).toBe(false);
    await db.exec("set role anon");
    try {
      const rows = (await db.query<{ slug: string; phones: string[] }>("select slug, phones from get_branch_directory()")).rows;
      expect(rows).toEqual([
        { slug: "pilot", phones: [] },
        { slug: "new-site", phones: ["0917"] },
      ]);
    } finally {
      await db.exec("reset role");
    }
  });

  it("sets, audits and clears a pin, and skips a no-op", async () => {
    const site = await id(db, "new-site");
    await asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', 10.312345678, 123.9)`);
    expect(await scalar<string>(db, "select lat::text from get_branch_directory() where slug = 'new-site'")).toBe("10.3123457");
    expect(await scalar<string>(db, "select action from audit_logs order by id desc limit 1")).toBe("store.branch_location_changed");

    await asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', 10.3123457, 123.9)`);
    expect(await scalar<number>(db, "select count(*)::int from audit_logs")).toBe(1);

    await asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', null, null)`);
    expect(await scalar<string | null>(db, "select lat::text from branches where slug = 'new-site'")).toBeNull();
    expect(await scalar<string>(db, "select action from audit_logs order by id desc limit 1")).toBe("store.branch_location_cleared");
  });

  it("lets a branch manager pin their own branch and nobody else's", async () => {
    await asUser(db, MANAGER, `select staff_set_branch_location('${await id(db, "pilot")}', 10.3, 123.9)`);
    await expect(asUser(db, MANAGER, `select staff_set_branch_location('${await id(db, "new-site")}', 10.3, 123.9)`)).rejects.toThrow(/BRANCH_FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_set_branch_location('${await id(db, "pilot")}', 10.3, 123.9)`)).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses half a coordinate and one typed the wrong way round", async () => {
    const site = await id(db, "new-site");
    await expect(asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', 10.3, null)`)).rejects.toThrow(/INVALID_INPUT/);
    await expect(asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', 123.9, 10.3)`)).rejects.toThrow(/LOCATION_OUTSIDE_PHILIPPINES/);
    await expect(asUser(db, ROVING_MANAGER, `select staff_set_branch_location('${site}', 0, 0)`)).rejects.toThrow(/LOCATION_OUTSIDE_PHILIPPINES/);
  });
});
