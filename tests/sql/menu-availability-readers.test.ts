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
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite', null, 'out_of_stock')`);

    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);
    expect(await menuSlugs(db, "other")).toEqual(["chicken-wings", "fries"]);
  });

  it("shows an item held at one branch when the caller named no branch", async () => {
    // THIS IS 0057, AND IT USED TO ASSERT THE OPPOSITE.
    //
    // /menu is what every customer sees before they have chosen a store, and
    // it calls get_storefront_menu with no slug. That used to resolve through
    // resolve_pickup_branch_id, which returns the FIRST ACTIVE BRANCH rather
    // than null, so one counter's sold out list was applied to everybody. A
    // customer who had not picked a store, and might well have been about to
    // pick the other one, could not see the item at all.
    //
    // Written straight into the table rather than through
    // staff_set_menu_item_hold, because the resolved branch is not
    // necessarily 'pilot', the only branch this cashier is scoped to.
    const wings = await itemId(db, "chicken-wings");
    const resolved = await scalar<string>(db, "select resolve_pickup_branch_id(null)::text");
    await db.exec(
      `insert into menu_item_branch_holds (item_id, branch_id, kind)
       values ('${wings}', '${resolved}', 'indefinite')`,
    );

    // Held at the counter that answers a no-slug call, and still on the menu
    // of a customer who has not named a counter.
    expect(await menuSlugs(db, null)).toEqual(["chicken-wings", "fries"]);

    // And the moment they do name that counter, it is hidden again. The two
    // assertions together are the whole point: the branch-less menu stops
    // prejudging which store was meant, and no branch's own menu changes.
    const resolvedSlug = await scalar<string>(
      db, `select slug from branches where id = '${resolved}'`,
    );
    expect(await menuSlugs(db, resolvedSlug)).toEqual(["fries"]);
  });

  it("still prices a no-slug call against the active branch", async () => {
    // 0057 changed which branch's HOLDS a no-slug call applies, and nothing
    // about which branch's PRICES it uses. The two resolvers deliberately
    // disagree now: a menu with no prices cannot be rendered at all, so
    // pricing has to pick something, while availability has a correct answer
    // for "no branch chosen" and it is "show everything". If a later edit
    // makes the price list null too, every price comes back null and this
    // catches it.
    const menu = await scalar<Array<{ items: Array<{ slug: string; variations: Array<{ priceCents: number }> }> }>>(
      db, "select get_storefront_menu(null)",
    );
    const wings = menu.flatMap((c) => c.items).find((item) => item.slug === "chicken-wings");
    expect(wings?.variations[0]?.priceCents).toBe(10000);
  });

  it("still hides an item that is off the menu everywhere, with no branch named", async () => {
    // is_active is the global switch and 0057 does not touch it. A no-slug
    // call hides nothing a COUNTER has held; it does not become a menu that
    // shows everything.
    await db.exec("update menu_items set is_active = false where slug = 'chicken-wings'");
    expect(await menuSlugs(db, null)).toEqual(["fries"]);
  });

  it("hides nothing when no branch is active at all", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    await db.exec("update branches set is_active = false");

    // With nothing trading there is no counter whose stock could be out, so
    // resolve_pickup_branch_id(null) returns null and the availability call
    // sees a null branch, which hides nothing.
    expect(await menuSlugs(db, null)).toEqual(["chicken-wings", "fries"]);
  });

  it("drops a category whose every item is held", async () => {
    const fries = await itemId(db, "fries");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${fries}', '${pilot}', 'indefinite', null, 'out_of_stock')`);

    const menu = await scalar<Array<{ slug: string }>>(db, `select get_storefront_menu('pilot')`);
    expect(menu.map((category) => category.slug)).toEqual(["wings"]);
  });

  it("shows a held item again once its hold is lifted", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite', null, 'out_of_stock')`);
    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', null)`);
    expect(await menuSlugs(db, "pilot")).toEqual(["chicken-wings", "fries"]);
  });

  it("treats a timed hold as available again once its end has passed", async () => {
    // No sleeping: the hold is set with a real future end, then
    // menu_item_is_available is asked about two fixed instants rather than
    // waited on, so the assertion cannot flake against the wall clock.
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    const holdEnd = await scalar<string>(db, "select (now() + interval '1 day')::text");
    await asUser(
      db, CASHIER,
      `select staff_set_menu_item_hold('${wings}', '${pilot}', 'until', '${holdEnd}'::timestamptz, 'out_of_stock')`,
    );

    expect(
      await scalar<boolean>(db, `select menu_item_is_available('${wings}', '${pilot}', now())`),
    ).toBe(false);
    expect(
      await scalar<boolean>(
        db,
        `select menu_item_is_available('${wings}', '${pilot}', '${holdEnd}'::timestamptz + interval '1 hour')`,
      ),
    ).toBe(true);
  });
});
