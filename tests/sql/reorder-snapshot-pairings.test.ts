import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * The four pairings reorder matches on, pinned against the real functions.
 *
 * Reorder cannot resolve a past order back to the menu by id. The menu tables
 * are staff only under RLS, the storefront reads the menu through
 * get_storefront_menu(), and a guest cannot read order_items at all. So it
 * matches the text snapshots place_order() wrote against the text names
 * get_storefront_menu() returns, and the whole feature rests on those two
 * functions agreeing about four strings:
 *
 *   order_items.item_name_snapshot         to menu item "name"
 *   order_items.variation_label_snapshot   to variation "name"
 *   order_item_options.group_name_snapshot to group     "name"
 *   order_item_options.name_snapshot       to option    "name"
 *
 * Nothing else enforces that. They agree today because somebody checked, and
 * the failure if they stop agreeing is silent: reorder finds no match, reports
 * every line of every past order as unavailable, throws nothing, logs nothing,
 * and every other test in this repository still passes. That is what this file
 * is for.
 *
 * The variation pairing is the one to watch, and the reason this is a test
 * rather than a comment. place_order writes item_variations.label, and
 * get_storefront_menu publishes that same column under the key "name". A
 * rename on either side of that mismatch reads as harmless in review and
 * breaks every reorder in the product.
 *
 * The assertions are on identity, not on shape. Reorder folds case and trims
 * and does nothing more, because a fuzzy match across nine similarly named
 * wing flavours sells somebody the wrong food. So the strings have to be
 * equal, and equal is what is asserted.
 */

type PayloadLine = {
  item_slug: string;
  variation_slug: string;
  qty: number;
  options?: { group_slug: string; option_slug: string }[];
};

type Placed = { orderId: string; shortCode: string };

type MenuItemPayload = {
  slug: string;
  name: string;
  variations: { slug: string; name: string }[];
  optionGroups: { slug: string; name: string; options: { slug: string; name: string }[] }[];
};

type MenuPayload = { slug: string; items: MenuItemPayload[] }[];

/**
 * A branch that is live, accepting and open around the clock.
 *
 * The seed ships all nine branches inactive with no hours, because the pilot
 * branch and its real hours are open owner questions. Building the answer here
 * keeps this file independent of the clock and of those decisions.
 */
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
  const slots = result.rows[0].payload.slots;
  expect(slots.length).toBeGreaterThan(0);
  return slots[0].startsAt;
}

async function place(db: PGlite, lines: PayloadLine[], slotStart: string): Promise<Placed> {
  const result = await db.query<{ result: Placed }>(
    "select place_order($1::jsonb, $2::uuid) as result",
    [
      JSON.stringify({
        branch_slug: "pilot",
        customer_name: "Steven Cruz",
        customer_phone: "0906 440 5297",
        pickup_slot_start: slotStart,
        lines,
      }),
      "00000000-0000-4000-8000-000000000001",
    ],
  );
  return result.rows[0].result;
}

/** The menu exactly as the storefront receives it. */
async function liveMenu(db: PGlite): Promise<MenuPayload> {
  const result = await db.query<{ payload: MenuPayload }>(
    "select get_storefront_menu(null) as payload",
  );
  return result.rows[0].payload;
}

function findItem(menu: MenuPayload, slug: string): MenuItemPayload {
  for (const category of menu) {
    const item = category.items.find((candidate) => candidate.slug === slug);
    if (item) return item;
  }
  throw new Error(slug + " is not in the storefront menu");
}

// An item, a size, and two options across two groups. The seeded item that
// exercises all four pairings at once.
const WINGS: PayloadLine = {
  item_slug: "chicken-wings",
  variation_slug: "full",
  qty: 2,
  options: [
    { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
    { group_slug: "level-of-hotness", option_slug: "insane" },
  ],
};

// One size, no options. Two thirds of the menu looks like this.
const FRIES: PayloadLine = { item_slug: "french-fries", variation_slug: "regular", qty: 1 };

describe("the snapshots place_order writes match the names get_storefront_menu publishes", () => {
  let db: PGlite;
  let menu: MenuPayload;
  let orderId: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    const placed = await place(db, [WINGS, FRIES], slot);
    orderId = placed.orderId;
    menu = await liveMenu(db);
  });

  it("saves the item name the menu shows", async () => {
    const rows = await db.query<{ item_name_snapshot: string }>(
      `select oi.item_name_snapshot
         from order_items oi
         join menu_items mi on mi.id = oi.item_id
        where oi.order_id = $1 and mi.slug = 'chicken-wings'`,
      [orderId],
    );

    expect(rows.rows[0].item_name_snapshot).toBe(findItem(menu, "chicken-wings").name);
  });

  it("saves the variation label the menu publishes as a name", async () => {
    // The pairing most likely to break, because the two sides do not share a
    // column name: place_order writes item_variations.label, and the menu
    // returns that same column under the key "name".
    const rows = await db.query<{ variation_label_snapshot: string }>(
      `select oi.variation_label_snapshot
         from order_items oi
         join menu_items mi on mi.id = oi.item_id
        where oi.order_id = $1 and mi.slug = 'chicken-wings'`,
      [orderId],
    );

    const variation = findItem(menu, "chicken-wings").variations.find(
      (candidate) => candidate.slug === "full",
    );
    expect(variation).toBeDefined();
    expect(rows.rows[0].variation_label_snapshot).toBe(variation?.name);
  });

  it("saves the option group name and the option name the menu shows", async () => {
    const rows = await db.query<{ group_name_snapshot: string; name_snapshot: string }>(
      `select oio.group_name_snapshot, oio.name_snapshot
         from order_item_options oio
         join order_items oi on oi.id = oio.order_item_id
         join menu_options mo on mo.id = oio.option_id
        where oi.order_id = $1 and mo.slug = 'classic-buffalo'`,
      [orderId],
    );

    const item = findItem(menu, "chicken-wings");
    const group = item.optionGroups.find((candidate) => candidate.slug === "wing-flavour");
    const option = group?.options.find((candidate) => candidate.slug === "classic-buffalo");

    expect(group).toBeDefined();
    expect(option).toBeDefined();
    expect(rows.rows[0].group_name_snapshot).toBe(group?.name);
    expect(rows.rows[0].name_snapshot).toBe(option?.name);
  });

  it("matches on an item with no options, which is most of the menu", async () => {
    const rows = await db.query<{
      item_name_snapshot: string;
      variation_label_snapshot: string;
    }>(
      `select oi.item_name_snapshot, oi.variation_label_snapshot
         from order_items oi
         join menu_items mi on mi.id = oi.item_id
        where oi.order_id = $1 and mi.slug = 'french-fries'`,
      [orderId],
    );

    const item = findItem(menu, "french-fries");
    expect(rows.rows[0].item_name_snapshot).toBe(item.name);
    expect(rows.rows[0].variation_label_snapshot).toBe(item.variations[0]?.name);
  });

  it("leaves every saved option row resolvable against the live menu", async () => {
    // The whole-order claim rather than a per-column one. If any snapshot on
    // this order failed to find its live counterpart, reorder would tell a
    // customer their food was unavailable while it was still on sale.
    const rows = await db.query<{
      item_slug: string;
      group_name_snapshot: string;
      name_snapshot: string;
    }>(
      `select mi.slug as item_slug, oio.group_name_snapshot, oio.name_snapshot
         from order_item_options oio
         join order_items oi on oi.id = oio.order_item_id
         join menu_items mi on mi.id = oi.item_id
        where oi.order_id = $1`,
      [orderId],
    );

    expect(rows.rows.length).toBeGreaterThan(0);
    for (const row of rows.rows) {
      const item = findItem(menu, row.item_slug);
      const group = item.optionGroups.find(
        (candidate) => candidate.name === row.group_name_snapshot,
      );
      expect(group, "no live group named " + row.group_name_snapshot).toBeDefined();
      const option = group?.options.find((candidate) => candidate.name === row.name_snapshot);
      expect(option, "no live option named " + row.name_snapshot).toBeDefined();
    }
  });
});
