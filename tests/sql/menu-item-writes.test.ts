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
 * Two things about this fixture are load bearing.
 *
 * The manager is roving. Every audit row these functions write carries a null
 * branch_id, because the catalog belongs to all nine branches and to no
 * counter. The audit read policy is audit:view AND
 * current_staff_can_access_branch(branch_id), which is false for a
 * branch-assigned profile when the argument is null, so a manager tied to one
 * site could not read its own trail. tests/sql/menu-catalog-writes.test.ts
 * made the same choice for the same reason.
 *
 * There is no branch at all. resolve_price_list_id(null) returns the first
 * active branch's price list and only falls through to the single-list rule
 * when no branch is active, so a fixture with an open counter would not
 * exercise the resolver the way the price function meets it here. The one test
 * that needs a branch creates its own.
 */
async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${CASHIER}', 'cashier@example.com'),
      ('${MANAGER}', 'manager@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into profiles (id, role, staff_role, display_name)
    values
      ('${CASHIER}', 'staff', 'cashier', 'Cashier'),
      ('${MANAGER}', 'staff', 'manager', 'Roving manager');

    insert into menu_categories (slug, name, sort_order) values
      ('wings', 'Wings', 10),
      ('sides', 'Sides', 20);

    -- The wings item is seeded under its own slug so that a test creating
    -- "Chicken Wings" mints a clean chicken-wings rather than a suffixed one.
    insert into menu_items (category_id, slug, name, sort_order)
    select id, 'buffalo-wings', 'Buffalo Wings', 10 from menu_categories where slug = 'wings';
    insert into menu_items (category_id, slug, name, sort_order)
    select id, 'fries', 'Fries', 20 from menu_categories where slug = 'sides';

    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default, sort_order)
    select id, 'half', 'Half, 6 pieces', 'HALF', 32900, true, 10 from menu_items where slug = 'buffalo-wings';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default, sort_order)
    select id, 'full', 'Full, 10 pieces', 'FULL', 52900, false, 20 from menu_items where slug = 'buffalo-wings';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default, sort_order)
    select id, 'regular', 'Regular', 'REG', 12900, true, 10 from menu_items where slug = 'fries';

    insert into menu_option_groups (slug, name, sort_order) values
      ('level-of-hotness', 'Level of Hotness', 10),
      ('wing-flavour', 'Wing Flavour', 20);
    -- A null price is not a missing price: this option is priced by the chosen
    -- variation, which is what staff_set_option_variation_prices writes.
    insert into menu_options (group_id, slug, name, price_cents, heat_percent, sort_order)
    select id, 'insane', 'Insane', null, 100, 10 from menu_option_groups where slug = 'level-of-hotness';

    insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
    select i.id, g.id, true, 1, 1, 10
    from menu_items i, menu_option_groups g
    where i.slug = 'buffalo-wings' and g.slug = 'level-of-hotness';
  `);
  return db;
}

type Variation = {
  id?: string | null;
  label?: unknown;
  shortLabel?: unknown;
  priceCents?: unknown;
  isDefault?: unknown;
  isActive?: unknown;
};

const variation = (over: Variation = {}): Variation => ({
  id: null,
  label: "Regular",
  shortLabel: "REG",
  priceCents: 5000,
  isDefault: true,
  isActive: true,
  ...over,
});

const HALF = variation({ label: "Half, 6 pieces", shortLabel: "HALF", priceCents: 32900, isDefault: true });
const FULL = variation({ label: "Full, 10 pieces", shortLabel: "FULL", priceCents: 52900, isDefault: false });

const text = (value: string | null | undefined) =>
  value === null || value === undefined ? "null" : `'${value.replace(/'/g, "''")}'`;

type SaveArgs = {
  id?: string | null;
  category?: string | null;
  name?: string;
  code?: string | null;
  description?: string | null;
  featured?: boolean;
  active?: boolean;
  variations?: unknown;
  groups?: string[];
};

function saveSql(args: SaveArgs): string {
  const groups = (args.groups ?? []).map((id) => `'${id}'`).join(",");
  return `select staff_save_menu_item(
    ${args.id === undefined ? "null" : text(args.id)},
    ${args.category === undefined ? "null" : text(args.category)},
    ${text(args.name ?? "Fries")},
    ${text(args.code ?? null)},
    ${text(args.description ?? null)},
    ${args.featured ?? false},
    ${args.active ?? true},
    ${text(JSON.stringify(args.variations ?? [variation()]))}::jsonb,
    array[${groups}]::uuid[]
  ) as id`;
}

const saveAs = (db: PGlite, user: string, args: SaveArgs) => asUser<{ id: string }>(db, user, saveSql(args));

async function save(db: PGlite, args: SaveArgs): Promise<string> {
  const rows = await saveAs(db, MANAGER, args);
  return rows[0]!.id;
}

const categoryId = (db: PGlite, slug = "wings") => scalar<string>(db, `select id::text from menu_categories where slug = '${slug}'`);
const itemId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from menu_items where slug = '${slug}'`);
const groupId = (db: PGlite, slug = "level-of-hotness") => scalar<string>(db, `select id::text from menu_option_groups where slug = '${slug}'`);
const optionId = (db: PGlite) => scalar<string>(db, "select id::text from menu_options where slug = 'insane'");
const variationId = (db: PGlite, item: string, slug: string) =>
  scalar<string>(db, `select id::text from item_variations where item_id = '${item}' and slug = '${slug}'`);
const MISSING = "00000000-0000-4000-8000-0000000000ff";

describe("item write RPCs", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants execute to authenticated and never to anon", async () => {
    for (const signature of [
      "staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[])",
      "staff_set_menu_item_image(uuid, text, int, int, text, text, text)",
      "staff_set_option_variation_prices(uuid, uuid, jsonb)",
    ]) {
      expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
      expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    }
  });

  it("keeps the two helpers this migration adds internal", async () => {
    for (const signature of ["menu_variation_unique_slug(uuid, text)", "menu_item_snapshot(uuid)"]) {
      expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    }
  });

  it("never grants a menu table's writes to authenticated", async () => {
    for (const table of ["menu_items", "item_variations", "menu_item_option_groups", "menu_option_variation_prices"]) {
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'insert')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'update')`)).toBe(false);
      expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', '${table}', 'delete')`)).toBe(false);
    }
  });

  it("refuses a cashier every one of the three writes", async () => {
    await expect(saveAs(db, CASHIER, { category: await categoryId(db) })).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_image('${await itemId(db, "fries")}', 'a/b.webp', 800, 600, null, null, null)`),
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      asUser(db, CASHIER, `select staff_set_option_variation_prices('${await itemId(db, "buffalo-wings")}', '${await optionId(db)}', '{}'::jsonb)`),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("creates an item, its variations and its links in one call", async () => {
    const created = await save(db, {
      category: await categoryId(db),
      name: "Chicken Wings",
      code: "BB1",
      description: "Nine flavours.",
      featured: true,
      variations: [HALF, FULL],
      groups: [await groupId(db)],
    });

    expect(await scalar<string>(db, `select slug from menu_items where id = '${created}'`)).toBe("chicken-wings");
    expect(await scalar<string>(db, `select code from menu_items where id = '${created}'`)).toBe("BB1");
    expect(await scalar<boolean>(db, `select is_featured from menu_items where id = '${created}'`)).toBe(true);
    expect(await scalar<number>(db, `select count(*)::int from item_variations where item_id = '${created}'`)).toBe(2);
    expect(await scalar<number>(db, `select sort_order from item_variations where item_id = '${created}' and slug = 'full'`)).toBe(20);
    expect(await scalar<number>(db, `select price_cents from item_variations where item_id = '${created}' and slug = 'half'`)).toBe(32900);
    expect(await scalar<number>(db, `select count(*)::int from menu_item_option_groups where item_id = '${created}'`)).toBe(1);
    expect(await scalar<number>(db, `select sort_order from menu_items where id = '${created}'`)).toBe(30);

    const audit = await asUser<{ action: string; diff: { after: { name: string; variations: unknown[] } } }>(
      db, MANAGER, "select action, diff from audit_logs order by id",
    );
    expect(audit.map((row) => row.action)).toEqual(["menu.item.created"]);
    expect(audit[0]?.diff.after.name).toBe("Chicken Wings");
    expect(audit[0]?.diff.after.variations).toHaveLength(2);
  });

  it("mints a variation slug from the short label and keeps it through a rename", async () => {
    const created = await save(db, { category: await categoryId(db), name: "Chicken Wings", variations: [HALF, FULL] });
    const half = await variationId(db, created, "half");

    await save(db, {
      id: created,
      category: await categoryId(db),
      name: "Chicken Wings",
      variations: [{ ...HALF, id: half, label: "Half, 5 pieces", shortLabel: "SMALL" }],
    });

    expect(await scalar<string>(db, `select slug from item_variations where id = '${half}'`)).toBe("half");
    expect(await scalar<string>(db, `select short_label from item_variations where id = '${half}'`)).toBe("SMALL");
  });

  it("suffixes a variation slug only when the item already has it", async () => {
    const created = await save(db, { category: await categoryId(db), name: "Chicken Wings", variations: [HALF, variation({ shortLabel: "HALF", label: "Half again", isDefault: false })] });
    const slugs = await asUser<{ slug: string }>(db, MANAGER, `select slug from item_variations where item_id = '${created}' order by sort_order`);
    expect(slugs[0]?.slug).toBe("half");
    expect(slugs[1]?.slug).toMatch(/^half-[a-z0-9]{6}$/);
  });

  it("lets two different items each carry a HALF, because the slug is unique per item", async () => {
    const category = await categoryId(db);
    const first = await save(db, { category, name: "Chicken Wings", variations: [HALF] });
    const second = await save(db, { category, name: "Boneless Wings", variations: [HALF] });
    expect(await scalar<string>(db, `select slug from item_variations where item_id = '${first}'`)).toBe("half");
    expect(await scalar<string>(db, `select slug from item_variations where item_id = '${second}'`)).toBe("half");
  });

  it("refuses an item with no variations and one with more than thirty", async () => {
    const category = await categoryId(db);
    await expect(saveAs(db, MANAGER, { category, variations: [] })).rejects.toThrow(/VARIATIONS_REQUIRED/);
    const many = Array.from({ length: 31 }, (_, index) => variation({ shortLabel: `S${index}`, isDefault: index === 0 }));
    await expect(saveAs(db, MANAGER, { category, variations: many })).rejects.toThrow(/VARIATIONS_REQUIRED/);
  });

  it("accepts exactly thirty variations, the upper bound VARIATIONS_REQUIRED allows", async () => {
    const category = await categoryId(db);
    const thirty = Array.from({ length: 30 }, (_, index) => variation({ shortLabel: `S${index}`, isDefault: index === 0 }));
    const created = await save(db, { category, name: "Thirty Sizes", variations: thirty });
    expect(await scalar<number>(db, `select count(*)::int from item_variations where item_id = '${created}'`)).toBe(30);
  });

  it("refuses zero defaults and more than one default among the active variations", async () => {
    const category = await categoryId(db);
    await expect(
      saveAs(db, MANAGER, { category, variations: [variation({ shortLabel: "SM", isDefault: true }), variation({ shortLabel: "LG", isDefault: true })] }),
    ).rejects.toThrow(/ONE_DEFAULT_REQUIRED/);
    await expect(
      saveAs(db, MANAGER, { category, variations: [variation({ isDefault: false })] }),
    ).rejects.toThrow(/ONE_DEFAULT_REQUIRED/);
    // The one default has to be an active one: a default nobody can order is
    // an item with no default at all.
    await expect(
      saveAs(db, MANAGER, { category, variations: [variation({ isDefault: true, isActive: false })] }),
    ).rejects.toThrow(/ONE_DEFAULT_REQUIRED/);
  });

  it("refuses a malformed variations payload rather than letting a cast error escape", async () => {
    const category = await categoryId(db);
    const malformed: unknown[] = [
      "not an array",
      ["not an object"],
      [{ ...variation(), label: undefined }],
      [{ ...variation(), label: "" }],
      [{ ...variation(), shortLabel: 7 }],
      [{ ...variation(), priceCents: "5000" }],
      [{ ...variation(), priceCents: -1 }],
      [{ ...variation(), priceCents: 10000001 }],
      [{ ...variation(), priceCents: 12.5 }],
      [{ ...variation(), isDefault: "yes" }],
      [{ ...variation(), isActive: null }],
      [{ ...variation(), id: "not-a-uuid" }],
      [{ ...variation(), label: "A".repeat(81) }],
    ];
    for (const variations of malformed) {
      await expect(saveAs(db, MANAGER, { category, variations })).rejects.toThrow(/INVALID_VARIATIONS/);
    }
  });

  it("refuses the same variation id twice in one payload", async () => {
    const item = await itemId(db, "buffalo-wings");
    const half = await variationId(db, item, "half");
    await expect(
      saveAs(db, MANAGER, {
        id: item,
        category: await categoryId(db),
        name: "Buffalo Wings",
        variations: [{ ...HALF, id: half }, { ...FULL, id: half }],
      }),
    ).rejects.toThrow(/INVALID_VARIATIONS/);
  });

  it("refuses an unknown category, an unknown item and an unknown option group", async () => {
    const category = await categoryId(db);
    await expect(saveAs(db, MANAGER, { category: MISSING })).rejects.toThrow(/CATEGORY_NOT_FOUND/);
    await expect(saveAs(db, MANAGER, { category: null })).rejects.toThrow(/INVALID_INPUT/);
    await expect(saveAs(db, MANAGER, { id: MISSING, category })).rejects.toThrow(/ITEM_NOT_FOUND/);
    await expect(saveAs(db, MANAGER, { category, groups: [MISSING] })).rejects.toThrow(/GROUP_NOT_FOUND/);
  });

  it("refuses a name that is too short or too long and a code that is too long", async () => {
    const category = await categoryId(db);
    await expect(saveAs(db, MANAGER, { category, name: "A" })).rejects.toThrow(/INVALID_INPUT/);
    await expect(saveAs(db, MANAGER, { category, name: "A".repeat(81) })).rejects.toThrow(/INVALID_INPUT/);
    await expect(saveAs(db, MANAGER, { category, code: "A".repeat(17) })).rejects.toThrow(/INVALID_INPUT/);
    await expect(saveAs(db, MANAGER, { category, description: "A".repeat(501) })).rejects.toThrow(/INVALID_INPUT/);
  });

  it("keeps the item slug through a rename and replaces the link set", async () => {
    const category = await categoryId(db);
    const created = await save(db, { category, name: "Chicken Wings", variations: [HALF], groups: [await groupId(db)] });

    await save(db, { id: created, category, name: "Buffalo Chicken Wings", variations: [{ ...HALF, id: await variationId(db, created, "half") }], groups: [] });

    expect(await scalar<string>(db, `select slug from menu_items where id = '${created}'`)).toBe("chicken-wings");
    expect(await scalar<string>(db, `select name from menu_items where id = '${created}'`)).toBe("Buffalo Chicken Wings");
    expect(await scalar<number>(db, `select count(*)::int from menu_item_option_groups where item_id = '${created}'`)).toBe(0);
  });

  it("leaves the selection rules alone on a link it keeps", async () => {
    // is_required, min_select and max_select are not on this screen, so a save
    // that keeps a link must not reset them to the column defaults.
    const item = await itemId(db, "buffalo-wings");
    const group = await groupId(db);
    await save(db, {
      id: item,
      category: await categoryId(db),
      name: "Buffalo Wings",
      variations: [{ ...HALF, id: await variationId(db, item, "half") }, { ...FULL, id: await variationId(db, item, "full") }],
      groups: [group, await groupId(db, "wing-flavour")],
    });

    const link = (await asUser<{ is_required: boolean; min_select: number; max_select: number; sort_order: number }>(
      db, MANAGER, `select is_required, min_select, max_select, sort_order from menu_item_option_groups where item_id = '${item}' and group_id = '${group}'`,
    ))[0];
    expect(link).toEqual({ is_required: true, min_select: 1, max_select: 1, sort_order: 10 });
    expect(await scalar<number>(db, `select count(*)::int from menu_item_option_groups where item_id = '${item}'`)).toBe(2);

    // The item row and every variation above are unchanged from the seed; only
    // the link set grew. Read as the roving manager, because catalog audit
    // rows carry a null branch_id and a branch-assigned profile could not see
    // them (audit:view AND current_staff_can_access_branch(branch_id), false
    // on null). If the no-op check ignored option_group_ids this save would
    // look like a no-op and write nothing here.
    const audit = await asUser<{ action: string }>(
      db, MANAGER, `select action from audit_logs where target_id = '${item}' order by id`,
    );
    expect(audit.map((row) => row.action)).toEqual(["menu.item.updated"]);
  });

  it("refuses a variation id that belongs to another item", async () => {
    const fries = await itemId(db, "fries");
    const wings = await itemId(db, "buffalo-wings");
    await expect(
      saveAs(db, MANAGER, {
        id: fries,
        category: await categoryId(db, "sides"),
        name: "Curly Fries",
        variations: [{ ...variation(), id: await variationId(db, wings, "half") }],
      }),
    ).rejects.toThrow(/VARIATION_NOT_ON_ITEM/);

    // The update at 0054:341-348 writes the renamed item row before the check
    // at :355 raises. Correctness rests on the raise rolling that back, not on
    // validate-then-write ordering, so the name must still be the seeded one.
    expect(await scalar<string>(db, `select name from menu_items where id = '${fries}'`)).toBe("Fries");
  });

  it("refuses a variation id on an item that is being created", async () => {
    const wings = await itemId(db, "buffalo-wings");
    const before = await scalar<number>(db, "select count(*)::int from menu_items");
    await expect(
      saveAs(db, MANAGER, {
        category: await categoryId(db),
        name: "Boneless Wings",
        variations: [{ ...variation(), id: await variationId(db, wings, "half") }],
      }),
    ).rejects.toThrow(/VARIATION_NOT_ON_ITEM/);

    // The insert at 0054:322-332 mints the item's slug and writes its row
    // before the check at :355 raises. A rollback is the only thing standing
    // between this and a half created item: a minted slug, no variations.
    expect(await scalar<number>(db, "select count(*)::int from menu_items")).toBe(before);
  });

  it("deactivates a variation the payload leaves out and never deletes it", async () => {
    const item = await itemId(db, "buffalo-wings");
    const half = await variationId(db, item, "half");
    const full = await variationId(db, item, "full");

    await save(db, {
      id: item,
      category: await categoryId(db),
      name: "Buffalo Wings",
      variations: [{ ...HALF, id: half }],
    });

    expect(await scalar<number>(db, `select count(*)::int from item_variations where item_id = '${item}'`)).toBe(2);
    expect(await scalar<boolean>(db, `select is_active from item_variations where id = '${full}'`)).toBe(false);
    expect(await scalar<boolean>(db, `select is_active from item_variations where id = '${half}'`)).toBe(true);
  });

  it("takes a variation off the menu when the payload sends it inactive", async () => {
    const item = await itemId(db, "buffalo-wings");
    const half = await variationId(db, item, "half");
    const full = await variationId(db, item, "full");

    await save(db, {
      id: item,
      category: await categoryId(db),
      name: "Buffalo Wings",
      variations: [{ ...HALF, id: half }, { ...FULL, id: full, isActive: false }],
    });

    expect(await scalar<boolean>(db, `select is_active from item_variations where id = '${full}'`)).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from item_variations where item_id = '${item}'`)).toBe(2);
  });

  it("writes one audit row per real change and none for a no-op", async () => {
    const item = await itemId(db, "buffalo-wings");
    const args: SaveArgs = {
      id: item,
      category: await categoryId(db),
      name: "Buffalo Wings",
      variations: [{ ...HALF, id: await variationId(db, item, "half") }, { ...FULL, id: await variationId(db, item, "full") }],
      groups: [await groupId(db)],
    };

    await save(db, { ...args, name: "Buffalo Wings" });
    await save(db, { ...args, name: "Wings" });
    await save(db, { ...args, name: "Wings" });

    const rows = await asUser<{ action: string; diff: { before: { name: string }; after: { name: string } } }>(
      db, MANAGER, "select action, diff from audit_logs order by id",
    );
    expect(rows.map((row) => row.action)).toEqual(["menu.item.updated"]);
    expect(rows[0]?.diff.before.name).toBe("Buffalo Wings");
    expect(rows[0]?.diff.after.name).toBe("Wings");
  });

  it("writes the image columns together", async () => {
    const item = await itemId(db, "fries");
    await asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, 900, 'data:image/webp;base64,AA', 'cutout', 'uploaded')`);
    const row = (await asUser<{ image_url: string; image_width: number; image_height: number; image_blur_data_url: string; image_treatment: string; image_source: string }>(
      db, MANAGER, `select image_url, image_width, image_height, image_blur_data_url, image_treatment, image_source from menu_items where id = '${item}'`,
    ))[0];
    expect(row).toEqual({
      image_url: "https://example.test/a.webp",
      image_width: 900,
      image_height: 900,
      image_blur_data_url: "data:image/webp;base64,AA",
      image_treatment: "cutout",
      image_source: "uploaded",
    });

    const audit = await asUser<{ action: string; diff: { item_name: string } }>(db, MANAGER, "select action, diff from audit_logs order by id");
    expect(audit.map((entry) => entry.action)).toEqual(["menu.item.image_changed"]);
    expect(audit[0]?.diff.item_name).toBe("Fries");
  });

  it("clears an image and writes no second audit row for a repeat", async () => {
    const item = await itemId(db, "fries");
    await asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, 900, null, null, null)`);
    await asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, 900, null, null, null)`);
    await asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', null, null, null, null, null, null)`);

    expect(await scalar<string | null>(db, `select image_url from menu_items where id = '${item}'`)).toBeNull();
    const audit = await asUser<{ action: string }>(db, MANAGER, "select action from audit_logs order by id");
    expect(audit.map((entry) => entry.action)).toEqual(["menu.item.image_changed", "menu.item.image_changed"]);
  });

  it("refuses an image url that arrives without a width and a height", async () => {
    const item = await itemId(db, "fries");
    await expect(
      asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', null, 900, null, null, null)`),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, null, null, null, null)`),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 0, 900, null, null, null)`),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it("refuses a treatment the column would not accept and an item that is not there", async () => {
    const item = await itemId(db, "fries");
    await expect(
      asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, 900, null, 'sepia', null)`),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(db, MANAGER, `select staff_set_menu_item_image('${MISSING}', null, null, null, null, null, null)`),
    ).rejects.toThrow(/ITEM_NOT_FOUND/);
  });

  it("writes heat prices against the only price list", async () => {
    const item = await itemId(db, "buffalo-wings");
    const option = await optionId(db);
    const half = await variationId(db, item, "half");
    const full = await variationId(db, item, "full");
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000, '${full}', 4000))`);

    expect(await scalar<number>(db, `select price_cents from menu_option_variation_prices where option_id = '${option}' and variation_id = '${half}'`)).toBe(3000);
    expect(await scalar<number>(db, `select resolve_option_price_cents('${option}', '${full}', resolve_price_list_id(null))`)).toBe(4000);

    const audit = await asUser<{ action: string; diff: { option_name: string; after: Record<string, number> } }>(
      db, MANAGER, "select action, diff from audit_logs order by id",
    );
    expect(audit.map((entry) => entry.action)).toEqual(["menu.item.option_prices_set"]);
    expect(audit[0]?.diff.option_name).toBe("Insane");
    expect(audit[0]?.diff.after).toEqual({ half: 3000, full: 4000 });
  });

  it("treats zero as a real price and not as a cleared one", async () => {
    const item = await itemId(db, "buffalo-wings");
    const option = await optionId(db);
    const half = await variationId(db, item, "half");
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 0))`);
    expect(await scalar<number>(db, `select price_cents from menu_option_variation_prices where variation_id = '${half}'`)).toBe(0);
  });

  it("clears a pairing that is left out of the object and one that is sent as null", async () => {
    const item = await itemId(db, "buffalo-wings");
    const option = await optionId(db);
    const half = await variationId(db, item, "half");
    const full = await variationId(db, item, "full");

    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000, '${full}', 4000))`);
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000))`);
    expect(await scalar<number>(db, "select count(*)::int from menu_option_variation_prices")).toBe(1);

    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', null))`);
    expect(await scalar<number>(db, "select count(*)::int from menu_option_variation_prices")).toBe(0);
  });

  it("leaves another item's pairings for the same option alone", async () => {
    const wings = await itemId(db, "buffalo-wings");
    const fries = await itemId(db, "fries");
    const option = await optionId(db);
    const half = await variationId(db, wings, "half");
    const regular = await variationId(db, fries, "regular");

    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${option}', jsonb_build_object('${half}', 3000))`);
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${fries}', '${option}', jsonb_build_object('${regular}', 1000))`);

    expect(await scalar<number>(db, `select price_cents from menu_option_variation_prices where variation_id = '${half}'`)).toBe(3000);
    expect(await scalar<number>(db, `select price_cents from menu_option_variation_prices where variation_id = '${regular}'`)).toBe(1000);
  });

  it("refuses a variation that is not on the item, a price out of range and a key that is not a uuid", async () => {
    const wings = await itemId(db, "buffalo-wings");
    const fries = await itemId(db, "fries");
    const option = await optionId(db);
    const half = await variationId(db, wings, "half");

    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${fries}', '${option}', jsonb_build_object('${half}', 3000))`),
    ).rejects.toThrow(/VARIATION_NOT_ON_ITEM/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${option}', jsonb_build_object('${half}', 10000001))`),
    ).rejects.toThrow(/PRICE_RANGE/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${option}', jsonb_build_object('${half}', -1))`),
    ).rejects.toThrow(/PRICE_RANGE/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${option}', jsonb_build_object('half', 3000))`),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${option}', jsonb_build_object('${half}', 'free'))`),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${wings}', '${MISSING}', '{}'::jsonb)`),
    ).rejects.toThrow(/OPTION_NOT_FOUND/);
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${MISSING}', '${option}', '{}'::jsonb)`),
    ).rejects.toThrow(/ITEM_NOT_FOUND/);
  });

  it("stops rather than guessing once a second price list exists", async () => {
    await db.exec("insert into price_lists (slug, name) values ('second', 'Second')");
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${await itemId(db, "buffalo-wings")}', '${await optionId(db)}', '{}'::jsonb)`),
    ).rejects.toThrow(/MULTIPLE_PRICE_LISTS/);
  });

  it("stops on a second price list even while a branch is trading", async () => {
    // The guard in the function is what makes the stop real. Left to
    // resolve_price_list_id(null) this case would not raise at all: with an
    // active branch the resolver returns that branch's list and never reaches
    // its own single-list rule. The two assertions below are that sentence in
    // SQL, and they are the reason the function does not simply lean on it.
    await db.exec(`
      insert into price_lists (slug, name) values ('second', 'Second');
      insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists where slug = 'second';
    `);

    expect(await scalar<string>(db, "select resolve_price_list_id(null)::text"))
      .toBe(await scalar<string>(db, "select id::text from price_lists where slug = 'second'"));
    await expect(
      asUser(db, MANAGER, `select staff_set_option_variation_prices('${await itemId(db, "buffalo-wings")}', '${await optionId(db)}', '{}'::jsonb)`),
    ).rejects.toThrow(/MULTIPLE_PRICE_LISTS/);
  });

  it("writes no audit row when the pairings do not change", async () => {
    const item = await itemId(db, "buffalo-wings");
    const option = await optionId(db);
    const half = await variationId(db, item, "half");
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000))`);
    await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000))`);
    const audit = await asUser<{ action: string }>(db, MANAGER, "select action from audit_logs order by id");
    expect(audit.map((entry) => entry.action)).toEqual(["menu.item.option_prices_set"]);
  });
});

/**
 * The one rule that needs a real order behind it.
 *
 * Ruling R4 says a variation the payload does not name is deactivated and
 * never deleted, and this is the case that ruling exists for: a size a
 * customer has already been charged for, dropped from a payload by a client
 * bug. Built the way tests/sql/menu-catalog-writes.test.ts builds one, through
 * place_order itself, so the row the guard protects is a row the product
 * wrote rather than one this file invented.
 */
type PayloadLine = {
  item_slug: string;
  variation_slug: string;
  qty: number;
  options?: { group_slug: string; option_slug: string }[];
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

describe("a size a past order carries", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await db.exec(`
      insert into auth.users (id, email) values ('${MANAGER}', 'manager@example.com');
      insert into profiles (id, role, staff_role, display_name)
      values ('${MANAGER}', 'staff', 'manager', 'Roving manager');
    `);
    await openBranch(db);
    await place(db, [{
      item_slug: "chicken-wings",
      variation_slug: "full",
      qty: 2,
      options: [
        { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
        { group_slug: "level-of-hotness", option_slug: "insane" },
      ],
    }], await firstSlot(db));
  }, 120_000);

  it("survives a save that leaves it out, deactivated rather than deleted", async () => {
    const item = await scalar<string>(db, "select id::text from menu_items where slug = 'chicken-wings'");
    const category = await scalar<string>(db, `select category_id::text from menu_items where id = '${item}'`);
    const half = await scalar<string>(db, `select id::text from item_variations where item_id = '${item}' and slug = 'half'`);
    const full = await scalar<string>(db, `select id::text from item_variations where item_id = '${item}' and slug = 'full'`);
    const line = await scalar<number>(db, `select count(*)::int from order_items where variation_id = '${full}'`);
    expect(line).toBe(1);

    await save(db, {
      id: item,
      category,
      name: "Chicken Wings",
      variations: [{ ...HALF, id: half }],
    });

    expect(await scalar<boolean>(db, `select is_active from item_variations where id = '${full}'`)).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from order_items where variation_id = '${full}'`)).toBe(1);
    expect(await scalar<string>(db, `select variation_label_snapshot from order_items where variation_id = '${full}'`)).toBe("Full, 10 pieces");
  });
});
