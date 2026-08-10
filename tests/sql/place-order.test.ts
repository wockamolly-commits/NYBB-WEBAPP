import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";
import { resolveCart } from "@/lib/cart/lines";
import { staticMenu } from "@/lib/menu/static";
import type { Cart } from "@/lib/cart/types";

/**
 * Tests over place_order(), migration 0013.
 *
 * This is the only place an order comes into existence and the only place any
 * peso is decided, so this file has to prove three separate things:
 *
 *   1. the arithmetic is right, and agrees with lib/menu/line-pricing.ts
 *   2. a forged payload cannot buy anything the menu is not selling
 *   3. the pickup window is genuinely reserved, not merely counted
 *
 * No clock is injected and none is needed. The branch these tests open is open
 * every hour of every day, and every test asks get_pickup_slots() which window
 * to book rather than naming one, so nothing here reads differently at ten in
 * the morning and at midnight. That is a stronger check than a fixed clock
 * would be: it exercises the actual claim, which is that place_order books
 * against the same grid the picker draws.
 */

type Placed = {
  orderId: string;
  shortCode: string;
  trackingToken: string;
  pickupCode: string;
  status: string;
  paymentMethod: string;
  pickupSlotStart: string;
  pickupSlotEnd: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  branch: { slug: string; name: string; shortName: string; timezone: string };
};

type PayloadLine = {
  item_slug: string;
  variation_slug: string;
  qty: number;
  options?: { group_slug: string; option_slug: string }[];
  notes?: string;
};

/**
 * A branch that is live, accepting, and open around the clock.
 *
 * The seed deliberately produces none of this: all nine branches ship
 * is_active = false and store_hours ships empty, because the pilot branch and
 * its real weekday hours are open questions 1 and 2 in spec section 28. So the
 * tests build the answer they need and the migrations never pretend to know
 * it. The all-day window is what makes this file time independent.
 */
async function openBranch(
  db: PGlite,
  { capacity = 20, slotMinutes = 15, prepMinutes = 20 } = {},
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

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    await db.query(
      `insert into store_hours (branch_id, weekday, opens_at, closes_at)
       values ($1, $2, '00:00'::time, '23:59:59'::time)`,
      [branchId, weekday],
    );
  }

  return branchId;
}

/** Whatever the picker would put first on screen right now. */
async function firstSlot(db: PGlite): Promise<string> {
  const result = await db.query<{ payload: { slots: { startsAt: string }[] } }>(
    "select get_pickup_slots('pilot') as payload",
  );
  const slots = result.rows[0].payload.slots;
  expect(slots.length).toBeGreaterThan(0);
  return slots[0].startsAt;
}

let attemptCounter = 0;
/** A fresh checkout attempt id, since reusing one is the whole point of it. */
function attemptId(): string {
  attemptCounter += 1;
  return `00000000-0000-4000-8000-${attemptCounter.toString().padStart(12, "0")}`;
}

const WINGS: PayloadLine = {
  item_slug: "chicken-wings",
  variation_slug: "full",
  qty: 2,
  options: [
    { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
    { group_slug: "level-of-hotness", option_slug: "insane" },
  ],
};

async function place(
  db: PGlite,
  payload: Record<string, unknown>,
  attempt = attemptId(),
): Promise<Placed> {
  const result = await db.query<{ result: Placed }>(
    "select place_order($1::jsonb, $2::uuid) as result",
    [JSON.stringify(payload), attempt],
  );
  return result.rows[0].result;
}

function order(
  lines: PayloadLine[],
  slotStart: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    branch_slug: "pilot",
    customer_name: "Steven Cruz",
    customer_phone: "0906 440 5297",
    pickup_slot_start: slotStart,
    lines,
    ...overrides,
  };
}

describe("place_order, with nothing answered yet", () => {
  it("refuses rather than inventing a branch to sell from", async () => {
    // The real state of this project today, and the state that matters: nine
    // branches, none active. An order cannot be placed against a shop nobody
    // has chosen, and the failure has to be loud.
    const db = await freshDatabase({ seed: true });
    await expect(
      place(db, {
        customer_name: "Steven Cruz",
        customer_phone: "09064405297",
        pickup_slot_start: "2026-08-06T12:00:00+08:00",
        lines: [WINGS],
      }),
    ).rejects.toThrow(/NO_BRANCH/);
  });
});

describe("place_order, the money", () => {
  let db: PGlite;
  let slot: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    slot = await firstSlot(db);
  });

  it("prices a line from the price list, not from anything the client sent", async () => {
    const placed = await place(db, order([WINGS], slot));

    // Full wings 529.00, Classic Buffalo free, Insane on a FULL order 60.00.
    // Twice. The Insane figure is the point: on a HALF order it is 40.00, and
    // an option price that depends on the chosen size is exactly what
    // menu_option_variation_prices exists for.
    expect(placed.subtotalCents).toBe((52900 + 6000) * 2);
    expect(placed.totalCents).toBe(placed.subtotalCents);
    expect(placed.discountCents).toBe(0);

    const stored = await db.query<{
      subtotal_cents: number;
      total_cents: number;
      unit_price_cents: number;
      line_total_cents: number;
    }>(
      `select o.subtotal_cents, o.total_cents, oi.unit_price_cents, oi.line_total_cents
       from orders o join order_items oi on oi.order_id = o.id
       where o.id = $1`,
      [placed.orderId],
    );
    expect(stored.rows[0].unit_price_cents).toBe(58900);
    expect(stored.rows[0].line_total_cents).toBe(117800);
    expect(stored.rows[0].subtotal_cents).toBe(117800);
    expect(Number(stored.rows[0].total_cents)).toBe(117800);
  });

  it("charges the HALF price for the same heat level on a HALF order", async () => {
    const placed = await place(
      db,
      order([{ ...WINGS, variation_slug: "half", qty: 1 }], slot),
    );
    expect(placed.subtotalCents).toBe(32900 + 4000);
  });

  it("stores what each option added, rather than leaving it to be recomputed", async () => {
    const placed = await place(db, order([{ ...WINGS, qty: 1 }], slot));
    const options = await db.query<{
      group_name_snapshot: string;
      name_snapshot: string;
      price_cents: number;
      heat_percent_snapshot: number | null;
    }>(
      `select o.group_name_snapshot, o.name_snapshot, o.price_cents,
              o.heat_percent_snapshot
       from order_item_options o
       join order_items oi on oi.id = o.order_item_id
       where oi.order_id = $1
       order by o.price_cents`,
      [placed.orderId],
    );

    expect(options.rows).toHaveLength(2);
    expect(options.rows[0]).toMatchObject({
      group_name_snapshot: "Flavour",
      name_snapshot: "Classic Buffalo",
      price_cents: 0,
      heat_percent_snapshot: null,
    });
    // The heat level travels onto the ticket as a percentage, so the kitchen
    // reads it without a lookup.
    expect(options.rows[1]).toMatchObject({
      group_name_snapshot: "Level of Hotness",
      name_snapshot: "Insane",
      price_cents: 6000,
      heat_percent_snapshot: 100,
    });
  });

  it("agrees with lib/menu/line-pricing.ts, line for line", async () => {
    // The claim in that file's own comment is that it is the display side of
    // this arithmetic. This is where that claim is checked rather than
    // asserted: the same cart, priced by the TypeScript the cart screen runs
    // and by the SQL the transaction runs, has to come to the same peso.
    const cart: Cart = {
      lines: [
        {
          itemSlug: "chicken-wings",
          variationSlug: "full",
          optionSlugs: {
            "wing-flavour": ["classic-buffalo"],
            "level-of-hotness": ["insane"],
          },
          quantity: 2,
          unitPriceCents: 0,
        },
        {
          itemSlug: "chicken-wings",
          variationSlug: "half",
          optionSlugs: {
            "wing-flavour": ["honey-mustard"],
            "level-of-hotness": ["lite"],
          },
          quantity: 3,
          unitPriceCents: 0,
        },
        {
          itemSlug: "ribs-original",
          variationSlug: "regular",
          optionSlugs: {},
          quantity: 1,
          unitPriceCents: 0,
        },
      ],
    };

    const resolved = resolveCart(staticMenu(), cart);
    expect(resolved.dropped).toEqual([]);

    const placed = await place(
      db,
      order(
        resolved.lines.map((line) => ({
          item_slug: line.line.itemSlug,
          variation_slug: line.line.variationSlug,
          qty: line.line.quantity,
          options: Object.entries(line.line.optionSlugs).flatMap(([group, slugs]) =>
            slugs.map((slug) => ({ group_slug: group, option_slug: slug })),
          ),
        })),
        slot,
      ),
    );

    expect(placed.subtotalCents).toBe(resolved.subtotalCents);
  });
});

describe("place_order, what it will not sell", () => {
  let db: PGlite;
  let slot: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    slot = await firstSlot(db);
  });

  it("refuses an item the menu is hiding", async () => {
    await db.exec("update menu_items set is_active = false where slug = 'ribs-spicy'");
    await expect(
      place(db, order([{ item_slug: "ribs-spicy", variation_slug: "regular", qty: 1 }], slot)),
    ).rejects.toThrow(/ITEM_UNAVAILABLE/);
  });

  it("refuses an item whose whole category has been taken off the board", async () => {
    // get_storefront_menu filters on the category too, so this function has to.
    // A filter it is missing sells something the menu is hiding.
    await db.exec("update menu_categories set is_active = false where slug = 'ribs'");
    await expect(
      place(db, order([{ item_slug: "ribs-original", variation_slug: "regular", qty: 1 }], slot)),
    ).rejects.toThrow(/ITEM_UNAVAILABLE/);
    await db.exec("update menu_categories set is_active = true where slug = 'ribs'");
  });

  it("refuses a size that item does not come in", async () => {
    await expect(
      place(db, order([{ ...WINGS, variation_slug: "regular" }], slot)),
    ).rejects.toThrow(/VARIATION_UNAVAILABLE/);
  });

  it("refuses an option group that is not offered on that item", async () => {
    // Heat on the ribs. Both halves exist, the pairing does not, and without
    // the join through menu_item_option_groups this would have been sold.
    await expect(
      place(
        db,
        order(
          [
            {
              item_slug: "ribs-original",
              variation_slug: "regular",
              qty: 1,
              options: [{ group_slug: "level-of-hotness", option_slug: "insane" }],
            },
          ],
          slot,
        ),
      ),
    ).rejects.toThrow(/OPTION_UNAVAILABLE/);
  });

  it("refuses wings with no flavour chosen", async () => {
    await expect(
      place(db, order([{ ...WINGS, options: [] }], slot)),
    ).rejects.toThrow(/OPTION_COUNT/);
  });

  it("refuses two flavours on a group that allows one", async () => {
    await expect(
      place(
        db,
        order(
          [
            {
              ...WINGS,
              options: [
                { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
                { group_slug: "wing-flavour", option_slug: "cheezy" },
              ],
            },
          ],
          slot,
        ),
      ),
    ).rejects.toThrow(/OPTION_COUNT/);
  });

  it("refuses the same option twice, which would charge for it twice", async () => {
    await expect(
      place(
        db,
        order(
          [
            {
              ...WINGS,
              options: [
                { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
                { group_slug: "level-of-hotness", option_slug: "insane" },
                { group_slug: "level-of-hotness", option_slug: "insane" },
              ],
            },
          ],
          slot,
        ),
      ),
    ).rejects.toThrow(/DUPLICATE_OPTION/);
  });

  it("refuses a quantity above what the cart screen would ever produce", async () => {
    // MAX_QUANTITY in lib/menu/line-pricing.ts is 20. order_items allows 50,
    // which is a different bound for a different job.
    await expect(place(db, order([{ ...WINGS, qty: 21 }], slot))).rejects.toThrow(/INVALID_QTY/);
    await expect(place(db, order([{ ...WINGS, qty: 0 }], slot))).rejects.toThrow(/INVALID_QTY/);
  });

  it("refuses an empty cart", async () => {
    await expect(place(db, order([], slot))).rejects.toThrow(/EMPTY_CART/);
  });

  it("refuses an order with no name or no usable phone number", async () => {
    await expect(
      place(db, order([WINGS], slot, { customer_name: "   " })),
    ).rejects.toThrow(/MISSING_NAME/);
    await expect(
      place(db, order([WINGS], slot, { customer_phone: "" })),
    ).rejects.toThrow(/MISSING_PHONE/);
    await expect(
      place(db, order([WINGS], slot, { customer_phone: "123" })),
    ).rejects.toThrow(/INVALID_PHONE/);
  });

  it("refuses a payment method the business has not switched on", async () => {
    await expect(
      place(db, order([WINGS], slot, { payment_method: "gcash" })),
    ).rejects.toThrow(/PAYMENT_METHOD_UNAVAILABLE/);
  });

  it("refuses a voucher code rather than quietly charging full price for it", async () => {
    await expect(
      place(db, order([WINGS], slot, { voucher_code: "LAUNCH50" })),
    ).rejects.toThrow(/VOUCHERS_DISABLED/);
  });
});

describe("place_order, the shop being shut", () => {
  it("refuses while the master switch is off", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    await db.exec("update app_settings set accepting_orders = false where id = 1");

    await expect(place(db, order([WINGS], slot))).rejects.toThrow(/NOT_ACCEPTING/);
  });

  it("refuses while the branch itself has paused ordering", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    await db.exec("update branches set is_accepting_orders = false where slug = 'pilot'");

    await expect(place(db, order([WINGS], slot))).rejects.toThrow(/NOT_ACCEPTING/);
  });

  it("refuses outside opening hours, and says so differently", async () => {
    // A shut shop and a paused one are not the same message to a customer:
    // one of them reopens at a time you can print on the screen.
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    await db.exec("update store_hours set is_closed = true, opens_at = null, closes_at = null");

    await expect(place(db, order([WINGS], slot))).rejects.toThrow(/STORE_CLOSED/);
  });
});

describe("place_order, the pickup window", () => {
  it("books the window in the same transaction as the order", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);

    const placed = await place(db, order([WINGS], slot));
    const row = await db.query<{ reserved: number; capacity: number; id: string }>(
      "select id, reserved, capacity from pickup_slots where slot_start = $1::timestamptz",
      [slot],
    );

    expect(row.rows[0].reserved).toBe(1);
    // Copied from the branch at creation, per 0005, so raising the branch
    // default later cannot retroactively oversell a planned window.
    expect(row.rows[0].capacity).toBe(20);

    const linked = await scalar<string>(
      db,
      `select pickup_slot_id from orders where id = '${placed.orderId}'`,
    );
    expect(linked).toBe(row.rows[0].id);
    expect(placed.pickupSlotStart).toBe(slot);

    // Both ends come back, so the confirmation can name the same window the
    // picker named rather than a single time the customer has to interpret.
    const offered = await db.query<{ payload: { slots: { startsAt: string; endsAt: string }[] } }>(
      "select get_pickup_slots('pilot') as payload",
    );
    const window = offered.rows[0].payload.slots.find((one) => one.startsAt === slot);
    expect(placed.pickupSlotEnd).toBe(window?.endsAt);
  });

  it("makes a full window genuinely unbookable, and leaves no half order behind", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db, { capacity: 1 });
    const slot = await firstSlot(db);

    await place(db, order([WINGS], slot));
    await expect(place(db, order([WINGS], slot))).rejects.toThrow(/SLOT_FULL/);

    // The whole point of doing this inside one transaction: the loser gets no
    // order, no items, no payment row, and the window is not oversold.
    expect(await scalar<number>(db, "select count(*)::int from orders")).toBe(1);
    expect(await scalar<number>(db, "select count(*)::int from order_items")).toBe(1);
    expect(await scalar<number>(db, "select count(*)::int from payments")).toBe(1);
    expect(
      await scalar<number>(db, "select reserved from pickup_slots"),
    ).toBe(1);
  });

  it("refuses a minute the picker never offered", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    // Seven minutes past a real boundary. The grid is anchored to the branch's
    // local midnight, so this is not a window and never was one.
    const offGrid = new Date(new Date(slot).getTime() + 7 * 60_000).toISOString();

    await expect(place(db, order([WINGS], offGrid))).rejects.toThrow(/SLOT_UNAVAILABLE/);
    await expect(place(db, order([WINGS], slot, { pickup_slot_start: null }))).rejects.toThrow(
      /MISSING_SLOT/,
    );
  });

  it("refuses a window in the past", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    await expect(
      place(db, order([WINGS], "2020-01-01T12:00:00+08:00")),
    ).rejects.toThrow(/SLOT_UNAVAILABLE/);
  });
});

describe("place_order, idempotency", () => {
  let db: PGlite;
  let slot: string;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    slot = await firstSlot(db);
  });

  it("returns the same order for a replayed attempt instead of placing a second", async () => {
    const attempt = attemptId();
    const first = await place(db, order([WINGS], slot), attempt);
    const second = await place(db, order([WINGS], slot), attempt);

    expect(second).toEqual(first);
    expect(await scalar<number>(db, "select count(*)::int from orders")).toBe(1);
    // And the window was booked once, which is the failure that would actually
    // hurt: a double tap eating two of six places in a fifteen minute window.
    expect(await scalar<number>(db, "select reserved from pickup_slots")).toBe(1);
  });

  it("keeps the tracking token with the result, so a guest order is never lost", async () => {
    const attempt = attemptId();
    const placed = await place(db, order([WINGS], slot), attempt);
    const stored = await db.query<{ result: Placed; order_id: string }>(
      "select result, order_id from checkout_attempts where id = $1",
      [attempt],
    );

    expect(stored.rows[0].order_id).toBe(placed.orderId);
    expect(stored.rows[0].result.trackingToken).toBe(placed.trackingToken);
    expect(placed.trackingToken).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("refuses an attempt id opened by somebody else", async () => {
    const attempt = attemptId();
    await db.query(
      `insert into checkout_attempts (id, actor_kind, actor_id)
       values ($1, 'customer', gen_random_uuid())`,
      [attempt],
    );
    await expect(place(db, order([WINGS], slot), attempt)).rejects.toThrow(
      /CHECKOUT_ATTEMPT_REUSED/,
    );
  });

  it("says an attempt is still in flight rather than starting a second order", async () => {
    const attempt = attemptId();
    await db.query(
      `insert into checkout_attempts (id, actor_kind, actor_id) values ($1, 'guest', null)`,
      [attempt],
    );
    await expect(place(db, order([WINGS], slot), attempt)).rejects.toThrow(
      /CHECKOUT_ATTEMPT_INCOMPLETE/,
    );
  });
});

describe("place_order, the paperwork it leaves behind", () => {
  let db: PGlite;
  let placed: Placed;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    placed = await place(db, order([WINGS], await firstSlot(db), { notes: "Extra napkins" }));
  });

  it("opens the order pending, on the counter rail, with money due in person", async () => {
    const payment = await db.query<{ method: string; provider: string; status: string; amount_cents: number }>(
      "select method, provider, status, amount_cents from payments where order_id = $1",
      [placed.orderId],
    );
    expect(placed.status).toBe("pending");
    expect(placed.paymentMethod).toBe("counter");
    expect(payment.rows[0]).toMatchObject({
      method: "counter",
      provider: "manual",
      // 'due' rather than 'pending': money expected in person, not an online
      // intent waiting on a webhook that expires.
      status: "due",
    });
    expect(Number(payment.rows[0].amount_cents)).toBe(placed.totalCents);
  });

  it("writes the opening status event, so the trail starts at placement", async () => {
    const events = await db.query<{ from_status: string | null; to_status: string }>(
      "select from_status, to_status from order_status_events where order_id = $1",
      [placed.orderId],
    );
    expect(events.rows).toEqual([{ from_status: null, to_status: "pending" }]);
  });

  it("opens the POS row at placement, so every order has an answer", async () => {
    const sync = await db.query<{ adapter: string; state: string }>(
      "select adapter, state from pos_sync where order_id = $1",
      [placed.orderId],
    );
    expect(sync.rows[0]).toEqual({ adapter: "manual_rekey", state: "pending" });
  });

  it("snapshots the names, so a rename cannot rewrite a placed order", async () => {
    await db.exec("update menu_items set name = 'Renamed' where slug = 'chicken-wings'");
    const item = await db.query<{ item_name_snapshot: string; variation_label_snapshot: string }>(
      "select item_name_snapshot, variation_label_snapshot from order_items where order_id = $1",
      [placed.orderId],
    );
    expect(item.rows[0]).toEqual({
      item_name_snapshot: "Chicken Wings",
      variation_label_snapshot: "Full, 10 pieces",
    });
    await db.exec("update menu_items set name = 'Chicken Wings' where slug = 'chicken-wings'");
  });

  it("pins the price list on the order, so repointing a branch cannot rewrite history", async () => {
    const pinned = await scalar<string>(
      db,
      `select price_list_id from orders where id = '${placed.orderId}'`,
    );
    const branch = await scalar<string>(db, "select price_list_id from branches where slug = 'pilot'");
    expect(pinned).toBe(branch);
  });

  it("hands back a quotable short code and a four digit counter code", async () => {
    expect(placed.shortCode).toMatch(/^NY-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
    expect(placed.pickupCode).toMatch(/^[0-9]{4}$/);
  });

  it("keeps the customer's note on the order", async () => {
    const notes = await scalar<string>(
      db,
      `select notes from orders where id = '${placed.orderId}'`,
    );
    expect(notes).toBe("Extra napkins");
  });
});

describe("place_order, rate limiting", () => {
  it("stops one identity placing orders faster than a kitchen could read them", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db, { capacity: 20 });
    const slot = await firstSlot(db);

    // Five land. Note what the limiter therefore counts: orders that commit. A
    // rejected attempt rolls its own increment back along with everything else,
    // which is the behaviour worth having.
    for (let i = 0; i < 5; i += 1) {
      await place(db, order([WINGS], slot));
    }
    await expect(place(db, order([WINGS], slot))).rejects.toThrow(/RATE_LIMITED/);
    expect(await scalar<number>(db, "select count(*)::int from orders")).toBe(5);

    // A different phone number is a different bucket, so one abusive caller
    // cannot take ordering down for everybody.
    await expect(
      place(db, order([WINGS], slot, { customer_phone: "0917 111 2222" })),
    ).resolves.toBeTruthy();
  });
});

describe("place_order, the grant", () => {
  it("stamps the signed-in customer's id on the order", async () => {
    const db = await freshDatabase({ seed: true });
    await openBranch(db);
    const slot = await firstSlot(db);
    const userId = "4f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";

    await db.exec(`
      insert into auth.users (id, email) values ('${userId}', 'customer@example.com');
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select '${userId}'::uuid $$;
    `);

    const result = await place(db, order([WINGS], slot));
    expect(
      await scalar<string>(db, `select user_id::text from orders where id = '${result.orderId}'`),
    ).toBe(userId);
  });

  it("is reachable by a guest and by a signed-in customer", async () => {
    const db = await freshDatabase();
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('${role}', 'place_order(jsonb, uuid)', 'execute')`,
        ),
      ).toBe(true);
    }
  });

  it("does not leave the price resolvers or the limiter exposed alongside it", async () => {
    // 0013 adds a function that anon can call, which is exactly the moment to
    // re-check that the helpers it calls did not come along for the ride.
    const db = await freshDatabase();
    for (const signature of [
      "resolve_option_price_cents(uuid, uuid, uuid)",
      "resolve_pickup_branch_id(text)",
      "rate_limit_hit(text, int, int)",
    ]) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('anon', '${signature}', 'execute')`,
        ),
      ).toBe(false);
    }
  });
});
