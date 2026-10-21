import { describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0092: a shut counter offers no windows, says when it opens, and
 * slot lengths must divide a day.
 *
 * The branch below keeps Manila hours of 10:00 to 22:00 every day. Before
 * 0092, at 09:00 it offered windows from 10:00, and place_order refused every
 * one of them with STORE_CLOSED.
 */

type Slots = {
  slots: { startsAt: string }[];
  unavailableReason: string | null;
  opensAt: string | null;
};

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into branches (
      slug, name, short_name, format, price_list_id, address_line, city,
      is_active, is_accepting_orders,
      pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
    )
    select 'mango', 'Branch mango', 'Mango', 'street', pl.id, '1 Test Street', 'Cebu City',
           true, true, 15, 6, 20
    from price_lists pl order by pl.slug limit 1;
    insert into store_hours (branch_id, weekday, opens_at, closes_at)
    select b.id, d, '10:00'::time, '22:00'::time
    from branches b, generate_series(0, 6) d where b.slug = 'mango';
    update app_settings set accepting_orders = true, counter_payments_enabled = true where id = 1;
  `);
  return db;
}

async function slotsAt(db: PGlite, at: string): Promise<Slots> {
  const result = await db.query<{ payload: Slots }>(
    "select get_pickup_slots('mango', $1::timestamptz) as payload",
    [at],
  );
  return result.rows[0].payload;
}

describe("get_pickup_slots while the counter is shut", () => {
  it("offers no windows and names the next opening", async () => {
    const db = await world();
    const payload = await slotsAt(db, "2026-10-21T09:00:00+08:00");
    expect(payload.slots).toEqual([]);
    expect(payload.unavailableReason).toBe("closed_now");
    expect(new Date(payload.opensAt!).toISOString()).toBe("2026-10-21T02:00:00.000Z");
  });

  it("names tomorrow's opening after closing time", async () => {
    const db = await world();
    const payload = await slotsAt(db, "2026-10-21T22:30:00+08:00");
    expect(new Date(payload.opensAt!).toISOString()).toBe("2026-10-22T02:00:00.000Z");
  });

  it("offers windows once it opens, with no opening time", async () => {
    const db = await world();
    const payload = await slotsAt(db, "2026-10-21T10:05:00+08:00");
    expect(payload.slots.length).toBeGreaterThan(0);
    expect(payload.unavailableReason).toBeNull();
    expect(payload.opensAt).toBeNull();
  });

  it("agrees with place_order: what it would refuse, the grid no longer offers", async () => {
    const db = await world();
    expect(
      await scalar<boolean>(db, `select branch_accepts_orders(id, '2026-10-21T09:00:00+08:00') from branches where slug = 'mango'`),
    ).toBe(false);
    expect((await slotsAt(db, "2026-10-21T09:00:00+08:00")).slots).toHaveLength(0);
  });
});

describe("branch_next_open_at", () => {
  it("skips a closed weekday", async () => {
    const db = await world();
    // 2026-10-22 is a Thursday (weekday 4). Shut it, and the next opening after
    // Wednesday night is Friday morning.
    await db.exec(`
      update store_hours set is_closed = true
      where weekday = 4 and branch_id = (select id from branches where slug = 'mango')
    `);
    const opens = await scalar<string>(
      db,
      `select branch_next_open_at(id, '2026-10-21T22:30:00+08:00')::text from branches where slug = 'mango'`,
    );
    expect(new Date(opens).toISOString()).toBe("2026-10-23T02:00:00.000Z");
  });

  it("is null for a branch with no hours", async () => {
    const db = await world();
    await db.exec("delete from store_hours");
    expect(
      await scalar<string | null>(db, `select branch_next_open_at(id)::text from branches where slug = 'mango'`),
    ).toBeNull();
  });
});

describe("slot lengths", () => {
  it("refuses one that does not divide a day", async () => {
    const db = await world();
    await expect(
      db.exec("update branches set pickup_slot_minutes = 25 where slug = 'mango'"),
    ).rejects.toThrow(/branches_slot_minutes_divide_day/);
    await db.exec("update branches set pickup_slot_minutes = 20 where slug = 'mango'");
  });
});
