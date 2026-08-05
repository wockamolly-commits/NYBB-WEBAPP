import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";
import { categories as staticCategories } from "@/lib/catalog/menu";
import { optionPriceCents } from "@/lib/catalog/pricing";
import { hydrateMenuPayload, menuPayloadSchema } from "@/lib/menu/storefront";
import { staticMenu } from "@/lib/menu/static";

/**
 * Tests over get_storefront_menu(), migration 0011.
 *
 * The claim this function has to earn is that swapping the static Phase 0
 * catalog for the database is a change of source and not a change of shape.
 * The last block in this file checks exactly that, item by item and price by
 * price, against lib/catalog itself.
 */

type MenuOption = {
  slug: string;
  name: string;
  priceCents: number | null;
  variationPriceCents: Record<string, number>;
  heatPercent?: number;
  image?: { src: string; source?: string };
};

type MenuCategory = {
  slug: string;
  name: string;
  blurb: string;
  items: {
    slug: string;
    name: string;
    code?: string;
    categorySlug: string;
    featured: boolean;
    variations: { slug: string; name: string; shortName: string; priceCents: number }[];
    optionGroups: {
      slug: string;
      name: string;
      minSelect: number;
      maxSelect: number;
      options: MenuOption[];
    }[];
  }[];
};

async function menu(db: PGlite, branchSlug?: string): Promise<MenuCategory[]> {
  const result = await db.query<{ menu: MenuCategory[] }>(
    "select get_storefront_menu($1) as menu",
    [branchSlug ?? null],
  );
  return result.rows[0].menu;
}

describe("get_storefront_menu", () => {
  let db: PGlite;
  let seeded: MenuCategory[];

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    seeded = await menu(db);
  }, 120_000);

  it("returns every seeded category, in menu order", () => {
    expect(seeded.map((category) => category.slug)).toEqual(
      staticCategories.map((category) => category.slug),
    );
  });

  it("prices the wings at the published half and full", () => {
    const wings = seeded[0].items[0];
    expect(wings.slug).toBe("chicken-wings");
    expect(wings.variations).toEqual([
      { slug: "half", name: "Half, 6 pieces", shortName: "HALF", priceCents: 32900 },
      { slug: "full", name: "Full, 10 pieces", shortName: "FULL", priceCents: 52900 },
    ]);
  });

  it("carries the Level of Hotness price per variation, not as one number", () => {
    const heat = seeded[0].items[0].optionGroups.find(
      (group) => group.slug === "level-of-hotness",
    );
    const level = (slug: string) => heat!.options.find((option) => option.slug === slug)!;

    for (const slug of ["lite", "moderate", "hot", "wild"]) {
      expect(level(slug).variationPriceCents, slug).toEqual({ half: 3000, full: 4000 });
    }
    expect(level("insane").variationPriceCents).toEqual({ half: 4000, full: 6000 });
  });

  it("keeps priceCents null on a variation-priced option", () => {
    // Null is the statement that there is no flat price and the variation
    // decides. jsonb_strip_nulls would have removed the key, which reads as
    // "free" to anything doing `option.priceCents ?? 0`, so the key is merged
    // back in after the strip. This asserts that it survived.
    const heat = seeded[0].items[0].optionGroups.find(
      (group) => group.slug === "level-of-hotness",
    )!;
    const lite = heat.options.find((option) => option.slug === "lite")!;

    expect("priceCents" in lite).toBe(true);
    expect(lite.priceCents).toBeNull();
  });

  it("charges nothing to choose a flavour", () => {
    const flavours = seeded[0].items[0].optionGroups.find(
      (group) => group.slug === "wing-flavour",
    )!;
    expect(flavours.options).toHaveLength(9);
    for (const flavour of flavours.options) {
      expect(flavour.priceCents, flavour.slug).toBe(0);
      expect(flavour.variationPriceCents, flavour.slug).toEqual({});
    }
  });

  it("gives every item a variations array, even with one price", () => {
    for (const category of seeded) {
      for (const item of category.items) {
        expect(Array.isArray(item.variations), item.slug).toBe(true);
        expect(item.variations.length, item.slug).toBeGreaterThan(0);
        expect(Array.isArray(item.optionGroups), item.slug).toBe(true);
      }
    }
  });

  it("hides an item that is switched off", async () => {
    const scratch = await freshDatabase({ seed: true });
    await scratch.exec(`update menu_items set is_active = false where slug = 'french-fries'`);

    const sides = (await menu(scratch)).find((category) => category.slug === "sides")!;
    expect(sides.items.map((item) => item.slug)).not.toContain("french-fries");
  }, 120_000);

  it("drops a category once nothing in it is on sale", async () => {
    const scratch = await freshDatabase({ seed: true });
    await scratch.exec(`
      update menu_items set is_active = false
      where category_id = (select id from menu_categories where slug = 'pasta')
    `);

    const slugs = (await menu(scratch)).map((category) => category.slug);
    expect(slugs).not.toContain("pasta");
    expect(slugs).toContain("sides");
  }, 120_000);

  it("applies a price list override when the branch has one", async () => {
    const scratch = await freshDatabase({ seed: true });
    await scratch.exec(`
      insert into price_lists (slug, name) values ('mall', 'Mall pricing');

      insert into item_variation_prices (variation_id, price_list_id, price_cents)
      select iv.id, pl.id, 35900
      from item_variations iv, price_lists pl
      where iv.slug = 'half' and pl.slug = 'mall'
        and iv.item_id = (select id from menu_items where slug = 'chicken-wings');

      update branches
      set price_list_id = (select id from price_lists where slug = 'mall'),
          is_active = true
      where slug = 'sm-city-cebu';
    `);

    const half = (await menu(scratch, "sm-city-cebu"))[0].items[0].variations.find(
      (variation) => variation.slug === "half",
    )!;
    expect(half.priceCents).toBe(35900);

    // And the default list is untouched by the override.
    const standard = (await menu(scratch, "mango-avenue"))[0].items[0].variations.find(
      (variation) => variation.slug === "half",
    )!;
    expect(standard.priceCents).toBe(32900);
  }, 120_000);
});

describe("resolve_price_list_id", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
  }, 120_000);

  it("falls back to the only price list while no branch is active", async () => {
    // This is the state the project is actually in: the pilot branch is spec
    // section 28 question 1 and is unanswered, so all nine branches are seeded
    // inactive. The menu still has to price itself.
    const active = await db.query<{ count: number }>(
      "select count(*)::int as count from branches where is_active",
    );
    expect(active.rows[0].count).toBe(0);

    const resolved = await db.query<{ id: string }>(
      "select resolve_price_list_id() as id",
    );
    const only = await db.query<{ id: string }>("select id from price_lists");
    expect(resolved.rows[0].id).toBe(only.rows[0].id);
  });

  it("refuses to guess once a second price list exists and no branch is active", async () => {
    const scratch = await freshDatabase({ seed: true });
    await scratch.exec(`insert into price_lists (slug, name) values ('mall', 'Mall pricing')`);

    await expect(scratch.query("select resolve_price_list_id()")).rejects.toThrow(
      /no price list resolvable/,
    );
  }, 120_000);

  it("raises on a branch slug that does not exist", async () => {
    await expect(
      db.query("select resolve_price_list_id('not-a-branch')"),
    ).rejects.toThrow(/unknown branch slug/);
  });

  it("never lets a missing price list make the heat add-on free", async () => {
    // The failure this guards against is silent: with no resolvable list,
    // resolve_option_price_cents finds no override row, falls through to
    // menu_options.price_cents (null for every heat level by design) and
    // coalesces to zero. The menu would render, and every level of heat would
    // be free.
    const scratch = await freshDatabase({ seed: true });
    await scratch.exec(`insert into price_lists (slug, name) values ('mall', 'Mall pricing')`);

    await expect(scratch.query("select get_storefront_menu()")).rejects.toThrow(
      /no price list resolvable/,
    );
  }, 120_000);
});

/**
 * The interchangeability claim, checked rather than asserted in a comment.
 *
 * supabase/seed.sql is generated from lib/catalog, so if these two ever
 * disagree it means either the generator dropped something or the function
 * reshaped it. Both are worth failing a build over, because the whole Phase 1
 * plan is that the pages can switch source without changing.
 */
describe("database and static catalog agree", () => {
  let seeded: MenuCategory[];

  beforeAll(async () => {
    seeded = await menu(await freshDatabase({ seed: true }));
  }, 120_000);

  it("on categories, items and item codes", () => {
    expect(
      seeded.map((category) => ({
        slug: category.slug,
        name: category.name,
        blurb: category.blurb,
        items: category.items.map((item) => ({ slug: item.slug, name: item.name, code: item.code })),
      })),
    ).toEqual(
      staticCategories.map((category) => ({
        slug: category.slug,
        name: category.name,
        blurb: category.blurb,
        items: category.items.map((item) => ({
          slug: item.slug,
          name: item.name,
          ...(item.code ? { code: item.code } : {}),
        })),
      })),
    );
  });

  it("on every variation price", () => {
    for (const category of staticCategories) {
      for (const item of category.items) {
        const fromDb = seeded
          .find((c) => c.slug === category.slug)!
          .items.find((i) => i.slug === item.slug)!;

        expect(
          fromDb.variations.map((variation) => [variation.slug, variation.priceCents]),
          item.slug,
        ).toEqual(item.variations.map((variation) => [variation.slug, variation.priceCents]));
      }
    }
  });

  it("on every option price, resolved against every variation", () => {
    for (const category of staticCategories) {
      for (const item of category.items) {
        const fromDb = seeded
          .find((c) => c.slug === category.slug)!
          .items.find((i) => i.slug === item.slug)!;

        for (const group of item.optionGroups) {
          const dbGroup = fromDb.optionGroups.find((g) => g.slug === group.slug)!;
          expect(dbGroup, `${item.slug}/${group.slug}`).toBeDefined();
          expect(dbGroup.minSelect).toBe(group.minSelect);
          expect(dbGroup.maxSelect).toBe(group.maxSelect);

          for (const option of group.options) {
            const dbOption = dbGroup.options.find((o) => o.slug === option.slug)!;
            const label = `${item.slug}/${group.slug}/${option.slug}`;
            expect(dbOption, label).toBeDefined();

            for (const variation of item.variations) {
              const expected = optionPriceCents(option, variation.slug);
              const actual =
                dbOption.variationPriceCents[variation.slug] ?? dbOption.priceCents ?? 0;
              expect(actual, `${label} on ${variation.slug}`).toBe(expected);
            }
          }
        }
      }
    }
  });
});

/**
 * The whole Phase 1 premise, in one assertion.
 *
 * The reader is supposed to make the source invisible: the same pages, the
 * same components, the same props, whether the menu came from Postgres or from
 * the file that seeded it. So run the real function output through the real
 * zod parse and the real hydration, and require it to be indistinguishable
 * from the static projection.
 *
 * The images are the interesting half. The seed deliberately writes
 * image_source and not image_url, because scripts/ingest-legacy-images.ts
 * writes the URL only after it has uploaded to Storage. Without the
 * source-to-derivative bridge in the reader, this test fails on every tile in
 * the catalog, which is precisely the regression it exists to catch.
 */
describe("the reader makes the source invisible", () => {
  it("hydrates the database payload into exactly the static menu", async () => {
    const db = await freshDatabase({ seed: true });
    const result = await db.query<{ menu: unknown }>("select get_storefront_menu() as menu");

    const fromDatabase = hydrateMenuPayload(menuPayloadSchema.parse(result.rows[0].menu));

    expect(fromDatabase).toEqual(staticMenu());
  }, 120_000);
});
