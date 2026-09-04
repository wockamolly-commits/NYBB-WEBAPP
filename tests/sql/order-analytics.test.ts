import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * order_analytics, migration 0062, the read behind /workspace/analytics.
 *
 * The function is SECURITY DEFINER, so it runs past every policy that scopes
 * the rest of this schema, and it is the first thing in the database to read
 * analytics:view. That makes three of the tests below authorization tests
 * rather than arithmetic ones, and they are the ones worth keeping if this
 * file ever has to shrink: a wrong average is visible to whoever reads it, and
 * a branch manager quietly reading all nine counters is not.
 *
 * Everything else here is about a figure meaning what the page says it means.
 * The hour buckets carry the most weight, because Manila is UTC+8 and an
 * off-by-one-timezone chart is not obviously wrong on screen: it draws a
 * perfectly plausible peak in the wrong place, and the staffing decision it
 * exists to inform is then made against it.
 *
 * The clock is fixed by writing placed_at explicitly rather than by going
 * through place_order, which is deliberate. These are assertions about which
 * bucket a known instant lands in, so the instant has to be known.
 */

const ADMIN_ID = "77000000-0000-4000-8000-000000000001";
const ROVING_MANAGER_ID = "77000000-0000-4000-8000-000000000002";
const PINNED_MANAGER_ID = "77000000-0000-4000-8000-000000000003";
const CASHIER_ID = "77000000-0000-4000-8000-000000000004";

/** The window every test reads, as the page would build it: Manila midnights. */
const FROM = "2026-09-01T00:00:00+08:00";
const TO = "2026-09-03T00:00:00+08:00";

type Report = {
  branch_id: string | null;
  orders_count: number;
  paid_count: number;
  gross_sales_cents: number;
  avg_order_value_cents: number;
  discounts: {
    given_cents: number;
    discounted_orders: number;
    rung_in_pos_orders: number;
  };
  by_hour: { hour: number; orders: number; sales_cents: number }[];
  slots: { windows: number; reserved: number; capacity: number };
  prep_seconds: { sample: number; median: number | null; p90: number | null };
  wait_seconds: { sample: number; median: number | null; p90: number | null };
  no_shows: { orders: number; refunded_cents: number };
  customers: { new: number; returning: number };
  flavour_mix: { name: string; qty: number }[];
  heat_mix: { name: string; heat_percent: number; qty: number }[];
  top_items: { item_name: string; qty: number; sales_cents: number }[];
  top_pairings: { first_item: string; second_item: string; orders: number }[];
};

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
    set role authenticated;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function report(
  db: PGlite,
  actorId: string,
  branchId: string | null = null,
): Promise<Report> {
  const branchArg = branchId === null ? "null" : `'${branchId}'::uuid`;
  const rows = await asUser<{ report: Report }>(
    db,
    actorId,
    `select order_analytics(
       '${FROM}'::timestamptz, '${TO}'::timestamptz, ${branchArg}
     ) as report`,
  );
  return rows[0]!.report;
}

/**
 * How many different phone numbers ordered in the window, counted straight off
 * the table rather than through the report. The point of the new-versus-
 * returning test is that the two sides add up to people, so the expectation
 * has to come from somewhere other than the function under test.
 */
async function distinctPhones(db: PGlite, branchSlug: string): Promise<number> {
  const rows = (
    await db.query<{ n: number }>(
      `select count(distinct o.customer_phone)::int as n
       from orders o
       join branches b on b.id = o.branch_id
       where b.slug = '${branchSlug}'
         and o.is_test = false
         and o.placed_at >= '${FROM}'::timestamptz
         and o.placed_at < '${TO}'::timestamptz`,
    )
  ).rows;
  return rows[0]!.n;
}

function hour(result: Report, at: number): { orders: number; sales_cents: number } {
  const bucket = result.by_hour.find((row) => row.hour === at);
  if (!bucket) throw new Error(`no bucket for hour ${at}`);
  return bucket;
}

/**
 * One order, written straight into the tables.
 *
 * Every timestamp is explicit and every default that would introduce a clock
 * is overridden. `paid` writes the payments row that makes the order count as
 * revenue; leaving it false is how the unpaid arm gets exercised.
 */
type OrderSpec = {
  branch: string;
  placedAt: string;
  phone: string;
  totalCents?: number;
  discountCents?: number;
  paid?: boolean;
  isTest?: boolean;
  status?: string;
  preparingAt?: string;
  readyAt?: string;
  claimedAt?: string;
  posEnteredAt?: string;
  voucher?: boolean;
};

describe("order_analytics", () => {
  let db: PGlite;
  let mango: string;
  let garden: string;

  async function placeOrder(spec: OrderSpec): Promise<string> {
    const {
      branch,
      placedAt,
      phone,
      totalCents = 50000,
      discountCents = 0,
      paid = true,
      isTest = false,
      status = "claimed",
      preparingAt = null,
      readyAt = null,
      claimedAt = null,
      posEnteredAt = null,
      voucher = false,
    } = spec;

    const orderId = await scalar<string>(
      db,
      `insert into orders (
         short_code, pickup_code, status, branch_id, price_list_id,
         customer_name, customer_phone,
         subtotal_cents, discount_cents, total_cents, is_test,
         placed_at, preparing_at, ready_at, claimed_at,
         voucher_id
       )
       select
         generate_short_code(), generate_pickup_code(), '${status}'::order_status,
         b.id, b.price_list_id,
         'Tester', '${phone}',
         ${totalCents + discountCents}, ${discountCents}, ${totalCents}, ${isTest},
         '${placedAt}'::timestamptz,
         ${preparingAt ? `'${preparingAt}'::timestamptz` : "null"},
         ${readyAt ? `'${readyAt}'::timestamptz` : "null"},
         ${claimedAt ? `'${claimedAt}'::timestamptz` : "null"},
         ${voucher ? "(select id from vouchers where code = 'LAUNCH')" : "null"}
       from branches b where b.slug = '${branch}'
       returning id`,
    );

    if (paid) {
      await db.query(
        `insert into payments (order_id, method, status, amount_cents, paid_at)
         values ($1, 'counter', 'paid', ${totalCents}, '${placedAt}'::timestamptz)`,
        [orderId],
      );
    }
    if (posEnteredAt) {
      await db.query(
        `insert into pos_sync (order_id, adapter, state, entered_by, entered_at)
         values ($1, 'manual_rekey', 'manual', '${ADMIN_ID}', '${posEnteredAt}'::timestamptz)`,
        [orderId],
      );
    }
    return orderId;
  }

  /** One line on an order, with a flavour and a heat level hung off it. */
  async function addLine(
    orderId: string,
    itemName: string,
    qty: number,
    flavour: string | null = null,
    heat: { name: string; percent: number } | null = null,
  ): Promise<void> {
    const lineId = await scalar<string>(
      db,
      `insert into order_items (
         order_id, item_id, variation_id, item_name_snapshot,
         variation_label_snapshot, unit_price_cents, qty, line_total_cents
       )
       select '${orderId}'::uuid, v.item_id, v.id, '${itemName}', v.label,
              v.price_cents, ${qty}, v.price_cents * ${qty}
       from item_variations v
       order by v.id
       limit 1
       returning id`,
    );
    if (flavour) {
      await db.query(
        `insert into order_item_options (
           order_item_id, option_id, group_name_snapshot, name_snapshot,
           price_cents, heat_percent_snapshot
         )
         select $1, o.id, 'Flavour', '${flavour}', 0, null
         from menu_options o order by o.id limit 1`,
        [lineId],
      );
    }
    if (heat) {
      await db.query(
        `insert into order_item_options (
           order_item_id, option_id, group_name_snapshot, name_snapshot,
           price_cents, heat_percent_snapshot
         )
         select $1, o.id, 'Level of Hotness', '${heat.name}', 0, ${heat.percent}
         from menu_options o order by o.id limit 1`,
        [lineId],
      );
    }
  }

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });

    await db.exec(`
      insert into auth.users (id, email) values
        ('${ADMIN_ID}', 'admin@example.com'),
        ('${ROVING_MANAGER_ID}', 'roving@example.com'),
        ('${PINNED_MANAGER_ID}', 'pinned@example.com'),
        ('${CASHIER_ID}', 'cashier@example.com');

      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ADMIN_ID}', 'admin', null, 'Super Admin', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ROVING_MANAGER_ID}', 'staff', 'manager', 'Roving', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${PINNED_MANAGER_ID}', 'staff', 'manager', 'Pinned', id
      from branches where slug = 'garden-bloc';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${CASHIER_ID}', 'staff', 'cashier', 'Cashier', id
      from branches where slug = 'garden-bloc';

      insert into vouchers (code, amount_cents, note)
      values ('LAUNCH', 5000, 'launch week');
    `);

    mango = await scalar<string>(db, `select id::text from branches where slug = 'mango-avenue'`);
    garden = await scalar<string>(db, `select id::text from branches where slug = 'garden-bloc'`);

    // 23:30 and 00:30 Manila on either side of one midnight, written in UTC so
    // the conversion is the thing under test rather than an assumption.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-01T15:30:00Z", // 23:30 Manila, 1 September
      phone: "0917-000-0001",
      totalCents: 30000,
    });
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-01T16:30:00Z", // 00:30 Manila, 2 September
      phone: "0917-000-0002",
      totalCents: 20000,
    });

    // The dinner rush at the pinned manager's counter: three orders at 19:00
    // Manila, one of them unpaid, plus the prep and wait telemetry.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T11:00:00Z", // 19:00 Manila
      phone: "0917-000-0003",
      totalCents: 40000,
      preparingAt: "2026-09-02T11:05:00Z",
      readyAt: "2026-09-02T11:15:00Z", // 10 minutes
      claimedAt: "2026-09-02T11:20:00Z", // 5 minutes waiting
    });
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T11:10:00Z",
      phone: "0917-000-0004",
      totalCents: 60000,
      preparingAt: "2026-09-02T11:12:00Z",
      readyAt: "2026-09-02T11:32:00Z", // 20 minutes
      claimedAt: "2026-09-02T11:47:00Z", // 15 minutes waiting
    });
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T11:20:00Z",
      phone: "0917-000-0005",
      totalCents: 99900,
      paid: false,
      status: "pending",
    });

    // A staff test order, in the busiest hour, worth more than anything real.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T11:30:00Z",
      phone: "0917-000-0006",
      totalCents: 500000,
      isTest: true,
    });

    // The other counter, so a scoped read has something to leave out.
    await placeOrder({
      branch: "mango-avenue",
      placedAt: "2026-09-02T06:00:00Z", // 14:00 Manila
      phone: "0917-000-0007",
      totalCents: 25000,
    });

    // A no-show that was refunded, and one whose refund never settled.
    const settled = await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T02:00:00Z",
      phone: "0917-000-0008",
      totalCents: 15000,
      status: "no_show",
    });
    const unsettled = await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T02:30:00Z",
      phone: "0917-000-0009",
      totalCents: 18000,
      status: "no_show",
    });
    await db.query(
      `insert into refunds (payment_id, order_id, amount_cents, reason, status)
       select p.id, p.order_id, 15000, 'others', 'succeeded'
       from payments p where p.order_id = $1`,
      [settled],
    );
    await db.query(
      `insert into refunds (payment_id, order_id, amount_cents, reason, status)
       select p.id, p.order_id, 18000, 'others', 'pending'
       from payments p where p.order_id = $1`,
      [unsettled],
    );

    // Two discounted orders, only one of which reached the POS.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T03:00:00Z",
      phone: "0917-000-0010",
      totalCents: 10000,
      discountCents: 5000,
      voucher: true,
      posEnteredAt: "2026-09-02T03:05:00Z",
    });
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T03:30:00Z",
      phone: "0917-000-0011",
      totalCents: 12000,
      discountCents: 4000,
      voucher: true,
    });

    // A regular: the same number ordering twice, the second one inside the
    // window and the first one before it.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-08-20T04:00:00Z",
      phone: "0917-000-9999",
      totalCents: 11000,
    });
    const regular = await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T04:00:00Z",
      phone: "0917-000-9999",
      totalCents: 13000,
    });

    // The menu mix and one pairing, hung off the regular's second order.
    await addLine(regular, "Buffalo Wings", 2, "Classic Buffalo", {
      name: "Sweet Spicy",
      percent: 40,
    });
    await addLine(regular, "Fries", 1);

    // The regular again, inside the window this time, so new versus returning
    // has to choose between counting tickets and counting people.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T05:00:00Z", // 13:00 Manila
      phone: "0917-000-9999",
      totalCents: 9000,
    });

    // An order the branch refused after the money had already been taken. It
    // is a real order and a real refusal, and it is not a sale.
    const refused = await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T09:00:00Z", // 17:00 Manila
      phone: "0917-000-0012",
      totalCents: 77000,
      status: "rejected",
    });
    await addLine(refused, "Refused Platter", 3);

    // A second test order, which exists only to book a pickup window.
    await placeOrder({
      branch: "garden-bloc",
      placedAt: "2026-09-02T11:35:00Z",
      phone: "0917-000-0013",
      totalCents: 400000,
      isTest: true,
    });

    // Pickup windows, for the utilization ratio. The stored reserved counters
    // are deliberately wrong here: they say 8 and 2, which is what 0062 read
    // and reported. What is true is underneath them, in who booked what.
    await db.query(
      `insert into pickup_slots (branch_id, slot_start, capacity, reserved)
       values
         ($1, '2026-09-02T11:00:00Z'::timestamptz, 10, 8),
         ($1, '2026-09-02T11:15:00Z'::timestamptz, 10, 2)`,
      [garden],
    );

    // The 19:00 window is held by two real orders, and also chosen by the
    // staff test order and by the order the branch went on to refuse. Neither
    // of those is a place a paying customer took: the test row is not real,
    // and rejecting an order hands its window straight back (0036).
    await db.query(
      `update orders o
         set pickup_slot_id = ps.id
       from pickup_slots ps
       where ps.branch_id = $1
         and ps.slot_start = '2026-09-02T11:00:00Z'::timestamptz
         and o.customer_phone in (
           '0917-000-0003', '0917-000-0004', '0917-000-0006', '0917-000-0012'
         )`,
      [garden],
    );

    // The 19:15 window was only ever chosen by a test order, so it was never
    // a window the kitchen offered anybody real.
    await db.query(
      `update orders o
         set pickup_slot_id = ps.id
       from pickup_slots ps
       where ps.branch_id = $1
         and ps.slot_start = '2026-09-02T11:15:00Z'::timestamptz
         and o.customer_phone = '0917-000-0013'`,
      [garden],
    );
  }, 180_000);

  describe("who may read it", () => {
    it("refuses a customer and a signed-out caller", async () => {
      await expect(report(db, "77000000-0000-4000-8000-0000000000ff")).rejects.toThrow(
        /not authorized/,
      );
    });

    it("refuses a cashier, who holds no analytics:view", async () => {
      // The reference guarded on the role kind alone, which would have let this
      // through. A cashier is staff.
      await expect(report(db, CASHIER_ID)).rejects.toThrow(/not authorized/);
    });

    it("admits the Super Admin and a manager", async () => {
      expect((await report(db, ADMIN_ID)).orders_count).toBeGreaterThan(0);
      expect((await report(db, ROVING_MANAGER_ID)).orders_count).toBeGreaterThan(0);
    });
  });

  describe("branch scoping", () => {
    it("pins an assigned manager to their own counter", async () => {
      const scoped = await report(db, PINNED_MANAGER_ID);
      expect(scoped.branch_id).toBe(garden);
      // The Mango Avenue order at 14:00 Manila is the one this must not see.
      expect(hour(scoped, 14).orders).toBe(0);
    });

    it("ignores a branch argument from an assigned manager", async () => {
      // The whole reason the scope is decided in the database. Asking for the
      // other counter answers with your own, not with theirs.
      const asked = await report(db, PINNED_MANAGER_ID, mango);
      expect(asked.branch_id).toBe(garden);
      expect(hour(asked, 14).orders).toBe(0);
    });

    it("gives an unassigned manager the whole business, and a working filter", async () => {
      const wide = await report(db, ROVING_MANAGER_ID);
      expect(wide.branch_id).toBeNull();
      expect(hour(wide, 14).orders).toBe(1);

      const filtered = await report(db, ROVING_MANAGER_ID, mango);
      expect(filtered.branch_id).toBe(mango);
      expect(filtered.orders_count).toBe(1);
      expect(hour(filtered, 19).orders).toBe(0);
    });
  });

  describe("the hour of day chart", () => {
    it("draws all twenty-four hours, including the empty ones", async () => {
      const result = await report(db, ADMIN_ID);
      expect(result.by_hour).toHaveLength(24);
      expect(result.by_hour.map((row) => row.hour)).toEqual(
        Array.from({ length: 24 }, (_, index) => index),
      );
      // 09:00 Manila had nothing, and still gets a bar.
      expect(hour(result, 9)).toEqual({ hour: 9, orders: 0, sales_cents: 0 });
    });

    it("cuts the buckets in Manila, not in UTC", async () => {
      const result = await report(db, ADMIN_ID);
      // 15:30 UTC is 23:30 in Cebu, and 16:30 UTC is half past midnight the
      // next day. In UTC these two would sit in buckets 15 and 16, which is
      // the failure this test exists to catch.
      expect(hour(result, 23).orders).toBe(1);
      expect(hour(result, 23).sales_cents).toBe(30000);
      expect(hour(result, 0).orders).toBe(1);
      expect(hour(result, 0).sales_cents).toBe(20000);
      expect(hour(result, 15).orders).toBe(0);
      expect(hour(result, 16).orders).toBe(0);
    });

    it("counts an unpaid order but banks none of its money", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // Three real orders in the 19:00 hour, one of them not paid for.
      expect(hour(result, 19).orders).toBe(3);
      expect(hour(result, 19).sales_cents).toBe(100000);
    });
  });

  describe("the money", () => {
    it("leaves test orders out of the count and the revenue", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // The test order is worth 5,000 pesos and sits in the busiest hour.
      expect(result.gross_sales_cents).toBeLessThan(500000);
      expect(hour(result, 19).orders).toBe(3);
    });

    it("averages over paid orders, not over every order", async () => {
      const result = await report(db, ROVING_MANAGER_ID, mango);
      expect(result.orders_count).toBe(1);
      expect(result.paid_count).toBe(1);
      expect(result.gross_sales_cents).toBe(25000);
      expect(result.avg_order_value_cents).toBe(25000);
    });

    it("answers zero rather than dividing by nothing on an empty window", async () => {
      const rows = await asUser<{ report: Report }>(
        db,
        ADMIN_ID,
        `select order_analytics(
           '2020-01-01T00:00:00+08:00'::timestamptz,
           '2020-01-02T00:00:00+08:00'::timestamptz
         ) as report`,
      );
      const empty = rows[0]!.report;
      expect(empty.orders_count).toBe(0);
      expect(empty.gross_sales_cents).toBe(0);
      expect(empty.avg_order_value_cents).toBe(0);
      expect(empty.by_hour).toHaveLength(24);
      expect(empty.prep_seconds.sample).toBe(0);
      expect(empty.prep_seconds.median).toBeNull();
      expect(empty.top_items).toEqual([]);
    });
  });

  describe("prep and wait", () => {
    it("reports the median and the p90 in seconds", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // Two samples, 10 and 20 minutes, so the median is the midpoint.
      expect(result.prep_seconds.sample).toBe(2);
      expect(Number(result.prep_seconds.median)).toBe(900);
      expect(Number(result.prep_seconds.p90)).toBe(1140);
      // Waiting: 5 and 15 minutes.
      expect(result.wait_seconds.sample).toBe(2);
      expect(Number(result.wait_seconds.median)).toBe(600);
    });
  });

  describe("no-shows and their cost", () => {
    it("counts only the refunds that actually settled", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.no_shows.orders).toBe(2);
      // The pending refund has not left the account, so it is not a cost yet.
      expect(result.no_shows.refunded_cents).toBe(15000);
    });
  });

  describe("the discount check", () => {
    it("counts only discounts on orders the counter rang into the POS", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.discounts.given_cents).toBe(5000);
      expect(result.discounts.discounted_orders).toBe(1);
      expect(result.discounts.rung_in_pos_orders).toBe(1);
    });
  });

  describe("new versus returning", () => {
    it("calls a number that has ordered before returning, however long ago", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // One regular, whose earlier order is outside the window entirely.
      expect(result.customers.returning).toBe(1);
    });

    it("counts people rather than tickets", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // The regular ordered twice inside this range. Counting tickets, which
      // is what 0062 did, would call that two returning customers and make the
      // two sides add up to the order count instead of to the people.
      const people = result.customers.new + result.customers.returning;
      expect(result.customers.returning).toBe(1);
      expect(people).toBeLessThan(result.orders_count);
      expect(people).toBe(await distinctPhones(db, "garden-bloc"));
    });
  });

  describe("an order the branch refused", () => {
    it("is counted, and is not revenue", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // 17:00 Manila holds the refused order and nothing else: one order on
      // the chart, and not one centavo of its 770 pesos.
      expect(hour(result, 17).orders).toBe(1);
      expect(hour(result, 17).sales_cents).toBe(0);
    });

    it("keeps its items out of the mix", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.top_items.map((row) => row.item_name)).not.toContain(
        "Refused Platter",
      );
    });
  });

  describe("the menu mix", () => {
    it("splits flavour from heat on the heat column", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.flavour_mix).toEqual([{ name: "Classic Buffalo", qty: 2 }]);
      expect(result.heat_mix).toEqual([
        { name: "Sweet Spicy", heat_percent: 40, qty: 2 },
      ]);
    });

    it("names one pairing per ticket, in one direction", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.top_pairings).toEqual([
        { first_item: "Buffalo Wings", second_item: "Fries", orders: 1 },
      ]);
    });

    it("ranks items by quantity", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      expect(result.top_items.map((row) => row.item_name)).toEqual([
        "Buffalo Wings",
        "Fries",
      ]);
    });
  });

  describe("pickup windows", () => {
    it("counts the places real customers took, not the stored counter", async () => {
      const result = await report(db, PINNED_MANAGER_ID);
      // The counters on the two rows say 8 and 2, and 0062 reported exactly
      // that. Two real orders hold the 19:00 window; the test order and the
      // refused one do not. The 19:15 window had nothing real in it at all, so
      // it leaves the denominator with the row it came from.
      expect(result.slots).toEqual({ windows: 1, reserved: 2, capacity: 10 });
    });
  });
});

/**
 * Top pairings, on the shapes the live database has never produced.
 *
 * The fixture above holds exactly one pairing, on one order, which is also all
 * the live project has: one ticket carrying two items. That asserts the
 * feature renders and nothing about whether it counts. Every way this query
 * can be wrong needs an order shape that data does not contain, so it gets its
 * own database.
 *
 * The one that would actually ship wrong is the first. An order carrying the
 * same item on two lines, which is what a customer buying a half and a full of
 * something produces, joins twice without the `distinct` in order_item_names
 * and inflates that pair by one order for every extra line. It would read as a
 * genuinely popular combination rather than as one person ordering wings twice.
 */
describe("order_analytics pairings", () => {
  const ADMIN = "79000000-0000-4000-8000-000000000001";
  const FROM = "2026-09-01T00:00:00+08:00";
  const TO = "2026-09-03T00:00:00+08:00";

  let db: PGlite;

  async function pairings(): Promise<
    { first_item: string; second_item: string; orders: number }[]
  > {
    const rows = await asUser<{ report: { top_pairings: never[] } }>(
      db,
      ADMIN,
      `select order_analytics('${FROM}'::timestamptz, '${TO}'::timestamptz) as report`,
    );
    return rows[0]!.report.top_pairings;
  }

  /** One paid, collected order carrying the given lines, in order. */
  async function ticket(phone: string, lines: string[]): Promise<void> {
    const id = await scalar<string>(
      db,
      `insert into orders (
         short_code, pickup_code, status, branch_id, price_list_id,
         customer_name, customer_phone, subtotal_cents, discount_cents,
         total_cents, placed_at
       )
       select generate_short_code(), generate_pickup_code(), 'claimed',
              b.id, b.price_list_id, 'Tester', '${phone}', 1000, 0, 1000,
              '2026-09-02T02:00:00Z'::timestamptz
       from branches b where b.slug = 'garden-bloc'
       returning id`,
    );
    await db.query(
      `insert into payments (order_id, method, status, amount_cents, paid_at)
       values ($1, 'counter', 'paid', 1000, '2026-09-02T02:00:00Z'::timestamptz)`,
      [id],
    );
    for (const name of lines) {
      await db.query(
        `insert into order_items (
           order_id, item_id, variation_id, item_name_snapshot,
           variation_label_snapshot, unit_price_cents, qty, line_total_cents
         )
         select $1, v.item_id, v.id, $2, v.label, 100, 1, 100
         from item_variations v order by v.id limit 1`,
        [id, name],
      );
    }
  }

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await db.exec(`
      insert into auth.users (id, email) values ('${ADMIN}', 'pairings@example.com');
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ADMIN}', 'admin', null, 'Super Admin', null);
    `);

    // The half-and-full case: Wings twice on one ticket, beside Fries.
    await ticket("0917-100-0001", ["Wings", "Wings", "Fries"]);
    // Three items, which is three pairs off one order.
    await ticket("0917-100-0002", ["Wings", "Fries", "Coke"]);
    // The same pair again, on its own.
    await ticket("0917-100-0003", ["Wings", "Fries"]);
    // One item, which pairs with nothing.
    await ticket("0917-100-0004", ["Wings"]);
  }, 180_000);

  it("counts a pair once per ticket, however many lines carry it", async () => {
    const rows = await pairings();
    const wingsAndFries = rows.find(
      (row) => row.first_item === "Fries" && row.second_item === "Wings",
    );
    // Three tickets hold both. The first of them holds Wings on two lines, and
    // without the distinct that ticket would contribute two, reading 4.
    expect(Number(wingsAndFries?.orders)).toBe(3);
  });

  it("draws every pair on a ticket, in one direction only", async () => {
    const rows = await pairings();
    expect(rows.map((row) => `${row.first_item}+${row.second_item}`)).toEqual([
      // Ordered by count, then alphabetically, and no pair restated backwards.
      "Fries+Wings",
      "Coke+Fries",
      "Coke+Wings",
    ]);
  });

  it("pairs a single-item ticket with nothing", async () => {
    // The fourth order is in the window and paid for, and contributes no row.
    const rows = await pairings();
    expect(rows.every((row) => row.first_item !== row.second_item)).toBe(true);
    expect(rows).toHaveLength(3);
  });
});
