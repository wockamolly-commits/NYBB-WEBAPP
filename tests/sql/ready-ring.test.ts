import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * 0085, the "I'm coming" tap and the counter's ring again.
 *
 * The phone rings while a ready order has no acknowledgement, so the two
 * properties that matter are that the customer's tap sets one and that the
 * counter's ring clears it. Everything else here is the usual fence: who may
 * call each one, and that a refusal looks like every other refusal.
 */

const OWNER_ID = "85000000-0000-4000-8000-000000000001";
const OTHER_CUSTOMER_ID = "85000000-0000-4000-8000-000000000002";
const STAFF_ID = "85000000-0000-4000-8000-000000000003";
const TRACKING_TOKEN = "85000000-0000-4000-8000-000000000010";
const OTHER_BRANCH_ID = "85000000-0000-4000-8000-000000000099";

async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated",
  userId: string | null,
  sql: string,
): Promise<readonly T[]> {
  const identity = userId ? `'${userId}'::uuid` : "null::uuid";
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select ${identity} $$;
    set role ${role};
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OWNER_ID}', 'owner@example.com'),
      ('${OTHER_CUSTOMER_ID}', 'other@example.com'),
      ('${STAFF_ID}', 'cashier@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (id, slug, name, short_name, format, price_list_id, address_line, city)
    select '${OTHER_BRANCH_ID}', 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name)
    values ('${STAFF_ID}', 'staff', 'cashier', 'Cashier');
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, tracking_token, user_id
    )
    select
      'NY-RING01', 'ready', b.id, b.price_list_id, '2468',
      'Customer', '09170000000', 32900, '${TRACKING_TOKEN}', '${OWNER_ID}'
    from branches b where b.slug = 'pilot';
  `);
  return db;
}

const acknowledgedAt = (db: PGlite) =>
  scalar<string | null>(
    db,
    "select ready_acknowledged_at::text from orders where short_code = 'NY-RING01'",
  );

const orderId = (db: PGlite) =>
  scalar<string>(db, "select id::text from orders where short_code = 'NY-RING01'");

async function ring(db: PGlite): Promise<string> {
  const id = await orderId(db);
  const rows = await asRole<{ rung: string }>(
    db,
    "authenticated",
    STAFF_ID,
    `select staff_ring_ready_order('${id}')::text as rung`,
  );
  return rows[0]!.rung;
}

async function ringError(db: PGlite): Promise<string> {
  try {
    await ring(db);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return "no error";
}

describe("customer_acknowledge_ready_order", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("is callable by a guest token holder and a signed-in owner, but not PUBLIC", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('${role}', 'customer_acknowledge_ready_order(text, text)', 'execute')`,
        ),
      ).toBe(true);
    }
    expect(
      await scalar<boolean>(
        db,
        "select has_function_privilege('public', 'customer_acknowledge_ready_order(text, text)', 'execute')",
      ),
    ).toBe(false);
  });

  it("records the tap once, keeping the first time on a retry", async () => {
    const first = await asRole<{ ok: boolean }>(
      db,
      "anon",
      null,
      `select customer_acknowledge_ready_order(' ny-ring01 ', '${TRACKING_TOKEN}') as ok`,
    );
    expect(first[0]?.ok).toBe(true);
    const stamp = await acknowledgedAt(db);
    expect(stamp).not.toBeNull();

    const retry = await asRole<{ ok: boolean }>(
      db,
      "authenticated",
      OWNER_ID,
      "select customer_acknowledge_ready_order('NY-RING01', null) as ok",
    );
    expect(retry[0]?.ok).toBe(true);
    expect(await acknowledgedAt(db)).toBe(stamp);
  });

  it("gives every unauthorised or ineligible request the same false and writes nothing", async () => {
    await db.exec("update orders set status = 'preparing' where short_code = 'NY-RING01'");
    const attempts = [
      ["anon", null, `select customer_acknowledge_ready_order('NY-RING01', '${TRACKING_TOKEN}') as ok`],
      ["anon", null, "select customer_acknowledge_ready_order('NY-RING01', 'not-a-token') as ok"],
      ["authenticated", OTHER_CUSTOMER_ID, "select customer_acknowledge_ready_order('NY-RING01', null) as ok"],
      ["anon", null, `select customer_acknowledge_ready_order('NY-NOPE01', '${TRACKING_TOKEN}') as ok`],
    ] as const;

    for (const [role, userId, sql] of attempts) {
      const result = await asRole<{ ok: boolean }>(db, role, userId, sql);
      expect(result[0]?.ok).toBe(false);
    }
    expect(await acknowledgedAt(db)).toBeNull();
  });
});

describe("staff_ring_ready_order", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("is exposed to authenticated staff sessions only", async () => {
    expect(
      await scalar<boolean>(
        db,
        "select has_function_privilege('authenticated', 'staff_ring_ready_order(uuid)', 'execute')",
      ),
    ).toBe(true);
    expect(
      await scalar<boolean>(
        db,
        "select has_function_privilege('anon', 'staff_ring_ready_order(uuid)', 'execute')",
      ),
    ).toBe(false);
  });

  it("stamps a ring, clears the customer's tap and leaves one audit row", async () => {
    await db.exec("update orders set ready_acknowledged_at = now() where short_code = 'NY-RING01'");

    const rung = await ring(db);

    expect(rung).not.toBeNull();
    expect(await acknowledgedAt(db)).toBeNull();
    expect(
      await scalar<string>(db, "select ready_ring_at::text from orders where short_code = 'NY-RING01'"),
    ).toBe(rung);
    expect(
      await scalar<number>(
        db,
        "select count(*)::int from audit_logs where action = 'order.ready_rung'",
      ),
    ).toBe(1);
    expect(
      await scalar<boolean>(
        db,
        "select (diff->>'customerHadAcknowledged')::boolean from audit_logs where action = 'order.ready_rung'",
      ),
    ).toBe(true);
  });

  it("refuses a second ring inside the cooldown, and allows one after it", async () => {
    await ring(db);
    expect(await ringError(db)).toContain("RING_COOLDOWN");

    await db.exec(
      "update orders set ready_ring_at = now() - interval '16 seconds' where short_code = 'NY-RING01'",
    );
    expect(await ringError(db)).toBe("no error");
  });

  it("refuses an order that is not ready", async () => {
    await db.exec("update orders set status = 'claimed' where short_code = 'NY-RING01'");
    expect(await ringError(db)).toContain("INVALID_TRANSITION");
  });

  it("refuses staff without orders:manage", async () => {
    await db.exec(`update profiles set is_active = false where id = '${STAFF_ID}'`);
    expect(await ringError(db)).toContain("FORBIDDEN");
  });

  it("refuses staff assigned to a different branch", async () => {
    await db.exec(`update profiles set branch_id = '${OTHER_BRANCH_ID}' where id = '${STAFF_ID}'`);
    expect(await ringError(db)).toContain("FORBIDDEN_BRANCH");
  });
});

describe("tracking broadcasts and reader for a ring", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  const sentCount = () => scalar<number>(db, "select count(*)::int from realtime.sent_messages");

  it("signals the tracking topic on a ring and on the customer's tap", async () => {
    const before = await sentCount();
    await ring(db);
    expect(await sentCount()).toBe(before + 1);
    expect(
      await scalar<string>(db, "select topic from realtime.sent_messages order by ctid desc limit 1"),
    ).toBe(`order-tracking:${TRACKING_TOKEN}`);

    await asRole(
      db,
      "anon",
      null,
      `select customer_acknowledge_ready_order('NY-RING01', '${TRACKING_TOKEN}')`,
    );
    expect(await sentCount()).toBe(before + 2);
  });

  it("returns both stamps in the tracking timeline", async () => {
    const rung = await ring(db);
    await asRole(
      db,
      "anon",
      null,
      `select customer_acknowledge_ready_order('NY-RING01', '${TRACKING_TOKEN}')`,
    );
    const rows = await asRole<{ timeline: { readyRingAt: string | null; readyAcknowledgedAt: string | null } }>(
      db,
      "anon",
      null,
      `select get_order_by_tracking('NY-RING01', '${TRACKING_TOKEN}')->'timeline' as timeline`,
    );
    const timeline = rows[0]!.timeline;
    expect(timeline.readyRingAt).not.toBeNull();
    expect(new Date(timeline.readyRingAt!).getTime()).toBe(new Date(rung).getTime());
    expect(timeline.readyAcknowledgedAt).not.toBeNull();
  });
});
