import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { branches } from "@/lib/catalog/branches";
import { categories, wingHeat } from "@/lib/catalog/menu";
import { optionPriceCents } from "@/lib/catalog/pricing";
import { freshDatabase, readSeed, scalar } from "./harness";

/**
 * supabase/seed.sql is generated from lib/catalog by `npm run build:seed`.
 *
 * These tests exist to catch the failure that generation is supposed to
 * prevent and cannot prevent on its own: someone edits the catalog, forgets to
 * regenerate, and the committed seed quietly describes last month's menu. So
 * the assertions compare the applied database against the TypeScript catalog
 * rather than against numbers written out a second time here.
 */
describe("seed", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
  }, 120_000);

  it("matches the catalog's shape", async () => {
    const items = categories.flatMap((category) => category.items);
    const variations = items.reduce((n, item) => n + item.variations.length, 0);

    const counts = (
      await db.query<Record<string, bigint>>(`
        select
          (select count(*) from menu_categories) as categories,
          (select count(*) from menu_items) as items,
          (select count(*) from item_variations) as variations,
          (select count(*) from branches) as branches
      `)
    ).rows[0];

    expect(Number(counts.categories)).toBe(categories.length);
    expect(Number(counts.items)).toBe(items.length);
    expect(Number(counts.variations)).toBe(variations);
    expect(Number(counts.branches)).toBe(branches.length);
  });

  it("carries every item slug from the catalog", async () => {
    const rows = await db.query<{ slug: string }>(
      `select slug from menu_items order by slug`,
    );
    const expected = categories
      .flatMap((category) => category.items.map((item) => item.slug))
      .sort();
    expect(rows.rows.map((row) => row.slug)).toEqual(expected);
  });

  // The pricing rule the spec calls the most likely place for a bug to hide,
  // checked end to end: every heat level, on every wing size, resolved by the
  // database, compared against what the storefront would show.
  it("prices the Level of Hotness the same way the storefront does", async () => {
    const wings = categories
      .flatMap((category) => category.items)
      .find((item) => item.slug === "chicken-wings");
    expect(wings).toBeDefined();

    for (const option of wingHeat.options) {
      for (const variation of wings!.variations) {
        const fromDatabase = await scalar<bigint>(
          db,
          `select resolve_option_price_cents(
             (select o.id from menu_options o
                join menu_option_groups g on g.id = o.group_id
                where g.slug = '${wingHeat.slug}' and o.slug = '${option.slug}'),
             (select v.id from item_variations v
                join menu_items i on i.id = v.item_id
                where i.slug = 'chicken-wings' and v.slug = '${variation.slug}'),
             (select id from price_lists where slug = 'hot-wings-standard'))`,
        );
        expect(
          Number(fromDatabase),
          `${option.slug} on ${variation.slug}`,
        ).toBe(optionPriceCents(option, variation.slug));
      }
    }
  });

  it("prices every variation the same way the catalog does", async () => {
    const rows = await db.query<{ item: string; variation: string; cents: bigint }>(`
      select i.slug as item, v.slug as variation,
             resolve_variation_price_cents(
               v.id, (select id from price_lists where slug = 'hot-wings-standard')
             ) as cents
      from item_variations v join menu_items i on i.id = v.item_id
    `);

    const expected = new Map<string, number>();
    for (const category of categories) {
      for (const item of category.items) {
        for (const variation of item.variations) {
          expected.set(`${item.slug}/${variation.slug}`, variation.priceCents);
        }
      }
    }

    expect(rows.rows.length).toBe(expected.size);
    for (const row of rows.rows) {
      expect(Number(row.cents), `${row.item}/${row.variation}`).toBe(
        expected.get(`${row.item}/${row.variation}`),
      );
    }
  });

  it("opens exactly one wing-flavour choice per order and never charges for it", async () => {
    const group = (
      await db.query<{ min_select: number; max_select: number }>(`
        select l.min_select, l.max_select
        from menu_item_option_groups l
        join menu_option_groups g on g.id = l.group_id
        join menu_items i on i.id = l.item_id
        where i.slug = 'chicken-wings' and g.slug = 'wing-flavour'
      `)
    ).rows[0];
    expect(group).toEqual({ min_select: 1, max_select: 1 });

    const paid = await scalar<bigint>(
      db,
      `select count(*) from menu_options o
         join menu_option_groups g on g.id = o.group_id
        where g.slug = 'wing-flavour' and coalesce(o.price_cents, 0) <> 0`,
    );
    expect(Number(paid)).toBe(0);
  });

  it("leaves the pilot branch and the opening hours unanswered", async () => {
    // Both are questions only the owner can answer (spec section 28). The seed
    // states that it does not know rather than picking something plausible.
    expect(Number(await scalar<bigint>(db, `select count(*) from branches where is_active`))).toBe(0);
    expect(Number(await scalar<bigint>(db, `select count(*) from store_hours`))).toBe(0);
  });

  it("holds nothing from the Sports Lounge", async () => {
    const hits = await scalar<bigint>(
      db,
      `select
         (select count(*) from branches
           where slug ilike '%central-bloc%' or name ilike '%lounge%'
              or name ilike '%ayala%')
       + (select count(*) from menu_items where name ilike '%lounge%')
       + (select count(*) from branches where brand <> 'hot_wings')`,
    );
    expect(Number(hits)).toBe(0);
  });

  it("is safe to re-run", async () => {
    const before = await scalar<bigint>(db, `select count(*) from menu_items`);
    await db.exec(await readSeed());
    const after = await scalar<bigint>(db, `select count(*) from menu_items`);
    expect(after).toBe(before);
  });

  // The upsert lists in the generator deliberately omit availability, so that
  // re-running the seed does not un-hide something the counter took off sale.
  it("does not reassert availability over the counter's decisions", async () => {
    await db.exec(`update menu_items set is_active = false where slug = 'carbonara'`);
    await db.exec(await readSeed());
    const active = await scalar<boolean>(
      db,
      `select is_active from menu_items where slug = 'carbonara'`,
    );
    expect(active).toBe(false);
  });

  // ... but prices are reasserted, because this file IS the published price
  // list. Both halves of that bargain are worth pinning down.
  it("does reassert a price", async () => {
    await db.exec(`
      update item_variations set price_cents = 1
      where slug = 'half'
        and item_id = (select id from menu_items where slug = 'chicken-wings')
    `);
    await db.exec(await readSeed());
    const cents = await scalar<bigint>(
      db,
      `select price_cents from item_variations
        where slug = 'half'
          and item_id = (select id from menu_items where slug = 'chicken-wings')`,
    );
    expect(Number(cents)).toBe(32900);
  });
});
