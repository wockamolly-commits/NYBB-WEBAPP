import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "76000000-0000-4000-8000-000000000001";
const MANAGER = "76000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "76000000-0000-4000-8000-000000000003";

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
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active, is_accepting_orders)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true, true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');
  `);
  return db;
}

describe("store availability owner RPCs", () => {
  let db: PGlite;

  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants the authenticated workspace reader, never anon", async () => {
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', 'staff_list_store_availability()', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_list_store_availability()', 'execute')`)).toBe(false);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_set_store_hours(uuid, jsonb)', 'execute')`)).toBe(false);
  });

  it("shows a branch-scoped cashier only their own counter", async () => {
    const rows = await asUser<{ slug: string; hours: unknown }>(db, CASHIER, "select slug, hours from staff_list_store_availability()");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe("pilot");
    expect(rows[0]?.hours).toEqual([]);
  });

  it("allows the shift permission to pause its own counter and records the change", async () => {
    const pilot = await scalar<string>(db, "select id::text from branches where slug = 'pilot'");
    await asUser(db, CASHIER, `select staff_set_branch_accepting_orders('${pilot}', false)`);
    const branches = await asUser<{ slug: string; is_accepting_orders: boolean }>(
      db,
      ROVING_MANAGER,
      "select slug, is_accepting_orders from staff_list_store_availability() order by slug",
    );
    expect(branches.find((branch) => branch.slug === "pilot")?.is_accepting_orders).toBe(false);
    const audit = await asUser<{ action: string }>(
      db,
      ROVING_MANAGER,
      "select action from audit_logs order by id desc limit 1",
    );
    expect(audit[0]?.action).toBe("store.orders_paused");
  });

  it("does not let a cashier edit planned capacity or hours", async () => {
    const pilot = await scalar<string>(db, "select id::text from branches where slug = 'pilot'");
    await expect(asUser(db, CASHIER, `select staff_set_branch_settings('${pilot}', true, 30, 15, 8)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_set_store_hours('${pilot}', '[]'::jsonb)`)).rejects.toThrow(/FORBIDDEN/);
  });

  it("writes a whole weekly schedule atomically and audits one row", async () => {
    const pilot = await scalar<string>(db, "select id::text from branches where slug = 'pilot'");
    const week = JSON.stringify(Array.from({ length: 7 }, (_, weekday) => ({ weekday, is_closed: weekday === 0, opens_at: "11:00", closes_at: "22:00" }))).replace(/'/g, "''");
    await asUser(db, MANAGER, `select staff_set_store_hours('${pilot}', '${week}'::jsonb)`);
    expect(await scalar<number>(db, "select count(*)::int from store_hours where branch_id = (select id from branches where slug = 'pilot')")).toBe(7);
    expect(await scalar<boolean>(db, "select is_closed from store_hours where branch_id = (select id from branches where slug = 'pilot') and weekday = 0")).toBe(true);
    expect(await scalar<string>(db, "select to_char(opens_at, 'HH24:MI') from store_hours where branch_id = (select id from branches where slug = 'pilot') and weekday = 0")).toBe("11:00");
    expect(await scalar<string>(db, "select to_char(closes_at, 'HH24:MI') from store_hours where branch_id = (select id from branches where slug = 'pilot') and weekday = 0")).toBe("22:00");
    expect(await scalar<number>(db, "select count(*)::int from audit_logs where action = 'store.hours_changed'")).toBe(1);
    await asUser(db, MANAGER, `select staff_set_store_hours('${pilot}', '[{"weekday":1,"is_closed":false,"opens_at":"00:00","closes_at":"00:00"}]'::jsonb)`);
    expect(await scalar<string>(db, "select to_char(opens_at, 'HH24:MI') from store_hours where branch_id = (select id from branches where slug = 'pilot') and weekday = 1")).toBe("00:00");
    expect(await scalar<string>(db, "select to_char(closes_at, 'HH24:MI') from store_hours where branch_id = (select id from branches where slug = 'pilot') and weekday = 1")).toBe("00:00");
  });

  it("keeps business-wide intake away from a branch manager", async () => {
    await expect(asUser(db, MANAGER, "select staff_set_order_intake(false, 12)")).rejects.toThrow(/BUSINESS_WIDE_FORBIDDEN/);
    await asUser(db, ROVING_MANAGER, "select staff_set_order_intake(false, 12)");
    expect(await scalar<boolean>(db, "select accepting_orders from app_settings where id = 1")).toBe(false);
    expect(await scalar<string>(db, "select action from audit_logs order by id desc limit 1")).toBe("store.order_intake_changed");
  });
});
