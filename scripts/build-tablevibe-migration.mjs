/**
 * Generate supabase/migrations/0103_menu_follow_tablevibe.sql from the
 * TableVibe menu captured in docs/reference/tablevibe-menu-2026-11-09.json.
 *
 * Reads the live menu once, only to tell which TableVibe items are already
 * ours (by name) and which are new. Writes nothing to the database.
 *
 * Run: node --env-file=.env.local scripts/build-tablevibe-migration.mjs  *        docs/reference/tablevibe-menu-2026-11-09.json  *        supabase/migrations/0103_menu_follow_tablevibe.sql
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const [tvPath, outPath] = process.argv.slice(2);
const tv = JSON.parse(fs.readFileSync(tvPath, "utf8"));

const CAPTURED = "2026-11-09";
const NOTE = `TableVibe webshop price, buffalobrads.tablevibe.co (Mango Avenue), captured ${CAPTURED}. The same for pickup and delivery there.`;

const trim = (s) => s.replace(/\r/g, "").trim();
const slugify = (s) =>
  trim(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/['’.]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => slugify(s).replace(/-/g, " ");
const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const desc = (s) => (s && trim(s) !== "" ? trim(s) : null);

const { data: ours } = await svc.from("menu_items").select("slug, name");
const oursByName = new Map(ours.map((o) => [norm(o.name), o.slug]));
const oursSlugs = new Set(ours.map((o) => o.slug));

// TableVibe category -> our category slug. Names are copied from TableVibe.
const CATEGORY = {
  "What's New": "whats-new", Chicken: "chicken-wings", "Hunger Buster": "hunger-busters",
  "Breaktime Treats": "breaktime-treats", "NY Specials": "ny-specials", Pasta: "pasta",
  "Value Meal": "value-meals", "NY Burgers": "ny-burgers", "Hotdog and Sausage": "ny-hotdogs",
  "Fries & Sides": "sides", "Coffee Series": "iced-coffee", Beverages: "beverages",
};
// The same product under a TableVibe name our name match cannot see.
const RENAMED = {
  "VM1 Burger Steak Meal": "burger-steak-meal", "VM2 Chicken Nuggets Meal": "chicken-nuggets-meal",
  "VM3 Boneless Chicken Meal": "boneless-chicken-meal", "VM4 Chicken Wings Meal": "chicken-wings-meal",
};
// A new item's photograph, copied from the item it replaces or extends.
const IMAGE_FROM = {
  "ny-ribs": "ribs-original", "10-pc-chicken-nuggets": "chicken-nuggets", "6-pc-chicken-nuggets": "chicken-nuggets",
  "vm1-burger-steak-solo": "burger-steak-meal", "vm2-chicken-nuggets-solo": "chicken-nuggets-meal",
  "vm3-boneless-chicken-solo": "boneless-chicken-meal", "vm4-chicken-wings-solo": "chicken-wings-meal",
  "sunrise-waffle-combo": "sunrise-waffle", "chocolate-waffle-combo": "chocolate-waffle", "bavarian-waffle-combo": "bavarian-waffle",
};
// Ours, not on TableVibe: switched off, never deleted (order_lines point at them).
const RETIRE = {
  "value-meal": "Retired when the menu followed the TableVibe webshop, which sells the VM1 to VM4 Solo and Meal items instead.",
  "chicken-nuggets": "Retired when the menu followed the TableVibe webshop, which sells 6-Pc. and 10-Pc. Chicken Nuggets as two items.",
  "ribs-original": "Retired when the menu followed the TableVibe webshop, which sells one NY Ribs item with a Choice of Ribs.",
  "ribs-spicy": "Retired when the menu followed the TableVibe webshop, which sells one NY Ribs item with a Choice of Ribs.",
  "hawaiian-bbq-dog": "Switched off: not on the TableVibe webshop menu, which this menu now follows exactly.",
  "hungarian-rice-meal": "Switched off: not on the TableVibe webshop menu, which this menu now follows exactly.",
  "chicken-with-rice": "Switched off: not on the TableVibe webshop menu, which this menu now follows exactly.",
};
const SIZE_GROUP = /^(portion size|size)$/i;
const SHORT = { "Half (6 Pcs)": "HALF", "Full (10 Pcs)": "FULL", Small: "SMALL", Medium: "MED", Large: "LARGE", "8oz": "8 OZ", "16oz": "16 OZ", "22oz": "22 OZ" };
// Our existing size rows, by the TableVibe label they now carry.
const SIZE_SLUG = { "Half (6 Pcs)": "half", "Full (10 Pcs)": "full", Small: "small", Medium: "medium", Large: "large", "8oz": "8-oz", "16oz": "16-oz", "22oz": "22-oz" };
// The heat group exists; its zero step is slugged none and TableVibe calls it Original.
const OPTION_SLUG = { "level-of-hotness": { Original: "none" } };
const WING_FLAVOUR_OPTION = {
  "Garlic Parmesan": "garlic-parmesan", "Classic Buffalo": "classic-buffalo", "Honey Garlic": "honey-garlic",
  "Honey Mustard": "honey-mustard", "BBQ Lime": "bbq-lime", "Brad's Gravy": "brads-gravy",
  "Sweet and Spicy": "sweet-spicy", "Smokey BBQ": "smokey-barbecue", Cheezy: "cheezy",
};

// ---- Walk TableVibe ------------------------------------------------------
const groups = new Map(); // slug -> {name, options:[{slug,name,price}], sig}
function groupFor(c) {
  const name = trim(c.display_name);
  const slug = name === "Level of Hotness" ? "level-of-hotness" : slugify(name);
  const options = c.options.map((o, i) => ({
    slug: OPTION_SLUG[slug]?.[trim(o.name)] ?? slugify(o.name), name: trim(o.name), price: o.price, sort: i * 10,
  }));
  const sig = JSON.stringify(options);
  const seen = groups.get(slug);
  if (seen && seen.sig !== sig) throw new Error(`group ${slug} has two different option lists`);
  if (new Set(options.map((o) => o.slug)).size !== options.length) throw new Error(`duplicate option slug in ${slug}`);
  if (!seen) groups.set(slug, { name, options, sig, sort: groups.size * 10 });
  const max = c.kind === "multi" ? Math.min(c.max_choices ?? options.length, options.length) : 1;
  const min = c.min_choices ?? 0;
  if (c.limit_per_option !== 1) throw new Error(`group ${slug} allows an option more than once`);
  return { slug, min, max };
}

const items = []; // {slug, cat, name, description, sort, variations:[{slug,label,short,price}], links:[{slug,min,max}], isNew}
const flavourDescriptions = [];
let wingsLinks = null;
let wingsVariations = null;

tv.categories.forEach((cat) => {
  const catSlug = CATEGORY[cat.name];
  if (!catSlug) throw new Error(`unmapped category ${cat.name}`);
  cat.items.forEach((li, index) => {
    const it = tv.items[li.sku];
    const name = trim(it.name);
    const custom = it.customizations ?? [];
    const sizes = custom.find((c) => SIZE_GROUP.test(trim(c.display_name)));
    const variations = sizes
      ? sizes.options.map((o) => ({ slug: SIZE_SLUG[trim(o.name)], label: trim(o.name), short: SHORT[trim(o.name)], price: it.price + o.price }))
      : [{ slug: "regular", label: "Regular", short: "REG", price: it.price }];
    if (variations.some((v) => !v.slug || !v.short)) throw new Error(`unmapped size on ${name}`);
    const links = custom.filter((c) => c !== sizes).map(groupFor);

    if (catSlug === "chicken-wings") {
      // One Chicken item, kept on purpose: the storefront is built around it.
      flavourDescriptions.push({ slug: WING_FLAVOUR_OPTION[name], description: desc(it.description) });
      const sig = JSON.stringify([variations, links]);
      if (wingsLinks && JSON.stringify([wingsVariations, wingsLinks]) !== sig) throw new Error("wing flavours differ in sizes or choices");
      wingsLinks = links; wingsVariations = variations;
      return;
    }
    const slug = RENAMED[name] ?? oursByName.get(norm(name)) ?? slugify(name);
    const isNew = !oursSlugs.has(slug);
    items.push({ slug, cat: catSlug, name, description: desc(it.description), sort: index * 10, variations, links, isNew });
  });
});
if (flavourDescriptions.some((f) => !f.slug)) throw new Error("unmapped wing flavour");
items.push({
  slug: "chicken-wings", cat: "chicken-wings", name: null, description: null, sort: 0,
  variations: wingsVariations, links: [{ slug: "wing-flavour", min: 1, max: 1 }, ...wingsLinks], isNew: false,
});
const slugs = items.map((i) => i.slug);
if (new Set(slugs).size !== slugs.length) throw new Error("two TableVibe items map to one slug");
for (const r of Object.keys(RETIRE)) if (slugs.includes(r)) throw new Error(`${r} is both kept and retired`);

// ---- SQL -----------------------------------------------------------------
const out = [];
const w = (s) => out.push(s);
const item = (slug) => `(select id from menu_items where slug = ${lit(slug)})`;
const group = (slug) => `(select id from menu_option_groups where slug = ${lit(slug)})`;

w(`-- 0103: the menu follows the TableVibe webshop (buffalobrads.tablevibe.co).
--
-- GENERATED from docs/reference/tablevibe-menu-${CAPTURED}.json, captured
-- ${CAPTURED} from the webshop's own menu API for the Mango Avenue venue. Its
-- pickup and delivery menus were identical, item for item and peso for peso.
-- Read that file, not this one, to check a price.
--
-- Decided with the user before it was written:
--   * TableVibe's layout wins, except wings. TableVibe sells each flavour as
--     its own item; here they stay one Chicken item with the flavour as a
--     choice, because the home, menu, wings, About and cart pages are built on
--     that item. Its sizes, prices and other choices are TableVibe's, and each
--     flavour takes the description TableVibe gives its wing item.
--   * Salted Egg stays a wing flavour, which TableVibe does not sell alone.
--   * Every item TableVibe lists is switched on, including the 25 that were
--     off waiting for an owner's pickup price. These are that price.
--   * Ours that TableVibe does not list are switched off, never deleted,
--     because order_lines point at them. So are sizes that no longer exist.
--   * One price at every counter.
--
-- Matched by slug throughout, so nothing is duplicated and a re-run changes
-- nothing. Branches, holds, photographs on existing items, featured flags,
-- codes, users and orders are not touched.
`);

w(`-- A database built from migrations alone (the SQL tests, a new environment)
-- has no menu yet: seed.sql runs after every migration. There is nothing to
-- follow TableVibe onto, so this does nothing there.
do $$
begin
if not exists (select 1 from menu_categories where slug = 'chicken-wings') then
  raise notice '0103: no menu to update, skipped';
  return;
end if;
`);
w("-- Categories: TableVibe's names and order. Waffles and Rice Meals are not on it.");
Object.entries(CATEGORY).forEach(([name, slug], i) =>
  w(`update menu_categories set name = ${lit(name)}, sort_order = ${i}, is_active = true where slug = ${lit(slug)};`));
w(`update menu_categories set is_active = false, sort_order = 12 where slug = 'rice-meals';`);
w(`update menu_categories set is_active = false, sort_order = 13 where slug = 'waffles';`);
w("");

w("-- Option groups and their options.");
for (const [slug, g] of groups) {
  w(`insert into menu_option_groups (slug, name, sort_order, is_active) values (${lit(slug)}, ${lit(g.name)}, ${g.sort}, true)
  on conflict (slug) do update set name = excluded.name, is_active = true;`);
  for (const o of g.options)
    w(`insert into menu_options (group_id, slug, name, price_cents, sort_order, is_active) values (${group(slug)}, ${lit(o.slug)}, ${lit(o.name)}, ${o.price}, ${o.sort}, true)
  on conflict (group_id, slug) do update set name = excluded.name, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;`);
  w(`update menu_options set is_active = false where group_id = ${group(slug)} and slug not in (${g.options.map((o) => lit(o.slug)).join(", ")});`);
}
w("");

w("-- Wing flavours: TableVibe's description for each flavour's wing item.");
for (const f of flavourDescriptions)
  if (f.description) w(`update menu_options set description = ${lit(f.description)} where slug = ${lit(f.slug)} and group_id = ${group("wing-flavour")};`);
w("");

w("-- Items.");
for (const i of items) {
  if (i.slug === "chicken-wings") {
    w(`update menu_items set is_active = true, pricing_note = ${lit(NOTE)} where slug = 'chicken-wings';`);
  } else {
    w(`insert into menu_items (category_id, slug, name, description, sort_order, is_active, pricing_note)
  values ((select id from menu_categories where slug = ${lit(i.cat)}), ${lit(i.slug)}, ${lit(i.name)}, ${lit(i.description)}, ${i.sort}, true, ${lit(NOTE)})
  on conflict (slug) do update set category_id = excluded.category_id, name = excluded.name,
    description = coalesce(excluded.description, menu_items.description), sort_order = excluded.sort_order,
    is_active = true, pricing_note = excluded.pricing_note;`);
  }
  const from = IMAGE_FROM[i.slug];
  if (from)
    w(`update menu_items t set image_url = s.image_url, image_source = s.image_source, image_width = s.image_width,
  image_height = s.image_height, image_blur_data_url = s.image_blur_data_url, image_treatment = s.image_treatment
  from menu_items s where t.slug = ${lit(i.slug)} and s.slug = ${lit(from)} and t.image_url is null and t.image_source is null;`);
  i.variations.forEach((v, n) =>
    w(`insert into item_variations (item_id, slug, label, short_label, price_cents, sort_order, is_active, is_default)
  values (${item(i.slug)}, ${lit(v.slug)}, ${lit(v.label)}, ${lit(v.short)}, ${v.price}, ${n * 10}, true, false)
  on conflict (item_id, slug) do update set label = excluded.label, price_cents = excluded.price_cents, sort_order = excluded.sort_order, is_active = true;`));
  w(`update item_variations set is_default = (slug = ${lit(i.variations[0].slug)}), is_active = (slug in (${i.variations.map((v) => lit(v.slug)).join(", ")})) where item_id = ${item(i.slug)};`);
  i.links.forEach((l, n) =>
    w(`insert into menu_item_option_groups (item_id, group_id, is_required, min_select, max_select, sort_order)
  values (${item(i.slug)}, ${group(l.slug)}, ${l.min > 0}, ${l.min}, ${l.max}, ${n * 10})
  on conflict (item_id, group_id) do update set is_required = excluded.is_required, min_select = excluded.min_select, max_select = excluded.max_select, sort_order = excluded.sort_order;`));
  w(`delete from menu_item_option_groups where item_id = ${item(i.slug)}${i.links.length ? ` and group_id not in (${i.links.map((l) => group(l.slug)).join(", ")})` : ""};`);
}
w("");

w("-- Ours that TableVibe does not sell.");
for (const [slug, why] of Object.entries(RETIRE))
  w(`update menu_items set is_active = false, pricing_note = ${lit(`${why} ${CAPTURED}.`)} where slug = ${lit(slug)};`);

w("end");
w("$$;");
fs.writeFileSync(outPath, out.join("\n") + "\n");
console.log(`items ${items.length} (new ${items.filter((i) => i.isNew).map((i) => i.slug).join(", ")})`);
console.log(`groups ${groups.size}: ${[...groups.keys()].join(", ")}`);
