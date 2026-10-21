import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0093: the selection rules on an item's option groups.
 *
 * Before it, a link created by staff_save_menu_item always took the column
 * defaults (optional, one choice), so relinking a flavour group made flavour
 * optional, and no screen could say otherwise.
 */

const MANAGER = "7a000000-0000-4000-8000-000000000002";

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values ('${MANAGER}', 'manager@example.com');
    insert into profiles (id, role, staff_role, display_name) values ('${MANAGER}', 'staff', 'manager', 'Manager');
    insert into menu_categories (slug, name, sort_order) values ('wings', 'Wings', 10);
    insert into menu_items (category_id, slug, name, sort_order)
    select id, 'buffalo-wings', 'Buffalo Wings', 10 from menu_categories;
    insert into menu_option_groups (slug, name, sort_order) values
      ('wing-flavour', 'Wing Flavour', 10),
      ('add-ons', 'Add-ons', 20);
    insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
    select i.id, g.id, true, 1, 1, 10
    from menu_items i, menu_option_groups g
    where i.slug = 'buffalo-wings' and g.slug = 'wing-flavour';
  `);
  return db;
}

async function save(db: PGlite, groups: string[], rules: unknown = null): Promise<string> {
  const category = await scalar<string>(db, "select id::text from menu_categories");
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${MANAGER}'::uuid $$; set role authenticated;`);
  try {
    const result = await db.query<{ id: string }>(
      `select staff_save_menu_item(
         null, $1::uuid, 'Boneless Wings', null, null, false, true,
         $2::jsonb, $3::uuid[], $4::jsonb
       ) as id`,
      [
        category,
        JSON.stringify([{ id: null, label: "Half", shortLabel: "H", priceCents: 32900, isDefault: true, isActive: true }]),
        groups,
        rules === null ? null : JSON.stringify(rules),
      ],
    );
    return result.rows[0].id;
  } finally {
    await db.exec("reset role");
  }
}

const groupId = (db: PGlite, slug: string) =>
  scalar<string>(db, `select id::text from menu_option_groups where slug = '${slug}'`);
const rule = (db: PGlite, item: string, group: string) =>
  db
    .query<{ min_select: number; max_select: number; is_required: boolean }>(
      "select min_select, max_select, is_required from menu_item_option_groups where item_id = $1 and group_id = $2",
      [item, group],
    )
    .then((result) => result.rows[0]);

describe("staff_save_menu_item option rules", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("starts a new link from the rule its group has elsewhere", async () => {
    const flavour = await groupId(db, "wing-flavour");
    const item = await save(db, [flavour]);
    expect(await rule(db, item, flavour)).toEqual({ min_select: 1, max_select: 1, is_required: true });
  });

  it("falls back to optional, one choice, for a group linked nowhere", async () => {
    const addOns = await groupId(db, "add-ons");
    const item = await save(db, [addOns]);
    expect(await rule(db, item, addOns)).toEqual({ min_select: 0, max_select: 1, is_required: false });
  });

  it("saves the rules the editor sends, over the inherited ones", async () => {
    const flavour = await groupId(db, "wing-flavour");
    const addOns = await groupId(db, "add-ons");
    const item = await save(db, [flavour, addOns], [
      { groupId: flavour, minSelect: 2, maxSelect: 2 },
      { groupId: addOns, minSelect: 0, maxSelect: 3 },
    ]);
    expect(await rule(db, item, flavour)).toEqual({ min_select: 2, max_select: 2, is_required: true });
    expect(await rule(db, item, addOns)).toEqual({ min_select: 0, max_select: 3, is_required: false });
  });

  it("refuses a rule that requires more than it allows", async () => {
    const flavour = await groupId(db, "wing-flavour");
    await expect(save(db, [flavour], [{ groupId: flavour, minSelect: 3, maxSelect: 1 }])).rejects.toThrow(
      /INVALID_INPUT/,
    );
  });

  it("records a rule-only change in the audit trail", async () => {
    const flavour = await groupId(db, "wing-flavour");
    const item = await save(db, [flavour]);
    const category = await scalar<string>(db, "select id::text from menu_categories");
    const variationId = await scalar<string>(db, `select id::text from item_variations where item_id = '${item}'`);
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${MANAGER}'::uuid $$; set role authenticated;`);
    try {
      await db.query(
        `select staff_save_menu_item($1::uuid, $2::uuid, 'Boneless Wings', null, null, false, true, $3::jsonb, $4::uuid[], $5::jsonb)`,
        [
          item,
          category,
          JSON.stringify([{ id: variationId, label: "Half", shortLabel: "H", priceCents: 32900, isDefault: true, isActive: true }]),
          [flavour],
          JSON.stringify([{ groupId: flavour, minSelect: 0, maxSelect: 1 }]),
        ],
      );
    } finally {
      await db.exec("reset role");
    }
    expect(
      await scalar<number>(db, `select count(*)::int from audit_logs where target_id = '${item}' and action = 'menu.item.updated'`),
    ).toBe(1);
  });
});
