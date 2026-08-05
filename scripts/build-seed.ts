/**
 * Generate `supabase/seed.sql` from the static catalog.
 *
 * The seed is not hand written, and that is the whole point. `lib/catalog/`
 * already holds the transcribed Hot Wings menu, the nine flavours, the Level of
 * Hotness scale with its variation-dependent pricing, and the nine branches.
 * Writing those facts a second time in SQL guarantees the two copies disagree
 * within a month, and a menu that disagrees with itself charges the wrong
 * price. So the SQL is generated and `supabase/seed.sql` is a build artefact.
 *
 * Run: npm run build:seed
 *
 * Scope: Hot Wings only. Nothing from the Sports Lounge, which closed in
 * August 2026.
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { branches } from "../lib/catalog/branches";
import { categories } from "../lib/catalog/menu";
import { catalogImage } from "../lib/catalog/images";
import type { CatalogItem, CatalogOptionGroup } from "../lib/catalog/types";

const OUT = path.join(process.cwd(), "supabase", "seed.sql");

const PRICE_LIST_SLUG = "hot-wings-standard";
const PRICE_LIST_NAME = "Hot Wings standard";

/** A SQL string literal. Doubles the quotes, or writes null. */
function lit(value: string | null | undefined): string {
  if (value === null || value === undefined) return "null";
  return `'${value.replace(/'/g, "''")}'`;
}

function textArray(values: string[]): string {
  if (values.length === 0) return `'{}'::text[]`;
  return `array[${values.map((value) => lit(value)).join(", ")}]::text[]`;
}

function bool(value: boolean): string {
  return value ? "true" : "false";
}

/** Every option group used by the menu, in first-seen order. */
function optionGroups(): CatalogOptionGroup[] {
  const seen = new Map<string, CatalogOptionGroup>();
  for (const category of categories) {
    for (const item of category.items) {
      for (const group of item.optionGroups) {
        if (!seen.has(group.slug)) seen.set(group.slug, group);
      }
    }
  }
  return [...seen.values()];
}

function allItems(): { item: CatalogItem; categorySlug: string; sort: number }[] {
  return categories.flatMap((category) =>
    category.items.map((item, index) => ({
      item,
      categorySlug: category.slug,
      sort: index,
    })),
  );
}

/**
 * The variation a product page opens on, and the row that carries is_default.
 * Always the cheapest entry point, matching `defaultVariation()` in
 * lib/catalog/pricing.ts so the database and the storefront agree on which
 * chip is pre-selected.
 */
function defaultVariationSlug(item: CatalogItem): string {
  return item.variations.reduce((cheapest, variation) =>
    variation.priceCents < cheapest.priceCents ? variation : cheapest,
  ).slug;
}

const out: string[] = [];
const w = (line = "") => out.push(line);

function header() {
  w("-- supabase/seed.sql");
  w("--");
  w("-- GENERATED FILE. Do not edit by hand.");
  w("-- Regenerate with `npm run build:seed` after changing lib/catalog/.");
  w("--");
  w("-- The published Hot Wings menu, the nine flavours, the Level of Hotness");
  w("-- scale and the nine branches, as transcribed in lib/catalog/. Generated");
  w("-- rather than written so the storefront and the database cannot drift.");
  w("--");
  w("-- Every insert is an upsert on a natural key, so this file is safe to");
  w("-- re-run. Two categories of column are deliberately left out of the");
  w("-- update lists, because they belong to whoever is running the shop and");
  w("-- not to this file:");
  w("--");
  w("--   * availability: menu_categories.is_active, menu_items.is_active,");
  w("--     item_variations.is_active, menu_options.is_active");
  w("--   * branch operations: is_active, is_accepting_orders, prep_minutes_");
  w("--     default, pickup_slot_minutes, pickup_slot_capacity, price_list_id");
  w("--");
  w("-- Prices ARE reasserted. This file is the published price list, so");
  w("-- re-running it after someone edits a price in the workspace puts the");
  w("-- printed menu back. That is the intended behaviour, and it is the reason");
  w("-- to reach for this file rather than for a hand-written patch.");
  w("--");
  w("-- Not seeded, on purpose:");
  w("--");
  w("--   * store_hours. The real weekday hours are open question 2 in spec");
  w("--     section 28 and only the owner can answer them. branch_is_open_at()");
  w("--     fails closed with no rows, which is the correct behaviour: a shop");
  w("--     with unknown hours is shut, not guessing.");
  w("--   * the pilot branch. All nine are seeded is_active = false. Which one");
  w("--     opens first is question 1 and nothing here decides it.");
  w("--   * item_variation_prices. One price list exists, and its prices are");
  w("--     already on item_variations.price_cents, which is where");
  w("--     resolve_variation_price_cents() falls back to. Seeding both would");
  w("--     be two copies of one number. The override table earns its place the");
  w("--     day a second list exists.");
  w("--   * image_url. scripts/ingest-legacy-images.ts writes it after it");
  w("--     uploads to Storage. What is seeded here is the archive provenance,");
  w("--     so a photograph can be traced back to its source file.");
  w("");
  w("begin;");
  w("");
}

function priceList() {
  w("-- ---------------------------------------------------------------------------");
  w("-- Price list");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into price_lists (slug, name) values");
  w(`  (${lit(PRICE_LIST_SLUG)}, ${lit(PRICE_LIST_NAME)})`);
  w("on conflict (slug) do update set name = excluded.name;");
  w("");
}

function branchRows() {
  w("-- ---------------------------------------------------------------------------");
  w(`-- Branches (${branches.length}), every one inactive. Exactly one gets flipped`);
  w("-- when the owner names the pilot.");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into branches (");
  w("  slug, name, short_name, format, price_list_id,");
  w("  address_line, city, phones, sort_order");
  w(") values");

  const values = branches.map((branch, index) => {
    return [
      "  (",
      `${lit(branch.slug)}, ${lit(branch.name)}, ${lit(branch.shortName)},`,
      ` ${lit(branch.format)},`,
      ` (select id from price_lists where slug = ${lit(PRICE_LIST_SLUG)}),`,
      ` ${lit(branch.addressLine)}, ${lit(branch.city)},`,
      ` ${textArray(branch.phones)}, ${index})`,
    ].join("");
  });
  w(values.join(",\n"));
  w("on conflict (slug) do update set");
  w("  name = excluded.name,");
  w("  short_name = excluded.short_name,");
  w("  format = excluded.format,");
  w("  address_line = excluded.address_line,");
  w("  city = excluded.city,");
  w("  phones = excluded.phones,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function categoryRows() {
  w("-- ---------------------------------------------------------------------------");
  w("-- Categories");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into menu_categories (slug, name, blurb, sort_order) values");
  w(
    categories
      .map(
        (category, index) =>
          `  (${lit(category.slug)}, ${lit(category.name)}, ${lit(category.blurb)}, ${index})`,
      )
      .join(",\n"),
  );
  w("on conflict (slug) do update set");
  w("  name = excluded.name,");
  w("  blurb = excluded.blurb,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function itemRows() {
  w("-- ---------------------------------------------------------------------------");
  w("-- Items");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into menu_items (");
  w("  category_id, slug, name, code, description,");
  w("  image_source, image_treatment, pricing_note, is_featured, sort_order");
  w(") values");

  const rows = allItems().map(({ item, categorySlug, sort }) => {
    const image = catalogImage(item.imageKey);
    return [
      "  (",
      `(select id from menu_categories where slug = ${lit(categorySlug)}),`,
      ` ${lit(item.slug)}, ${lit(item.name)}, ${lit(item.code ?? null)},`,
      ` ${lit(item.description ?? null)},`,
      ` ${lit(image?.source ?? null)}, ${lit(image?.treatment ?? null)},`,
      ` ${lit(item.pricingNote ?? null)}, ${bool(Boolean(item.featured))}, ${sort})`,
    ].join("");
  });
  w(rows.join(",\n"));
  w("on conflict (slug) do update set");
  w("  category_id = excluded.category_id,");
  w("  name = excluded.name,");
  w("  code = excluded.code,");
  w("  description = excluded.description,");
  w("  image_source = excluded.image_source,");
  w("  image_treatment = excluded.image_treatment,");
  w("  pricing_note = excluded.pricing_note,");
  w("  is_featured = excluded.is_featured,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function variationRows() {
  w("-- ---------------------------------------------------------------------------");
  w("-- Variations. A single-price item still gets one row, so nothing");
  w("-- downstream has to branch on whether an item has sizes.");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into item_variations (");
  w("  item_id, slug, label, short_label, price_cents, is_default, sort_order");
  w(") values");

  const rows: string[] = [];
  for (const { item } of allItems()) {
    const defaultSlug = defaultVariationSlug(item);
    item.variations.forEach((variation, index) => {
      rows.push(
        [
          "  (",
          `(select id from menu_items where slug = ${lit(item.slug)}),`,
          ` ${lit(variation.slug)}, ${lit(variation.name)}, ${lit(variation.shortName)},`,
          ` ${variation.priceCents}, ${bool(variation.slug === defaultSlug)}, ${index})`,
        ].join(""),
      );
    });
  }
  w(rows.join(",\n"));
  w("on conflict (item_id, slug) do update set");
  w("  label = excluded.label,");
  w("  short_label = excluded.short_label,");
  w("  price_cents = excluded.price_cents,");
  w("  is_default = excluded.is_default,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function optionGroupRows() {
  const groups = optionGroups();

  w("-- ---------------------------------------------------------------------------");
  w("-- Option groups and options");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into menu_option_groups (slug, name, sort_order) values");
  w(
    groups
      .map((group, index) => `  (${lit(group.slug)}, ${lit(group.name)}, ${index})`)
      .join(",\n"),
  );
  w("on conflict (slug) do update set");
  w("  name = excluded.name,");
  w("  sort_order = excluded.sort_order;");
  w("");

  w("insert into menu_options (");
  w("  group_id, slug, name, description, price_cents, heat_percent,");
  w("  image_source, sort_order");
  w(") values");

  const rows: string[] = [];
  for (const group of groups) {
    group.options.forEach((option, index) => {
      const image = catalogImage(option.imageKey);
      rows.push(
        [
          "  (",
          `(select id from menu_option_groups where slug = ${lit(group.slug)}),`,
          ` ${lit(option.slug)}, ${lit(option.name)}, ${lit(option.description ?? null)},`,
          // Null is meaningful: it says this option has no flat price at all
          // and the variation decides. See menu_option_variation_prices below.
          ` ${option.priceCents === null ? "null" : option.priceCents},`,
          ` ${option.heatPercent === undefined ? "null" : option.heatPercent},`,
          ` ${lit(image?.source ?? null)}, ${index})`,
        ].join(""),
      );
    });
  }
  w(rows.join(",\n"));
  w("on conflict (group_id, slug) do update set");
  w("  name = excluded.name,");
  w("  description = excluded.description,");
  w("  price_cents = excluded.price_cents,");
  w("  heat_percent = excluded.heat_percent,");
  w("  image_source = excluded.image_source,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function itemOptionGroupRows() {
  w("-- ---------------------------------------------------------------------------");
  w("-- Which groups hang off which item, and how many the customer must pick");
  w("-- ---------------------------------------------------------------------------");
  w("");
  w("insert into menu_item_option_groups (");
  w("  item_id, group_id, is_required, min_select, max_select, sort_order");
  w(") values");

  const rows: string[] = [];
  for (const { item } of allItems()) {
    item.optionGroups.forEach((group, index) => {
      rows.push(
        [
          "  (",
          `(select id from menu_items where slug = ${lit(item.slug)}),`,
          ` (select id from menu_option_groups where slug = ${lit(group.slug)}),`,
          ` ${bool(group.minSelect > 0)}, ${group.minSelect}, ${group.maxSelect}, ${index})`,
        ].join(""),
      );
    });
  }

  if (rows.length === 0) {
    // Not reachable with the current menu, but a generator that emits
    // `values;` on an empty list is a landmine for whoever edits the catalog.
    out.pop();
    w("-- No item carries an option group.");
    w("");
    return;
  }

  w(rows.join(",\n"));
  w("on conflict (item_id, group_id) do update set");
  w("  is_required = excluded.is_required,");
  w("  min_select = excluded.min_select,");
  w("  max_select = excluded.max_select,");
  w("  sort_order = excluded.sort_order;");
  w("");
}

function optionVariationPriceRows() {
  const rows: string[] = [];

  for (const { item } of allItems()) {
    for (const group of item.optionGroups) {
      for (const option of group.options) {
        if (!option.variationPriceCents) continue;
        for (const [variationSlug, priceCents] of Object.entries(
          option.variationPriceCents,
        )) {
          // A price keyed to a variation the item does not have is a typo in
          // the catalog, and silently dropping it would ship a free upgrade.
          const known = item.variations.some((v) => v.slug === variationSlug);
          if (!known) {
            throw new Error(
              `${item.slug}: option ${option.slug} prices unknown variation "${variationSlug}"`,
            );
          }
          rows.push(
            [
              "  (",
              `(select o.id from menu_options o`,
              ` join menu_option_groups g on g.id = o.group_id`,
              ` where g.slug = ${lit(group.slug)} and o.slug = ${lit(option.slug)}),`,
              ` (select v.id from item_variations v`,
              ` join menu_items i on i.id = v.item_id`,
              ` where i.slug = ${lit(item.slug)} and v.slug = ${lit(variationSlug)}),`,
              ` (select id from price_lists where slug = ${lit(PRICE_LIST_SLUG)}),`,
              ` ${priceCents})`,
            ].join(""),
          );
        }
      }
    }
  }

  w("-- ---------------------------------------------------------------------------");
  w("-- Variation-dependent option prices.");
  w("--");
  w("-- The Level of Hotness costs PHP 30 on a HALF order of wings and PHP 40 on");
  w("-- a FULL one, and INSANE costs PHP 40 and PHP 60. A flat upcharge cannot");
  w("-- say that, which is why menu_options.price_cents is null for these rows");
  w("-- and the real number lives here, per (option, variation, price list).");
  w("-- ---------------------------------------------------------------------------");
  w("");

  if (rows.length === 0) {
    w("-- No option is priced per variation.");
    w("");
    return;
  }

  w("insert into menu_option_variation_prices (");
  w("  option_id, variation_id, price_list_id, price_cents");
  w(") values");
  w(rows.join(",\n"));
  w("on conflict (option_id, variation_id, price_list_id) do update set");
  w("  price_cents = excluded.price_cents;");
  w("");
}

async function build() {
  header();
  priceList();
  branchRows();
  categoryRows();
  itemRows();
  variationRows();
  optionGroupRows();
  itemOptionGroupRows();
  optionVariationPriceRows();
  w("commit;");

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, `${out.join("\n")}\n`, "utf8");

  const items = allItems();
  const variations = items.reduce((n, { item }) => n + item.variations.length, 0);
  const options = optionGroups().reduce((n, group) => n + group.options.length, 0);

  console.log(`supabase/seed.sql written`);
  console.log(
    `  ${categories.length} categories, ${items.length} items, ${variations} variations`,
  );
  console.log(
    `  ${optionGroups().length} option groups, ${options} options, ${branches.length} branches`,
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
