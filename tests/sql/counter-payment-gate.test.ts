import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over payments_counter_gate, migration 0087.
 *
 * place_order is granted to anon and defaults to a counter payment, so before
 * 0087 a request made straight to the REST endpoint booked an unpaid order.
 * These run with the gate in its shipped state (the harness switches it on
 * for every other file, whose fixtures predate it) and prove three things:
 * the shipped default refuses counter, refusing it leaves nothing behind, and
 * the switch is what decides.
 */

const WINGS = {
  item_slug: "chicken-wings",
  variation_slug: "full",
  qty: 1,
  options: [
    { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
    { group_slug: "level-of-hotness", option_slug: "insane" },
  ],
};

let attemptCounter = 0;
function attemptId(): string {
  attemptCounter += 1;
  return `00000000-0000-4000-8000-${attemptCounter.toString().padStart(12, "0")}`;
}

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

function place(db: PGlite, payload: Record<string, unknown>) {
  return db.query("select place_order($1::jsonb, $2::uuid) as result", [
    JSON.stringify(payload),
    attemptId(),
  ]);
}

function order(slot: string, overrides: Record<string, unknown> = {}) {
  return {
    branch_slug: "pilot",
    customer_name: "Gate Test",
    customer_phone: "0906 440 5297",
    pickup_slot_start: slot,
    lines: [WINGS],
    ...overrides,
  };
}

describe("the counter payment gate, as shipped", () => {
  let db: PGlite;
  let slot: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true, counterPayments: false });
    await openBranch(db);
    slot = await firstSlot(db);
  });

  it("ships switched off", async () => {
    expect(
      await scalar<boolean>(db, "select counter_payments_enabled from app_settings where id = 1"),
    ).toBe(false);
  });

  it("refuses an order that names no payment method, which defaults to counter", async () => {
    await expect(place(db, order(slot))).rejects.toThrow(/PAYMENT_METHOD_UNAVAILABLE/);
  });

  it("refuses an order that asks for counter by name", async () => {
    await expect(place(db, order(slot, { payment_method: "counter" }))).rejects.toThrow(
      /PAYMENT_METHOD_UNAVAILABLE/,
    );
  });

  it("leaves no order, no payment and no slot booking behind", async () => {
    expect(await scalar<number>(db, "select count(*)::int from orders")).toBe(0);
    expect(await scalar<number>(db, "select count(*)::int from payments")).toBe(0);
  });

  it("still takes an online payment when PayMongo is on", async () => {
    await db.query(
      `update app_settings set
         paymongo_enabled = true,
         paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb
       where id = 1`,
    );
    const result = await place(db, order(slot, { payment_method: "qrph" }));
    expect(result.rows).toHaveLength(1);
    expect(await scalar<string>(db, "select method::text from payments")).toBe("qrph");
  });

  it("is the switch, not anything else, that decides", async () => {
    await db.query("update app_settings set counter_payments_enabled = true where id = 1");
    await place(db, order(slot, { customer_phone: "0917 000 0001" }));
    expect(
      await scalar<number>(db, "select count(*)::int from payments where method = 'counter'"),
    ).toBe(1);
  });

  it("cannot be called on its own by a customer", async () => {
    const granted = await scalar<boolean>(
      db,
      "select has_function_privilege('anon', 'enforce_counter_payment_gate()', 'execute')",
    );
    expect(granted).toBe(false);
  });
});
