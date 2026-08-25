import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "79000000-0000-4000-8000-000000000001";

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
    insert into auth.users (id, email) values ('${CASHIER}', 'cashier@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';

    insert into menu_categories (slug, name) values ('wings', 'Wings'), ('sides', 'Sides');
    insert into menu_items (category_id, slug, name)
    select id, 'chicken-wings', 'Chicken Wings' from menu_categories where slug = 'wings';
    insert into menu_items (category_id, slug, name)
    select id, 'fries', 'Fries' from menu_categories where slug = 'sides';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default)
    select id, 'regular', 'Regular', 'REG', 10000, true from menu_items where slug = 'chicken-wings';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default)
    select id, 'regular', 'Regular', 'REG', 5000, true from menu_items where slug = 'fries';
  `);
  return db;
}

const itemId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from menu_items where slug = '${slug}'`);
const branchId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);

/** The item slugs the storefront would render for a branch. */
async function menuSlugs(db: PGlite, branchSlug: string | null): Promise<string[]> {
  const arg = branchSlug === null ? "null" : `'${branchSlug}'`;
  const menu = await scalar<Array<{ items: Array<{ slug: string }> }>>(
    db, `select get_storefront_menu(${arg})`,
  );
  return menu.flatMap((category) => category.items.map((item) => item.slug)).sort();
}

describe("hold aware storefront readers", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("shows every active item when nothing is held", async () => {
    expect(await menuSlugs(db, "pilot")).toEqual(["chicken-wings", "fries"]);
  });

  it("hides a held item at the held branch and nowhere else", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite')`);

    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);
    expect(await menuSlugs(db, "other")).toEqual(["chicken-wings", "fries"]);
  });

  it("hides nothing when no branch has been chosen", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite')`);

    expect(await menuSlugs(db, null)).toEqual(["chicken-wings", "fries"]);
  });

  it("drops a category whose every item is held", async () => {
    const fries = await itemId(db, "fries");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${fries}', '${pilot}', 'indefinite')`);

    const menu = await scalar<Array<{ slug: string }>>(db, `select get_storefront_menu('pilot')`);
    expect(menu.map((category) => category.slug)).toEqual(["wings"]);
  });

  it("shows a held item again once its hold has expired", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'until', now() - interval '1 second' + interval '2 seconds')`);
    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', null)`);
    expect(await menuSlugs(db, "pilot")).toEqual(["chicken-wings", "fries"]);
  });
});
