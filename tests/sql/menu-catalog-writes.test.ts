import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "7a000000-0000-4000-8000-000000000001";
const MANAGER = "7a000000-0000-4000-8000-000000000002";

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$; set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/**
 * The same acting person, without the `authenticated` role.
 *
 * Only staff_reorder_menu needs this, and only since 0056 revoked its execute
 * grant: nothing in the app calls it, so leaving it reachable exposed a write
 * nobody could use. The function itself is unchanged and its behaviour is
 * still worth pinning, because the grant comes back with the screen that
 * calls it. Running it as the database owner exercises the body and its
 * permission check exactly as a restored grant would, and the case below
 * asserts the grant really is gone.
 */
async function asOwner<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$;`);
  return (await db.query<T>(sql)).rows;
}

/**
 * The catalog is shared by all nine branches, so every audit row these
 * functions write carries a null branch_id. 0023 reads a null branch as
 * business wide and only a profile that carries no branch itself can select
 * such a row, which is why the manager here is roving rather than assigned to
 * the pilot counter. The cashier is assigned, because the only thing this file
 * asks of a cashier is to be refused.
 */
async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${CASHIER}', 'cashier@example.com'),
      ('${MANAGER}', 'manager@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${MANAGER}', 'staff', 'manager', 'Roving manager');

    insert into menu_categories (slug, name, sort_order) values
      ('wings', 'Wings', 10),
      ('sides', 'Sides', 20);
    insert into menu_items (category_id, slug, name)
    select id, 'chicken-wings', 'Chicken Wings' from menu_categories where slug = 'wings';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default)
    select id, 'full', 'Full, 12 pieces', 'FULL', 30000, true from menu_items where slug = 'chicken-wings';

    insert into menu_option_groups (slug, name, sort_order) values
      ('wing-flavour', 'Wing Flavour', 10),
      ('level-of-hotness', 'Level of Hotness', 20);
    insert into menu_options (group_id, slug, name, price_cents, sort_order)
    select id, 'classic-buffalo', 'Classic Buffalo', 0, 10 from menu_option_groups where slug = 'wing-flavour';
    insert into menu_options (group_id, slug, name, price_cents, sort_order)
    select id, 'honey-garlic', 'Honey Garlic', 0, 20 from menu_option_groups where slug = 'wing-flavour';

    -- Wing Flavour is linked to the wings item, Level of Hotness is not, so
    -- one group can test the link guard and the other a clean delete.
    insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select)
    select i.id, g.id, true, 1, 1
    from menu_items i, menu_option_groups g
    where i.slug = 'chicken-wings' and g.slug = 'wing-flavour';
  `);
  return db;
}

const categoryId = (db: PGlite) => scalar<string>(db, "select id::text from menu_categories where slug = 'wings'");
const itemId = (db: PGlite) => scalar<string>(db, "select id::text from menu_items where slug = 'chicken-wings'");
const groupId = (db: PGlite) => scalar<string>(db, "select id::text from menu_option_groups where slug = 'wing-flavour'");
const optionId = (db: PGlite) => scalar<string>(db, "select id::text from menu_options where slug = 'classic-buffalo'");
const slugOf = (db: PGlite, table: string, id: string) => scalar<string>(db, `select slug from ${table} where id = '${id}'`);

describe("catalog write RPCs", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants execute to authenticated and never to anon", async () => {
    for (const signature of [
      "staff_save_menu_category(uuid, text, text, boolean)",
      "staff_save_menu_option_group(uuid, text, text, boolean)",
      "staff_save_menu_option(uuid, uuid, text, text, bigint, int, boolean)",
      "staff_set_menu_option_image(uuid, text, int, int, text, text)",
      "staff_delete_menu_entity(text, uuid)",
    ]) {
      expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
      expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    }
  });

  // 0053 granted it, 0056 took the grant back. Nothing in the app calls
  // staff_reorder_menu, and a function no screen reaches should not be a door
  // a manager's own token can open at POST /rest/v1/rpc/. The function and the
  // four cases below stay, because the grant returns with the screen that
  // calls it. This case is what fails when somebody restores the grant without
  // the screen.
  it("keeps staff_reorder_menu unreachable while no screen calls it", async () => {
    for (const role of ["authenticated", "anon"]) {
      expect(await scalar<boolean>(db, `select has_function_privilege('${role}', 'staff_reorder_menu(text, uuid[])', 'execute')`)).toBe(false);
    }
  });

  it("keeps the two slug helpers internal", async () => {
    for (const signature of ["menu_slugify(text)", "menu_unique_slug(text, text)"]) {
      expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    }
  });

  it("never grants a menu table's writes to authenticated", async () => {
    for (const table of ["menu_categories", "menu_items", "menu_option_groups", "menu_options"]) {
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'insert')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'update')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'delete')`)).toBe(false);
    }
  });

  it("refuses a cashier every configure write", async () => {
    await expect(asUser(db, CASHIER, `select staff_save_menu_category(null, 'Drinks', null, true)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_save_menu_option_group(null, 'Dips', null, true)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_save_menu_option(null, '${await groupId(db)}', 'Garlic', null, 2000, null, true)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_set_menu_option_image('${await optionId(db)}', 'a/b.jpg', 800, 600, null, null)`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asOwner(db, CASHIER, `select staff_reorder_menu('category', array['${await categoryId(db)}'::uuid])`)).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, CASHIER, `select staff_delete_menu_entity('category', '${await categoryId(db)}')`)).rejects.toThrow(/FORBIDDEN/);
  });

  it("mints a clean slug and keeps it through a rename", async () => {
    const created = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', 'Cold and strong.', true)`))[0]!.staff_save_menu_category;
    expect(await slugOf(db, "menu_categories", created)).toBe("iced-coffee");

    await asUser(db, MANAGER, `select staff_save_menu_category('${created}', 'Cold Brew', 'Cold and strong.', true)`);
    expect(await slugOf(db, "menu_categories", created)).toBe("iced-coffee");
    expect(await scalar<string>(db, `select name from menu_categories where id = '${created}'`)).toBe("Cold Brew");
  });

  it("suffixes a slug only when the clean one is taken", async () => {
    await asUser(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', null, true)`);
    await asUser(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', null, true)`);
    const slugs = await asUser<{ slug: string }>(db, MANAGER, `select slug from menu_categories where name = 'Iced Coffee' order by slug`);
    expect(slugs[0]?.slug).toBe("iced-coffee");
    expect(slugs[1]?.slug).toMatch(/^iced-coffee-[a-z0-9]{6}$/);
  });

  it("slugifies punctuation, accents and a name that is nothing but punctuation", async () => {
    const created = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, '  Brad''s Café / Crème Brûlée!  ', null, true)`))[0]!.staff_save_menu_category;
    expect(await slugOf(db, "menu_categories", created)).toBe("brad-s-cafe-creme-brulee");

    const punctuation = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, '!!!', null, true)`))[0]!.staff_save_menu_category;
    expect(await slugOf(db, "menu_categories", punctuation)).toBe("item");
  });

  it("gives a new category the next sort_order rather than zero", async () => {
    const created = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, 'Drinks', null, true)`))[0]!.staff_save_menu_category;
    expect(await scalar<number>(db, `select sort_order from menu_categories where id = '${created}'`)).toBe(30);
  });

  it("refuses a name that is too short or too long", async () => {
    await expect(asUser(db, MANAGER, `select staff_save_menu_category(null, 'A', null, true)`)).rejects.toThrow(/INVALID_INPUT/);
    await expect(asUser(db, MANAGER, `select staff_save_menu_category(null, repeat('A', 81), null, true)`)).rejects.toThrow(/INVALID_INPUT/);
    await expect(asUser(db, MANAGER, `select staff_save_menu_category(null, 'Drinks', repeat('B', 201), true)`)).rejects.toThrow(/INVALID_INPUT/);
  });

  it("stores an empty blurb as null", async () => {
    const created = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, 'Drinks', '   ', true)`))[0]!.staff_save_menu_category;
    expect(await scalar<string | null>(db, `select blurb from menu_categories where id = '${created}'`)).toBeNull();
  });

  it("saves an option group and keeps its slug through a rename", async () => {
    const created = (await asUser<{ staff_save_menu_option_group: string }>(db, MANAGER, `select staff_save_menu_option_group(null, 'Dips and Sauces', 'Pick one.', true)`))[0]!.staff_save_menu_option_group;
    expect(await slugOf(db, "menu_option_groups", created)).toBe("dips-and-sauces");
    expect(await scalar<number>(db, `select sort_order from menu_option_groups where id = '${created}'`)).toBe(30);

    await asUser(db, MANAGER, `select staff_save_menu_option_group('${created}', 'Dips', 'Pick one.', false)`);
    expect(await slugOf(db, "menu_option_groups", created)).toBe("dips-and-sauces");
    expect(await scalar<boolean>(db, `select is_active from menu_option_groups where id = '${created}'`)).toBe(false);
  });

  it("stores a null option price as null rather than zero", async () => {
    const group = await groupId(db);
    const created = (await asUser<{ staff_save_menu_option: string }>(db, MANAGER, `select staff_save_menu_option(null, '${group}', 'Insane', null, null, 100, true)`))[0]!.staff_save_menu_option;
    expect(await scalar<number | null>(db, `select price_cents from menu_options where id = '${created}'`)).toBeNull();
    expect(await scalar<number>(db, `select heat_percent from menu_options where id = '${created}'`)).toBe(100);
  });

  it("makes an option slug unique inside its group and not across the menu", async () => {
    const hotness = await scalar<string>(db, "select id::text from menu_option_groups where slug = 'level-of-hotness'");
    const created = (await asUser<{ staff_save_menu_option: string }>(db, MANAGER, `select staff_save_menu_option(null, '${hotness}', 'Classic Buffalo', null, null, null, true)`))[0]!.staff_save_menu_option;
    // 'classic-buffalo' is already taken in Wing Flavour, and that is not a
    // collision here: menu_options is unique on (group_id, slug).
    expect(await slugOf(db, "menu_options", created)).toBe("classic-buffalo");

    const twice = (await asUser<{ staff_save_menu_option: string }>(db, MANAGER, `select staff_save_menu_option(null, '${hotness}', 'Classic Buffalo', null, null, null, true)`))[0]!.staff_save_menu_option;
    expect(await slugOf(db, "menu_options", twice)).toMatch(/^classic-buffalo-[a-z0-9]{6}$/);
  });

  it("refuses an out of range price, an out of range heat and a missing group", async () => {
    const group = await groupId(db);
    await expect(asUser(db, MANAGER, `select staff_save_menu_option(null, '${group}', 'Gold Leaf', null, 10000001, null, true)`)).rejects.toThrow(/PRICE_RANGE/);
    await expect(asUser(db, MANAGER, `select staff_save_menu_option(null, '${group}', 'Gold Leaf', null, -1, null, true)`)).rejects.toThrow(/PRICE_RANGE/);
    await expect(asUser(db, MANAGER, `select staff_save_menu_option(null, '${group}', 'Nuclear', null, null, 101, true)`)).rejects.toThrow(/HEAT_RANGE/);
    await expect(asUser(db, MANAGER, `select staff_save_menu_option(null, '00000000-0000-4000-8000-0000000000ff', 'Nuclear', null, null, null, true)`)).rejects.toThrow(/GROUP_NOT_FOUND/);
  });

  // 0056, mirroring the guard staff_set_menu_item_image has carried since
  // 0054. A url with no dimensions renders a broken tile in the flavour grid,
  // and the workspace client always sending all five columns is an argument
  // about the client, not about the other caller: this function is granted to
  // authenticated and any manager's own token can post to it directly.
  // Clearing the image is still allowed, because a null url has no tile.
  it("refuses an option image url that arrives without its dimensions", async () => {
    const option = await optionId(db);
    for (const dimensions of ["null, null", "1200, null", "null, 900", "0, 900", "1200, -1"]) {
      await expect(
        asUser(db, MANAGER, `select staff_set_menu_option_image('${option}', 'menu/abc.jpg', ${dimensions}, null, null)`),
      ).rejects.toThrow(/INVALID_INPUT/);
    }
    await asUser(db, MANAGER, `select staff_set_menu_option_image('${option}', null, null, null, null, null)`);
    expect(await scalar<string | null>(db, `select image_url from menu_options where id = '${option}'`)).toBe(null);
  });

  it("writes every image column together and records the change", async () => {
    const option = await optionId(db);
    await asUser(db, MANAGER, `select staff_set_menu_option_image('${option}', 'menu/abc.jpg', 1200, 900, 'data:image/png;base64,AAAA', '2024/05/Classic-Buffalo.jpg')`);
    const row = (await asUser<{ image_url: string; image_width: number; image_height: number; image_blur_data_url: string; image_source: string }>(
      db, MANAGER, `select image_url, image_width, image_height, image_blur_data_url, image_source from menu_options where id = '${option}'`,
    ))[0];
    expect(row).toEqual({
      image_url: "menu/abc.jpg",
      image_width: 1200,
      image_height: 900,
      image_blur_data_url: "data:image/png;base64,AAAA",
      image_source: "2024/05/Classic-Buffalo.jpg",
    });

    const audit = await asUser<{ action: string; diff: { option_name: string } }>(db, MANAGER, "select action, diff from audit_logs order by id");
    expect(audit.map((entry) => entry.action)).toEqual(["menu.option.image_changed"]);
    expect(audit[0]?.diff.option_name).toBe("Classic Buffalo");

    await expect(asUser(db, MANAGER, `select staff_set_menu_option_image('00000000-0000-4000-8000-0000000000ff', 'menu/abc.jpg', 1, 1, null, null)`)).rejects.toThrow(/OPTION_NOT_FOUND/);
  });

  it("reorders by the position of each id in the array", async () => {
    const ids = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_categories order by sort_order");
    const reversed = [...ids].reverse().map((row) => row.id);
    await asOwner(db, MANAGER, `select staff_reorder_menu('category', array[${reversed.map((id) => `'${id}'::uuid`).join(",")}])`);
    const after = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_categories order by sort_order");
    expect(after.map((row) => row.id)).toEqual(reversed);
    expect(await scalar<number>(db, "select min(sort_order) from menu_categories")).toBe(10);
  });

  it("reorders option groups, which the screen that lists them needs", async () => {
    const ids = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_option_groups order by sort_order");
    const reversed = [...ids].reverse().map((row) => row.id);
    await asOwner(db, MANAGER, `select staff_reorder_menu('optionGroup', array[${reversed.map((id) => `'${id}'::uuid`).join(",")}])`);
    const after = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_option_groups order by sort_order");
    expect(after.map((row) => row.id)).toEqual(reversed);
  });

  it("reorders items and options too, and refuses anything else", async () => {
    await asOwner(db, MANAGER, `select staff_reorder_menu('item', array['${await itemId(db)}'::uuid])`);
    expect(await scalar<number>(db, "select sort_order from menu_items")).toBe(10);
    await asOwner(db, MANAGER, `select staff_reorder_menu('option', array['${await optionId(db)}'::uuid])`);
    expect(await scalar<number>(db, `select sort_order from menu_options where slug = 'classic-buffalo'`)).toBe(10);
    await expect(asOwner(db, MANAGER, `select staff_reorder_menu('variation', array['${await itemId(db)}'::uuid])`)).rejects.toThrow(/INVALID_INPUT/);
  });

  it("writes one audit row for a whole reorder", async () => {
    const ids = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_categories order by sort_order");
    const reversed = [...ids].reverse().map((row) => row.id);
    await asOwner(db, MANAGER, `select staff_reorder_menu('category', array[${reversed.map((id) => `'${id}'::uuid`).join(",")}])`);
    const rows = await asUser<{ action: string; diff: { entity: string; ids: string[] } }>(db, MANAGER, "select action, diff from audit_logs order by id");
    expect(rows.map((row) => row.action)).toEqual(["menu.reordered"]);
    expect(rows[0]?.diff.entity).toBe("category");
    expect(rows[0]?.diff.ids).toEqual(reversed);
  });

  it("refuses to delete a category that still has items", async () => {
    await expect(
      asUser(db, MANAGER, `select staff_delete_menu_entity('category', '${await categoryId(db)}')`),
    ).rejects.toThrow(/CATEGORY_HAS_ITEMS/);
  });

  it("refuses to delete an option group that is still linked", async () => {
    await expect(
      asUser(db, MANAGER, `select staff_delete_menu_entity('optionGroup', '${await groupId(db)}')`),
    ).rejects.toThrow(/GROUP_STILL_LINKED/);
  });

  it("deletes an empty category and names it in the audit diff", async () => {
    const sides = await scalar<string>(db, "select id::text from menu_categories where slug = 'sides'");
    await asUser(db, MANAGER, `select staff_delete_menu_entity('category', '${sides}')`);
    expect(await scalar<number>(db, "select count(*)::int from menu_categories")).toBe(1);
    const rows = await asUser<{ action: string; diff: { name: string } }>(db, MANAGER, "select action, diff from audit_logs order by id");
    expect(rows.map((row) => row.action)).toEqual(["menu.category.deleted"]);
    expect(rows[0]?.diff.name).toBe("Sides");
  });

  it("deletes an unlinked option group and the options under it", async () => {
    const hotness = await scalar<string>(db, "select id::text from menu_option_groups where slug = 'level-of-hotness'");
    await asUser(db, MANAGER, `select staff_save_menu_option(null, '${hotness}', 'Insane', null, null, 100, true)`);
    await asUser(db, MANAGER, `select staff_delete_menu_entity('optionGroup', '${hotness}')`);
    expect(await scalar<number>(db, `select count(*)::int from menu_option_groups where slug = 'level-of-hotness'`)).toBe(0);
    expect(await scalar<number>(db, `select count(*)::int from menu_options where name = 'Insane'`)).toBe(0);
  });

  it("clears a cart of an item it deletes, because a cart is not history", async () => {
    const item = await itemId(db);
    await db.exec(`
      insert into carts (cart_token) values ('token-1');
      insert into cart_items (cart_id, item_id, variation_id, qty, unit_price_cents)
      select c.id, i.id, v.id, 2, 30000
      from carts c, menu_items i, item_variations v
      where c.cart_token = 'token-1' and i.slug = 'chicken-wings' and v.item_id = i.id;
      insert into cart_item_options (cart_item_id, option_id)
      select ci.id, o.id from cart_items ci, menu_options o where o.slug = 'classic-buffalo';
    `);

    await asUser(db, MANAGER, `select staff_delete_menu_entity('item', '${item}')`);
    expect(await scalar<number>(db, "select count(*)::int from menu_items")).toBe(0);
    expect(await scalar<number>(db, "select count(*)::int from cart_items")).toBe(0);
    expect(await scalar<number>(db, "select count(*)::int from item_variations")).toBe(0);
  });

  it("deletes an option no order has ever carried", async () => {
    const option = await scalar<string>(db, "select id::text from menu_options where slug = 'honey-garlic'");
    await asUser(db, MANAGER, `select staff_delete_menu_entity('option', '${option}')`);
    expect(await scalar<number>(db, "select count(*)::int from menu_options")).toBe(1);
  });

  it("refuses an entity name it does not know and an id that is not there", async () => {
    await expect(asUser(db, MANAGER, `select staff_delete_menu_entity('variation', '${await itemId(db)}')`)).rejects.toThrow(/INVALID_INPUT/);
    await expect(asUser(db, MANAGER, `select staff_delete_menu_entity('category', '00000000-0000-4000-8000-0000000000ff')`)).rejects.toThrow(/CATEGORY_NOT_FOUND/);
  });

  it("writes one audit row per real change and none for a no-op", async () => {
    const category = await categoryId(db);
    await asUser(db, MANAGER, `select staff_save_menu_category('${category}', 'Buffalo Wings', null, true)`);
    await asUser(db, MANAGER, `select staff_save_menu_category('${category}', 'Buffalo Wings', null, true)`);
    const rows = await asUser<{ action: string }>(db, MANAGER, "select action from audit_logs order by id");
    expect(rows.map((row) => row.action)).toEqual(["menu.category.updated"]);
  });

  it("records a created category under its own action", async () => {
    await asUser(db, MANAGER, `select staff_save_menu_category(null, 'Drinks', null, true)`);
    await asUser(db, MANAGER, `select staff_save_menu_option_group(null, 'Dips', null, true)`);
    await asUser(db, MANAGER, `select staff_save_menu_option(null, '${await groupId(db)}', 'Garlic Parmesan', null, 3000, null, true)`);
    const rows = await asUser<{ action: string }>(db, MANAGER, "select action from audit_logs order by id");
    expect(rows.map((row) => row.action)).toEqual([
      "menu.category.created",
      "menu.option_group.created",
      "menu.option.created",
    ]);
  });
});

/**
 * The two guards that need a real order behind them.
 *
 * Built the way tests/sql/reorder-snapshot-pairings.test.ts builds one: the
 * seeded catalog, a branch that is open around the clock, and place_order
 * itself. An order written by hand from the schema would prove the guard fires
 * on rows this file invented; this proves it fires on rows the product writes.
 */
type PayloadLine = {
  item_slug: string;
  variation_slug: string;
  qty: number;
  options?: { group_slug: string; option_slug: string }[];
};

const WINGS: PayloadLine = {
  item_slug: "chicken-wings",
  variation_slug: "full",
  qty: 2,
  options: [
    { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
    { group_slug: "level-of-hotness", option_slug: "insane" },
  ],
};

async function openBranch(db: PGlite): Promise<void> {
  const branchId = await scalar<string>(
    db,
    `insert into branches (
       slug, name, short_name, format, price_list_id, address_line, city,
       is_active, is_accepting_orders,
       pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
     )
     select 'pilot', 'Pilot Branch', 'Pilot', 'street', pl.id, '1 Test Street', 'Cebu City',
            true, true, 15, 20, 20
     from price_lists pl
     order by pl.slug
     limit 1
     returning id`,
  );

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await db.query(
      `insert into store_hours (branch_id, weekday, opens_at, closes_at)
       values ($1, $2, '00:00'::time, '23:59:59'::time)`,
      [branchId, weekday],
    );
  }
}

async function firstSlot(db: PGlite): Promise<string> {
  const result = await db.query<{ payload: { slots: { startsAt: string }[] } }>(
    "select get_pickup_slots('pilot') as payload",
  );
  return result.rows[0].payload.slots[0].startsAt;
}

async function place(db: PGlite, lines: PayloadLine[], slotStart: string): Promise<void> {
  await db.query("select place_order($1::jsonb, $2::uuid) as result", [
    JSON.stringify({
      branch_slug: "pilot",
      customer_name: "Steven Cruz",
      customer_phone: "0906 440 5297",
      pickup_slot_start: slotStart,
      lines,
    }),
    "00000000-0000-4000-8000-000000000001",
  ]);
}

describe("deletes an order would contradict", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await db.exec(`
      insert into auth.users (id, email) values ('${MANAGER}', 'manager@example.com');
      insert into profiles (id, role, staff_role, display_name)
      values ('${MANAGER}', 'staff', 'manager', 'Roving manager');
    `);
    await openBranch(db);
    await place(db, [WINGS], await firstSlot(db));
  }, 120_000);

  it("refuses to delete an item a past order references", async () => {
    const item = await scalar<string>(db, "select id::text from menu_items where slug = 'chicken-wings'");
    await expect(
      asUser(db, MANAGER, `select staff_delete_menu_entity('item', '${item}')`),
    ).rejects.toThrow(/ITEM_IN_ORDERS/);
  });

  it("refuses to delete an option a past order references", async () => {
    const option = await scalar<string>(db, "select id::text from menu_options where slug = 'classic-buffalo'");
    await expect(
      asUser(db, MANAGER, `select staff_delete_menu_entity('option', '${option}')`),
    ).rejects.toThrow(/OPTION_IN_ORDERS/);
  });

  it("refuses to delete a group whose options a past order references", async () => {
    // Unlinked from every item first, so the answer is about the order history
    // rather than about the link that would otherwise be reported first.
    await db.exec(`
      delete from menu_item_option_groups
      where group_id = (select id from menu_option_groups where slug = 'wing-flavour');
    `);
    const group = await scalar<string>(db, "select id::text from menu_option_groups where slug = 'wing-flavour'");
    await expect(
      asUser(db, MANAGER, `select staff_delete_menu_entity('optionGroup', '${group}')`),
    ).rejects.toThrow(/OPTION_IN_ORDERS/);
  });
});
