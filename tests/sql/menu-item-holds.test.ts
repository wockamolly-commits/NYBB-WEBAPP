import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "78000000-0000-4000-8000-000000000001";
const OTHER_CASHIER = "78000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "78000000-0000-4000-8000-000000000003";

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
      ('${OTHER_CASHIER}', 'other@example.com'),
      ('${ROVING_MANAGER}', 'roving@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${OTHER_CASHIER}', 'staff', 'cashier', 'Other cashier', id from branches where slug = 'other';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');

    insert into menu_categories (slug, name) values ('wings', 'Wings');
    insert into menu_items (category_id, slug, name)
    select id, 'chicken-wings', 'Chicken Wings' from menu_categories where slug = 'wings';
  `);
  return db;
}

const itemId = (db: PGlite) => scalar<string>(db, "select id::text from menu_items where slug = 'chicken-wings'");
const branchId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);

describe("menu item branch holds", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants execute to authenticated and never to anon", async () => {
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz)', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz)', 'execute')`)).toBe(false);
  });

  it("never grants the table's writes to authenticated", async () => {
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'select')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'insert')`)).toBe(false);
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'delete')`)).toBe(false);
  });

  it("reports an item with no hold as available", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(true);
  });

  it("reports an item as available when no branch is given", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', null)`)).toBe(true);
  });

  it("lets a cashier hold an item at their own branch only", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    const other = await branchId(db, "other");

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(true);

    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite')`),
    ).rejects.toThrow(/BRANCH_FORBIDDEN/);
  });

  it("expires a timed hold with no sweep in between", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() + interval '2 hours')`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now())`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now() + interval '3 hours')`)).toBe(true);
  });

  it("refuses a timed hold with no end and a past end", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', null)`),
    ).rejects.toThrow(/HOLD_NEEDS_AN_END/);
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() - interval '1 hour')`),
    ).rejects.toThrow(/HOLD_END_IN_PAST/);
  });

  // 0056. An indefinite hold has no end, so it stores none whatever the
  // caller sent alongside it. menu_item_is_available never read the column for
  // this kind, so nothing behaved differently; the row simply read as if it
  // expired at six, which is the wrong thing for a future reader to conclude.
  // Sending the value twice must still be a no-op, so the comparison has to be
  // against what gets stored rather than against what arrived.
  it("stores no end date on an indefinite hold, whatever the caller sends", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(
      db, CASHIER,
      `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', now() + interval '2 hours')`,
    );
    expect(await scalar<string | null>(db, "select unavailable_until from menu_item_branch_holds")).toBe(null);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(false);

    await asUser(
      db, CASHIER,
      `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', now() + interval '9 hours')`,
    );
    expect(await scalar<number>(db, "select count(*)::int from audit_logs")).toBe(1);
  });

  it("lifts a hold when kind is null, and leaves no row behind", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(true);
    expect(await scalar<number>(db, "select count(*)::int from menu_item_branch_holds")).toBe(0);
  });

  it("lets a roving manager hold at any branch", async () => {
    const item = await itemId(db);
    const other = await branchId(db, "other");
    await asUser(db, ROVING_MANAGER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(false);
  });

  it("records one branch scoped audit row per real change and none for a no-op", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);

    const rows = await asUser<{ action: string; branch_id: string | null }>(
      db, ROVING_MANAGER, "select action, branch_id::text from audit_logs order by id",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("menu.item.held");
    expect(rows[0]?.branch_id).toBe(pilot);

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);
    const after = await asUser<{ action: string }>(db, ROVING_MANAGER, "select action from audit_logs order by id");
    expect(after.map((row) => row.action)).toEqual(["menu.item.held", "menu.item.released"]);
  });
});
