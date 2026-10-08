import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "83000000-0000-4000-8000-000000000001";
const MANAGER = "83000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "83000000-0000-4000-8000-000000000003";

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
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, phones, is_active, sort_order)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', array['0917 111 1111'], true, 1 from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, sort_order)
    select 'other', 'Other', 'Other', 'mall', id, 'Mall', 'Cebu City', 2 from price_lists;
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

function update(branchId: string, shortName = "Pilot Lahug", phones = "array[' 0917 222 2222 ', '']") {
  return `select staff_update_branch_details('${branchId}', 'NYBB Hot Wings, Pilot Lahug', '${shortName}', 'food-hall', '12 New Road', '', 'Cebu City', ${phones})`;
}

describe("staff_update_branch_details", () => {
  let db: PGlite;

  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants the workspace, never anon", async () => {
    const signature = "staff_update_branch_details(uuid, text, text, text, text, text, text, text[])";
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    expect(await scalar<boolean>(db, "select has_function_privilege('anon', 'staff_list_branch_details()', 'execute')")).toBe(false);
  });

  it("updates the details, keeps the slug, and audits before and after", async () => {
    const pilot = await id(db, "pilot");
    await asUser(db, ROVING_MANAGER, update(pilot));
    const row = await db.query<{ slug: string; short_name: string; format: string; address_line: string; barangay: string | null; phones: string[] }>(
      "select slug, short_name, format, address_line, barangay, phones from branches where id = $1",
      [pilot],
    );
    expect(row.rows[0]).toEqual({
      slug: "pilot",
      short_name: "Pilot Lahug",
      format: "food-hall",
      address_line: "12 New Road",
      barangay: null,
      phones: ["0917 222 2222"],
    });
    const audit = await db.query<{ action: string; before: string; after: string }>(
      "select action, diff->'before'->>'short_name' as before, diff->'after'->>'short_name' as after from audit_logs order by id desc limit 1",
    );
    expect(audit.rows[0]).toEqual({ action: "store.branch_details_changed", before: "Pilot", after: "Pilot Lahug" });
  });

  it("writes no audit row when nothing changed", async () => {
    const pilot = await id(db, "pilot");
    await asUser(db, ROVING_MANAGER, update(pilot));
    await asUser(db, ROVING_MANAGER, update(pilot));
    expect(await scalar<number>(db, "select count(*)::int from audit_logs")).toBe(1);
  });

  it("lets a branch manager edit their own branch only, and never a cashier", async () => {
    await asUser(db, MANAGER, update(await id(db, "pilot")));
    await expect(asUser(db, MANAGER, update(await id(db, "other"), "Other Mall"))).rejects.toThrow(/BRANCH_FORBIDDEN/);
    await expect(asUser(db, CASHIER, update(await id(db, "pilot")))).rejects.toThrow(/FORBIDDEN/);
    const rows = await asUser<{ slug: string }>(db, MANAGER, "select slug from staff_list_branch_details()");
    expect(rows.map((r) => r.slug)).toEqual(["pilot"]);
  });

  it("refuses another branch's short name but allows keeping its own", async () => {
    await expect(asUser(db, ROVING_MANAGER, update(await id(db, "pilot"), "OTHER"))).rejects.toThrow(/DUPLICATE_SHORT_NAME/);
    await asUser(db, ROVING_MANAGER, update(await id(db, "pilot"), "Pilot"));
    expect(await scalar<string>(db, "select short_name from branches where slug = 'pilot'")).toBe("Pilot");
  });

  it("can clear every phone number", async () => {
    const pilot = await id(db, "pilot");
    await asUser(db, ROVING_MANAGER, update(pilot, "Pilot", "array[]::text[]"));
    expect(await scalar<string[]>(db, "select phones from branches where slug = 'pilot'")).toEqual([]);
  });
});
