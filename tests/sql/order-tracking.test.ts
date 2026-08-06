import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over get_order_by_tracking(), migration 0014.
 *
 * Two things are being proven, and the second matters more than it looks.
 *
 * The payload is the easy half: the page has to be able to show what was
 * ordered, at the price charged, from the snapshots rather than from a menu
 * that has moved on since.
 *
 * The hard half is that a wrong token and a code that never existed give the
 * same answer. A six character code from a 31 character alphabet is guessable
 * at scale by design, so if the two answers differed the code space could be
 * scraped for real orders before anybody attacked a token.
 */

type Tracked = {
  shortCode: string;
  status: string;
  placedAt: string;
  pickupCode: string;
  pickup: { startsAt: string; endsAt: string } | null;
  branch: {
    slug: string;
    name: string;
    shortName: string;
    timezone: string;
    addressLine: string;
    city: string;
    phones: string[];
  };
  customer: { name: string; phone: string; email: string | null };
  items: {
    name: string;
    variationLabel: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
    notes: string | null;
    options: { group: string; name: string; priceCents: number; heatPercent: number | null }[];
  }[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  notes: string | null;
  payment: { method: string; status: string; amountCents: number; paidAt: string | null } | null;
  timeline: Record<string, string | null>;
};

/** The same live branch the place_order tests build, for the same reasons. */
async function openBranch(db: PGlite): Promise<string> {
  const branchId = await scalar<string>(
    db,
    `insert into branches (
       slug, name, short_name, format, price_list_id, address_line, city, phones,
       is_active, is_accepting_orders, pickup_slot_minutes, pickup_slot_capacity,
       prep_minutes_default
     )
     select 'pilot', 'Pilot Branch', 'Pilot', 'street', pl.id, '1 Test Street', 'Cebu City',
            array['0906-440-5297', '(032) 318-2405'],
            true, true, 15, 20, 20
     from price_lists pl order by pl.slug limit 1
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

async function placeOne(db: PGlite, attempt: string) {
  const slots = await db.query<{ payload: { slots: { startsAt: string }[] } }>(
    "select get_pickup_slots('pilot') as payload",
  );
  const slot = slots.rows[0].payload.slots[0].startsAt;

  const placed = await db.query<{
    result: { shortCode: string; trackingToken: string; pickupCode: string; orderId: string };
  }>("select place_order($1::jsonb, $2::uuid) as result", [
    JSON.stringify({
      branch_slug: "pilot",
      customer_name: "Steven Cruz",
      customer_phone: "0906 440 5297",
      customer_email: "steven@example.com",
      notes: "Extra napkins",
      pickup_slot_start: slot,
      lines: [
        {
          item_slug: "chicken-wings",
          variation_slug: "full",
          qty: 2,
          options: [
            { group_slug: "wing-flavour", option_slug: "classic-buffalo" },
            { group_slug: "level-of-hotness", option_slug: "insane" },
          ],
        },
        { item_slug: "ribs-original", variation_slug: "regular", qty: 1 },
      ],
    }),
    attempt,
  ]);

  return { ...placed.rows[0].result, slot };
}

async function track(
  db: PGlite,
  code: string,
  token: string | null,
): Promise<Tracked | null> {
  const result = await db.query<{ payload: Tracked | null }>(
    "select get_order_by_tracking($1, $2) as payload",
    [code, token],
  );
  return result.rows[0].payload;
}

describe("get_order_by_tracking, the customer's own order", () => {
  let db: PGlite;
  let placed: Awaited<ReturnType<typeof placeOne>>;
  let tracked: Tracked;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    placed = await placeOne(db, "00000000-0000-4000-8000-000000000001");
    tracked = (await track(db, placed.shortCode, placed.trackingToken)) as Tracked;
  });

  it("hands back the codes the customer needs at the counter", () => {
    expect(tracked.shortCode).toBe(placed.shortCode);
    expect(tracked.pickupCode).toBe(placed.pickupCode);
    expect(tracked.status).toBe("pending");
  });

  it("says which window, at which branch, and how to call it", () => {
    expect(tracked.pickup?.startsAt).toBe(placed.slot);
    // Fifteen minutes on from the start, which is this branch's granularity.
    expect(
      new Date(tracked.pickup!.endsAt).getTime() - new Date(placed.slot).getTime(),
    ).toBe(15 * 60_000);
    expect(tracked.branch).toMatchObject({
      slug: "pilot",
      shortName: "Pilot",
      addressLine: "1 Test Street",
      timezone: "Asia/Manila",
    });
    // Both published numbers, because two of the nine branches have two.
    expect(tracked.branch.phones).toEqual(["0906-440-5297", "(032) 318-2405"]);
  });

  it("lists what was ordered, with the options and the heat level on it", () => {
    expect(tracked.items).toHaveLength(2);

    const wings = tracked.items.find((item) => item.name === "Chicken Wings");
    expect(wings).toMatchObject({
      variationLabel: "Full, 10 pieces",
      quantity: 2,
      unitPriceCents: 58900,
      lineTotalCents: 117800,
    });
    expect(wings?.options).toEqual([
      { group: "Flavour", name: "Classic Buffalo", priceCents: 0, heatPercent: null },
      { group: "Level of Hotness", name: "Insane", priceCents: 6000, heatPercent: 100 },
    ]);
  });

  it("carries the money and the counter payment that is still due", () => {
    expect(tracked.subtotalCents).toBe(117800 + 34900);
    expect(tracked.totalCents).toBe(tracked.subtotalCents);
    expect(tracked.discountCents).toBe(0);
    expect(tracked.payment).toMatchObject({
      method: "counter",
      status: "due",
      amountCents: tracked.totalCents,
      paidAt: null,
    });
  });

  it("keeps the customer's own details behind the token", () => {
    // This is exactly why a short code is not enough on its own.
    expect(tracked.customer).toEqual({
      name: "Steven Cruz",
      phone: "0906 440 5297",
      email: "steven@example.com",
    });
    expect(tracked.notes).toBe("Extra napkins");
  });

  it("opens with an empty timeline, because nothing has happened yet", () => {
    // Nulls are the steps that have not happened, and they are meaningful:
    // no staff board exists to reach any of them until Phase 2.
    expect(tracked.timeline).toEqual({
      acceptedAt: null,
      preparingAt: null,
      readyAt: null,
      claimedAt: null,
      rejectedAt: null,
      rejectedReason: null,
      cancelledAt: null,
      cancelledReason: null,
      customerArrivedAt: null,
      noShowAt: null,
    });
  });

  it("follows the order as staff move it", async () => {
    await db.query(
      `update orders set status = 'ready', accepted_at = now(), ready_at = now()
       where short_code = $1`,
      [placed.shortCode],
    );
    const moved = (await track(db, placed.shortCode, placed.trackingToken)) as Tracked;
    expect(moved.status).toBe("ready");
    expect(moved.timeline.readyAt).not.toBeNull();
  });

  it("keeps saying what was sold after the menu is renamed underneath it", async () => {
    // The whole reason order_items carries snapshots. A receipt has to keep
    // describing the thing that was actually bought.
    await db.exec("update menu_items set name = 'Renamed' where slug = 'ribs-original'");
    const later = (await track(db, placed.shortCode, placed.trackingToken)) as Tracked;
    expect(later.items.map((item) => item.name)).toContain("Original Ribs");
    expect(later.items.map((item) => item.name)).not.toContain("Renamed");
    await db.exec("update menu_items set name = 'Original Ribs' where slug = 'ribs-original'");
  });
});

describe("get_order_by_tracking, everybody else", () => {
  let db: PGlite;
  let placed: Awaited<ReturnType<typeof placeOne>>;

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await openBranch(db);
    placed = await placeOne(db, "00000000-0000-4000-8000-000000000002");
  });

  it("gives a real code with no token the same answer as a code that never existed", async () => {
    // The assertion this file exists for. If these two differed, the short code
    // space could be scraped for which codes are real.
    const noToken = await track(db, placed.shortCode, null);
    const notAnOrder = await track(db, "NY-ZZZZZZ", null);
    expect(noToken).toBeNull();
    expect(notAnOrder).toBeNull();
    expect(noToken).toEqual(notAnOrder);
  });

  it("gives a wrong token the same answer too", async () => {
    expect(await track(db, placed.shortCode, "11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("treats a malformed token as a miss rather than an error", async () => {
    // The cast is on the column, not on the input. Casting the input would
    // raise, and a raise is a different answer from a null, which is precisely
    // the difference this function refuses to expose.
    for (const token of ["", "not-a-uuid", "'; drop table orders; --"]) {
      await expect(track(db, placed.shortCode, token)).resolves.toBeNull();
    }
  });

  it("does not need the code typed exactly as it was printed", async () => {
    const lower = await track(db, `  ${placed.shortCode.toLowerCase()} `, placed.trackingToken);
    expect(lower?.shortCode).toBe(placed.shortCode);
  });

  it("answers an empty code without touching the table", async () => {
    expect(await track(db, "", placed.trackingToken)).toBeNull();
    expect(await track(db, "   ", placed.trackingToken)).toBeNull();
  });

  it("is reachable by a guest and by a signed-in customer, and by nobody else", async () => {
    const fresh = await freshDatabase();
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(
          fresh,
          `select has_function_privilege('${role}', 'get_order_by_tracking(text, text)', 'execute')`,
        ),
      ).toBe(true);
    }
    // The implicit PUBLIC grant is revoked in the same migration, per 0010.
    expect(
      await scalar<boolean>(
        fresh,
        `select has_function_privilege('public', 'get_order_by_tracking(text, text)', 'execute')`,
      ),
    ).toBe(false);
  });
});
