import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over get_pickup_slots(), migration 0012.
 *
 * This is where slot generation is actually proven, because it is the only
 * place it exists. There is no TypeScript copy of this arithmetic and there
 * must not be one: the picker renders what the database returns, and
 * place_order will book against the same grid.
 *
 * Every test injects a clock. Spec section 24 asks for that in as many words,
 * and it is not optional here: a suite that reads now() passes in the morning
 * and fails at closing time, which is exactly the bug this function is for.
 */

type Slot = {
  startsAt: string;
  endsAt: string;
  capacity: number;
  reserved: number;
  remaining: number;
};

type SlotPayload = {
  branch: {
    slug: string;
    name: string;
    shortName: string;
    timezone: string;
    slotMinutes: number;
    prepMinutes: number;
  } | null;
  generatedAt: string;
  horizonHours: number | null;
  slots: Slot[];
  unavailableReason: string | null;
};

async function slots(db: PGlite, at: string, branchSlug?: string): Promise<SlotPayload> {
  const result = await db.query<{ payload: SlotPayload }>(
    "select get_pickup_slots($1, $2::timestamptz) as payload",
    [branchSlug ?? null, at],
  );
  return result.rows[0].payload;
}

/** Local wall-clock time at the branch, which is how the windows read. */
function manilaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function manilaDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
}

/**
 * A branch that is open, with hours, which is a state the seed deliberately
 * never produces. Every one of the nine ships is_active = false and
 * store_hours ships empty, because the pilot branch and its weekday hours are
 * open questions 1 and 2 in spec section 28. So the tests build the answer
 * they need rather than the migrations pretending to know it.
 */
async function openBranch(
  db: PGlite,
  {
    opensAt = "10:00",
    closesAt = "22:00",
    weekdays = [0, 1, 2, 3, 4, 5, 6],
    slotMinutes = 15,
    capacity = 6,
    prepMinutes = 20,
  } = {},
): Promise<string> {
  const branchId = await scalar<string>(
    db,
    `insert into branches (
       slug, name, short_name, format, price_list_id, address_line, city,
       is_active, is_accepting_orders,
       pickup_slot_minutes, pickup_slot_capacity, prep_minutes_default
     )
     select 'pilot', 'Pilot Branch', 'Pilot', 'street', pl.id, '1 Test Street', 'Cebu City',
            true, true, ${slotMinutes}, ${capacity}, ${prepMinutes}
     from price_lists pl
     order by pl.slug
     limit 1
     returning id`,
  );

  for (const weekday of weekdays) {
    await db.query(
      `insert into store_hours (branch_id, weekday, opens_at, closes_at)
       values ($1, $2, $3::time, $4::time)`,
      [branchId, weekday, opensAt, closesAt],
    );
  }

  return branchId;
}

describe("get_pickup_slots, with nothing answered yet", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
  });

  it("offers no windows and says the reason is that no branch is live", async () => {
    // The real state of this project today: nine branches, none active.
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots).toEqual([]);
    expect(payload.unavailableReason).toBe("no_branch");
    expect(payload.branch).toBeNull();
  });

  it("does not invent a branch when one is named but inactive", async () => {
    const payload = await slots(db, "2026-08-06T12:00:00+08:00", "mango-avenue");
    expect(payload.unavailableReason).toBe("no_branch");
  });
});

describe("get_pickup_slots, once a branch is live", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
  });

  it("still offers nothing while the branch has no hours", async () => {
    const bare = await freshDatabase({ seed: true });
    await bare.query(
      `insert into branches (slug, name, short_name, format, price_list_id,
                             address_line, city, is_active, is_accepting_orders)
       select 'hours-less', 'No Hours', 'None', 'street', pl.id, '2 Test Street',
              'Cebu City', true, true
       from price_lists pl order by pl.slug limit 1`,
    );
    const payload = await slots(bare, "2026-08-06T12:00:00+08:00");
    expect(payload.slots).toEqual([]);
    expect(payload.unavailableReason).toBe("no_hours");
    // It can still name the branch, which is what lets the screen say which
    // shop it is waiting on.
    expect(payload.branch?.slug).toBe("hours-less");
  });

  it("generates a window every pickup_slot_minutes", async () => {
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.unavailableReason).toBeNull();
    expect(payload.slots.length).toBeGreaterThan(1);

    const starts = payload.slots.map((slot) => manilaTime(slot.startsAt));
    expect(starts.slice(0, 4)).toEqual(["12:30", "12:45", "13:00", "13:15"]);
  });

  it("starts a full prep time from now, not now", async () => {
    // 12:00 plus twenty minutes of prep is 12:20, and the next window on the
    // grid is 12:30. Nobody may collect food that is not cooked yet.
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(manilaTime(payload.slots[0].startsAt)).toBe("12:30");
  });

  it("anchors the grid to the branch's midnight, not to the moment of asking", async () => {
    // The same shop asked at two odd moments has to produce identical
    // boundaries, or two customers book two rows for one window and the
    // capacity check never binds.
    const first = await slots(db, "2026-08-06T12:04:37+08:00");
    const second = await slots(db, "2026-08-06T12:09:02+08:00");
    expect(manilaTime(first.slots[0].startsAt)).toBe("12:30");
    expect(manilaTime(second.slots[0].startsAt)).toBe("12:30");
    expect(first.slots[0].startsAt).toBe(second.slots[0].startsAt);
  });

  it("stops at the horizon", async () => {
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.horizonHours).toBe(8);
    const last = payload.slots[payload.slots.length - 1];
    // 12:00 plus eight hours is 20:00, and a window must end by then.
    expect(manilaTime(last.endsAt) <= "20:00").toBe(true);
  });

  it("never offers a window the shop is shut for", async () => {
    // 21:00, closing at 22:00. The last window a customer may pick is the one
    // ending exactly at close.
    const payload = await slots(db, "2026-08-06T21:00:00+08:00");
    const last = payload.slots[payload.slots.length - 1];
    expect(manilaTime(last.endsAt)).toBe("22:00");
    expect(manilaTime(last.startsAt)).toBe("21:45");
  });

  it("offers nothing at all once the shop is shut, and says so", async () => {
    // 23:00 on a 10:00 to 22:00 day. The horizon runs to 07:00, which is
    // before opening.
    const payload = await slots(db, "2026-08-06T23:00:00+08:00");
    expect(payload.slots).toEqual([]);
    expect(payload.unavailableReason).toBe("closed_now");
    expect(payload.branch?.slug).toBe("pilot");
  });

  it("reads capacity from the branch until a window has been booked", async () => {
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots[0].capacity).toBe(6);
    expect(payload.slots[0].reserved).toBe(0);
    expect(payload.slots[0].remaining).toBe(6);
  });
});

describe("get_pickup_slots and capacity", () => {
  let db: PGlite;
  let branchId: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    branchId = await openBranch(db);
  });

  it("counts what is already reserved against a window", async () => {
    const start = (await slots(db, "2026-08-06T12:00:00+08:00")).slots[0].startsAt;
    await db.query(
      `insert into pickup_slots (branch_id, slot_start, capacity, reserved)
       values ($1, $2::timestamptz, 6, 4)`,
      [branchId, start],
    );

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots[0]).toMatchObject({ capacity: 6, reserved: 4, remaining: 2 });
  });

  it("keeps a booked window's own capacity when the branch default rises", async () => {
    // The comment on pickup_slots says capacity is copied at creation so that
    // raising the branch default cannot retroactively oversell a window the
    // kitchen already planned around. This is that claim.
    await db.query("update branches set pickup_slot_capacity = 20 where id = $1", [branchId]);

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots[0].capacity).toBe(6);
    expect(payload.slots[0].remaining).toBe(2);
    // A window nobody has booked takes the new default.
    expect(payload.slots[1].capacity).toBe(20);
  });

  it("reports a full window as remaining zero rather than hiding it", async () => {
    // A window that vanishes reads as a bug. Spec section 10 N1 wants it shown
    // and disabled: "Fully booked, try 7:15pm".
    const second = (await slots(db, "2026-08-06T12:00:00+08:00")).slots[1];
    await db.query(
      `insert into pickup_slots (branch_id, slot_start, capacity, reserved)
       values ($1, $2::timestamptz, 20, 20)`,
      [branchId, second.startsAt],
    );

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots[1].remaining).toBe(0);
    expect(payload.slots.map((slot) => slot.startsAt)).toContain(second.startsAt);
  });

  it("says fully_booked only when nothing in the horizon has room", async () => {
    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.unavailableReason).toBeNull();

    const everything = await freshDatabase({ seed: true });
    const smallId = await openBranch(everything, {
      opensAt: "12:00",
      closesAt: "13:00",
      capacity: 1,
    });
    // 12:00 to 13:00 with twenty minutes prep leaves 12:30 and 12:45.
    for (const slot of (await slots(everything, "2026-08-06T12:00:00+08:00")).slots) {
      await everything.query(
        `insert into pickup_slots (branch_id, slot_start, capacity, reserved)
         values ($1, $2::timestamptz, 1, 1)`,
        [smallId, slot.startsAt],
      );
    }

    const booked = await slots(everything, "2026-08-06T12:00:00+08:00");
    expect(booked.slots.length).toBeGreaterThan(0);
    expect(booked.unavailableReason).toBe("fully_booked");
  });
});

describe("get_pickup_slots and the switches that close a shop", () => {
  it("offers nothing when the branch stops accepting orders", async () => {
    const db = await freshDatabase({ seed: true });
    const branchId = await openBranch(db);
    await db.query("update branches set is_accepting_orders = false where id = $1", [branchId]);

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.slots).toEqual([]);
    expect(payload.unavailableReason).toBe("not_accepting");
  });

  it("offers nothing when the global switch is off", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    await db.query("update app_settings set accepting_orders = false where id = 1");

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.unavailableReason).toBe("not_accepting");
  });

  it("follows the horizon the owner sets", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    await db.query("update app_settings set slot_horizon_hours = 2 where id = 1");

    const payload = await slots(db, "2026-08-06T12:00:00+08:00");
    expect(payload.horizonHours).toBe(2);
    const last = payload.slots[payload.slots.length - 1];
    expect(manilaTime(last.endsAt) <= "14:00").toBe(true);
  });
});

describe("get_pickup_slots across a midnight shift", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    // A Friday 18:00 to 02:00 shift, which is the case branch_is_open_at was
    // written for and the one a second implementation of the grid would get
    // wrong.
    await openBranch(db, { opensAt: "18:00", closesAt: "02:00" });
  });

  it("carries windows past midnight into the following day", async () => {
    const payload = await slots(db, "2026-08-06T23:00:00+08:00");
    const days = new Set(payload.slots.map((slot) => manilaDate(slot.startsAt)));
    expect(days.has("2026-08-06")).toBe(true);
    expect(days.has("2026-08-07")).toBe(true);
  });

  it("ends the last window exactly at closing", async () => {
    const payload = await slots(db, "2026-08-06T23:00:00+08:00");
    const last = payload.slots[payload.slots.length - 1];
    expect(manilaTime(last.endsAt)).toBe("02:00");
  });

  it("keeps the grid on the boundary either side of midnight", async () => {
    const payload = await slots(db, "2026-08-06T23:00:00+08:00");
    const times = payload.slots.map((slot) => manilaTime(slot.startsAt));
    expect(times).toContain("23:45");
    expect(times).toContain("00:00");
    expect(times).toContain("00:15");
  });
});

describe("the pickup slot reader is locked down", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await freshDatabase();
  });

  it("is not callable by PUBLIC", async () => {
    // Postgres grants EXECUTE to PUBLIC by default, and this one is SECURITY
    // DEFINER. Trap 7 in the handoff, and the reason 0012 carries its own
    // revoke rather than leaning on 0010.
    const granted = await scalar<boolean>(
      db,
      `select has_function_privilege('public', 'get_pickup_slots(text, timestamptz)', 'execute')`,
    );
    expect(granted).toBe(false);
  });

  it("is callable by anon and authenticated", async () => {
    for (const role of ["anon", "authenticated"]) {
      const granted = await scalar<boolean>(
        db,
        `select has_function_privilege('${role}', 'get_pickup_slots(text, timestamptz)', 'execute')`,
      );
      expect(granted).toBe(true);
    }
  });

  it("keeps the branch resolver server-side", async () => {
    for (const role of ["public", "anon", "authenticated"]) {
      const granted = await scalar<boolean>(
        db,
        `select has_function_privilege('${role}', 'resolve_pickup_branch_id(text)', 'execute')`,
      );
      expect(granted).toBe(false);
    }
  });
});
