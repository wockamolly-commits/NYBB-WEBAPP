import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over get_orderable_branches(), migration 0049.
 *
 * WHY THIS FILE EXISTS AT ALL. The storefront has one live counter, so the
 * only shape of answer this function has ever returned in anger is a list of
 * one. Every interesting case it has to survive, two counters open, one shut
 * for the night, one with its accepting-orders switch off, the global intake
 * switch off, is a case the real database cannot be asked to demonstrate
 * without making a second shop orderable on a live site. PGlite can, in a
 * throwaway database, which is the whole reason the SQL suite exists.
 *
 * Every test injects a clock, for the reason `pickup-slots.test.ts` states: a
 * suite that reads now() passes in the morning and fails at closing time, and
 * "is this shop open" is exactly the question that breaks that way.
 */

type OrderableBranch = {
  slug: string;
  name: string;
  shortName: string;
  format: string;
  addressLine: string;
  city: string;
  phones: string[];
  timezone: string;
  slotMinutes: number;
  prepMinutes: number;
  acceptsOrdersNow: boolean;
  isOpenNow: boolean;
};

async function orderable(db: PGlite, at: string): Promise<OrderableBranch[]> {
  const result = await db.query<{ payload: OrderableBranch[] }>(
    "select get_orderable_branches($1::timestamptz) as payload",
    [at],
  );
  return result.rows[0].payload;
}

/**
 * A counter that exists, with hours.
 *
 * The seed ships all nine `is_active = false` and `store_hours` empty, because
 * the pilot branch and its hours are open questions only the owner can close.
 * So each test builds the state it needs rather than the migrations pretending
 * to know it.
 */
async function makeBranch(
  db: PGlite,
  slug: string,
  {
    active = true,
    accepting = true,
    opensAt = "10:00",
    closesAt = "22:00",
    sortOrder = 0,
    prepMinutes = 20,
  } = {},
): Promise<string> {
  // Interpolated rather than bound, because `scalar` takes no parameters and
  // every value here is a literal this file chose. `openBranch` in
  // pickup-slots.test.ts writes its inserts the same way.
  const branchId = await scalar<string>(
    db,
    `insert into branches (
       slug, name, short_name, format, price_list_id, address_line, city, phones,
       is_active, is_accepting_orders, pickup_slot_minutes, pickup_slot_capacity,
       prep_minutes_default, sort_order
     )
     select '${slug}', 'NYBB ${slug}', '${slug}', 'street', pl.id, '1 Test Street', 'Cebu City',
            array['0917-000-0000']::text[],
            ${active}, ${accepting}, 15, 6, ${prepMinutes}, ${sortOrder}
     from price_lists pl
     order by pl.slug
     limit 1
     returning id`,
  );

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await db.query(
      `insert into store_hours (branch_id, weekday, opens_at, closes_at)
       values ($1, $2, $3::time, $4::time)`,
      [branchId, weekday, opensAt, closesAt],
    );
  }

  return branchId;
}

describe("get_orderable_branches, with nothing live", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
  });

  // The real state of the seed: nine counters, none active. An empty array and
  // not null, because the storefront merges this with the published catalog
  // and a null would make every card render as an error rather than as a shop
  // with a phone number.
  it("returns an empty list rather than null", async () => {
    expect(await orderable(db, "2026-08-19T12:00:00+08:00")).toEqual([]);
  });
});

describe("get_orderable_branches, once counters are live", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await makeBranch(db, "pilot", { sortOrder: 1 });
    await makeBranch(db, "second", { sortOrder: 0 });
    // Live, open, but the owner has stopped taking orders here.
    await makeBranch(db, "paused", { accepting: false, sortOrder: 2 });
    // A real shop the platform has not been switched on for. Eight of the nine
    // are in this state today, and this is the one that must NOT appear.
    await makeBranch(db, "offline", { active: false, sortOrder: 3 });
  });

  it("returns only the active counters, in sort order", async () => {
    const rows = await orderable(db, "2026-08-19T12:00:00+08:00");
    expect(rows.map((row) => row.slug)).toEqual(["second", "pilot", "paused"]);
  });

  it("carries every column a store card has to draw", async () => {
    const [first] = await orderable(db, "2026-08-19T12:00:00+08:00");
    expect(first).toMatchObject({
      slug: "second",
      shortName: "second",
      format: "street",
      addressLine: "1 Test Street",
      city: "Cebu City",
      phones: ["0917-000-0000"],
      timezone: "Asia/Manila",
      slotMinutes: 15,
      prepMinutes: 20,
    });
  });

  // The distinction the whole picker is built on. A counter with its switch
  // off is open and not selling; a counter outside its hours is selling again
  // later. Collapsing them tells somebody a shop is shut when it is taking
  // orders for the evening.
  it("separates a paused counter from an open one", async () => {
    const rows = await orderable(db, "2026-08-19T12:00:00+08:00");
    const by = Object.fromEntries(rows.map((row) => [row.slug, row]));

    expect(by.pilot).toMatchObject({ acceptsOrdersNow: true, isOpenNow: true });
    expect(by.paused).toMatchObject({ acceptsOrdersNow: false, isOpenNow: true });
  });

  // Outside opening hours. branch_accepts_orders includes branch_is_open_at,
  // so both go false, and that pair is what the storefront reads as "come back
  // later" rather than as "this counter is not selling".
  it("reports a counter outside its hours as shut, not as switched off", async () => {
    const rows = await orderable(db, "2026-08-19T03:00:00+08:00");
    const by = Object.fromEntries(rows.map((row) => [row.slug, row]));

    expect(by.pilot).toMatchObject({ acceptsOrdersNow: false, isOpenNow: false });
  });

  // The platform-wide intake switch. When the owner closes ordering entirely,
  // every counter has to say so, including the ones standing open.
  it("reports every counter as not accepting when intake is off globally", async () => {
    await db.query("update app_settings set accepting_orders = false where id = 1");
    const rows = await orderable(db, "2026-08-19T12:00:00+08:00");

    expect(rows.every((row) => !row.acceptsOrdersNow)).toBe(true);
    // Still open, though. The shops have not closed, the platform has.
    expect(rows.filter((row) => row.slug !== "paused").every((row) => row.isOpenNow)).toBe(true);

    await db.query("update app_settings set accepting_orders = true where id = 1");
  });
});

describe("what get_orderable_branches refuses to expose", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await makeBranch(db, "pilot");
  });

  // The reason this function exists rather than a grant on the table. Capacity
  // and reservation counts are operational figures, and widening the anon
  // surface is supposed to cost exactly what was asked for and nothing else.
  it("returns no capacity or reservation figures", async () => {
    const [first] = await orderable(db, "2026-08-19T12:00:00+08:00");
    const keys = Object.keys(first).sort();

    expect(keys).toEqual([
      "acceptsOrdersNow",
      "addressLine",
      "city",
      "format",
      "isOpenNow",
      "name",
      "phones",
      "prepMinutes",
      "shortName",
      "slotMinutes",
      "slug",
      "timezone",
    ]);
  });
});
