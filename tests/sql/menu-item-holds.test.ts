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
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz, text)', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz, text)', 'execute')`)).toBe(false);
  });

  it("refuses to take an item off a counter with no reason given", async () => {
    // The whole point of 0058. A hold with no reason is what the old function
    // wrote on every call, and the audit trail could not tell a broken fryer
    // from a delivery that did not arrive a week later.
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`),
    ).rejects.toThrow(/HOLD_NEEDS_A_REASON/);
    expect(await scalar<number>(db, "select count(*)::int from menu_item_branch_holds")).toBe(0);
  });

  it("refuses a reason that is not one of the four", async () => {
    // Raised by name rather than left to the column's check constraint, so
    // the workspace gets something it can turn into a sentence. The
    // constraint stays as the guard against a writer that is not this
    // function.
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'because')`),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it("stores the reason and writes it into the audit trail", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'equipment')`);

    expect(await scalar<string>(db, "select reason from menu_item_branch_holds")).toBe("equipment");
    expect(
      await scalar<string>(db, "select diff->'after'->>'reason' from audit_logs where action = 'menu.item.held'"),
    ).toBe("equipment");
  });

  it("records on release what the item had been off for", async () => {
    // The row is deleted by a lift, so the release diff is the only place the
    // reason survives. A manager asking "why was this off yesterday" reads
    // the trail, not the table.
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'ingredients')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);

    expect(
      await scalar<string>(db, "select diff->'before'->>'reason' from audit_logs where action = 'menu.item.released'"),
    ).toBe("ingredients");
  });

  it("changing only the reason is a real change, not a no-op", async () => {
    // The no-op guard compares kind and end. Without the reason beside them,
    // correcting "out of stock" to "equipment" returns early and writes
    // nothing, and the screen shows the correction that never happened.
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'equipment')`);

    expect(await scalar<string>(db, "select reason from menu_item_branch_holds")).toBe("equipment");
    expect(
      await scalar<number>(db, "select count(*)::int from audit_logs where action = 'menu.item.held'"),
    ).toBe(2);
  });

  it("lifts a hold without asking for a reason", async () => {
    // Putting an item back needs no explanation: the row and its reason go
    // together, and requiring one to delete a row would be a form in the way
    // of good news.
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'temporary')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);
    expect(await scalar<number>(db, "select count(*)::int from menu_item_branch_holds")).toBe(0);
  });

  it("keeps the four reasons and nothing else in the column's own guard", async () => {
    // The function is one writer. The constraint is what holds if another
    // ever appears, so it is asserted separately from the function's raise.
    await expect(
      db.exec(`insert into menu_item_branch_holds (item_id, branch_id, kind, reason)
               select mi.id, b.id, 'indefinite', 'vibes'
               from menu_items mi, branches b
               where mi.slug = 'chicken-wings' and b.slug = 'pilot'`),
    ).rejects.toThrow(/hold_reason_is_known/);
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
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', null)`)).toBe(true);
  });

  it("lets a cashier hold an item at their own branch only", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    const other = await branchId(db, "other");

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(true);

    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite', null, 'out_of_stock')`),
    ).rejects.toThrow(/BRANCH_FORBIDDEN/);
  });

  it("expires a timed hold with no sweep in between", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() + interval '2 hours', 'out_of_stock')`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now())`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now() + interval '3 hours')`)).toBe(true);
  });

  it("refuses a timed hold with no end and a past end", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', null, 'out_of_stock')`),
    ).rejects.toThrow(/HOLD_NEEDS_AN_END/);
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() - interval '1 hour', 'out_of_stock')`),
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
      `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', now() + interval '2 hours', 'out_of_stock')`,
    );
    expect(await scalar<string | null>(db, "select unavailable_until from menu_item_branch_holds")).toBe(null);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(false);

    await asUser(
      db, CASHIER,
      `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', now() + interval '9 hours', 'out_of_stock')`,
    );
    expect(await scalar<number>(db, "select count(*)::int from audit_logs")).toBe(1);
  });

  it("lifts a hold when kind is null, and leaves no row behind", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(true);
    expect(await scalar<number>(db, "select count(*)::int from menu_item_branch_holds")).toBe(0);
  });

  it("lets a roving manager hold at any branch", async () => {
    const item = await itemId(db);
    const other = await branchId(db, "other");
    await asUser(db, ROVING_MANAGER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite', null, 'out_of_stock')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(false);
  });

  it("records one branch scoped audit row per real change and none for a no-op", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite', null, 'out_of_stock')`);

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
