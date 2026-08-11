import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const OWNER_ID = "77000000-0000-4000-8000-000000000001";
const OTHER_CUSTOMER_ID = "77000000-0000-4000-8000-000000000002";
const TRACKING_TOKEN = "77000000-0000-4000-8000-000000000010";

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
      ('${OTHER_CUSTOMER_ID}', 'other@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, tracking_token, user_id
    )
    select
      'NY-ARRIVE', 'ready', b.id, b.price_list_id, '2468',
      'Customer', '09170000000', 32900, '${TRACKING_TOKEN}', '${OWNER_ID}'
    from branches b where b.slug = 'pilot';
  `);
  return db;
}

describe("customer_mark_order_arrived", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("is callable by a guest bearer-token holder and a signed-in owner, but not PUBLIC", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('${role}', 'customer_mark_order_arrived(text, text)', 'execute')`,
        ),
      ).toBe(true);
    }
    expect(
      await scalar<boolean>(
        db,
        "select has_function_privilege('public', 'customer_mark_order_arrived(text, text)', 'execute')",
      ),
    ).toBe(false);
  });

  it("marks a ready guest order once, retaining the first arrival time on a retry", async () => {
    const first = await asRole<{ arrived: boolean }>(
      db,
      "anon",
      null,
      `select customer_mark_order_arrived(' ny-arrive ', '${TRACKING_TOKEN}') as arrived`,
    );
    expect(first[0]?.arrived).toBe(true);
    const firstTimestamp = await scalar<string>(
      db,
      "select customer_arrived_at::text from orders where short_code = 'NY-ARRIVE'",
    );

    const retry = await asRole<{ arrived: boolean }>(
      db,
      "anon",
      null,
      `select customer_mark_order_arrived('NY-ARRIVE', '${TRACKING_TOKEN}') as arrived`,
    );
    expect(retry[0]?.arrived).toBe(true);
    expect(
      await scalar<string>(
        db,
        "select customer_arrived_at::text from orders where short_code = 'NY-ARRIVE'",
      ),
    ).toBe(firstTimestamp);
  });

  it("lets the signed-in customer arrive without putting a bearer token in the request", async () => {
    const result = await asRole<{ arrived: boolean }>(
      db,
      "authenticated",
      OWNER_ID,
      "select customer_mark_order_arrived('NY-ARRIVE', null) as arrived",
    );
    expect(result[0]?.arrived).toBe(true);
  });

  it("gives every unauthorised or ineligible request the same false result and writes nothing", async () => {
    await db.exec("update orders set status = 'preparing' where short_code = 'NY-ARRIVE'");
    const attempts = [
      ["anon", null, `select customer_mark_order_arrived('NY-ARRIVE', '${TRACKING_TOKEN}') as arrived`],
      ["anon", null, "select customer_mark_order_arrived('NY-ARRIVE', 'not-a-token') as arrived"],
      ["authenticated", OTHER_CUSTOMER_ID, "select customer_mark_order_arrived('NY-ARRIVE', null) as arrived"],
      ["anon", null, `select customer_mark_order_arrived('NY-MISSING', '${TRACKING_TOKEN}') as arrived`],
    ] as const;

    for (const [role, userId, sql] of attempts) {
      const result = await asRole<{ arrived: boolean }>(db, role, userId, sql);
      expect(result[0]?.arrived).toBe(false);
    }
    expect(
      await scalar<boolean>(
        db,
        "select customer_arrived_at is null from orders where short_code = 'NY-ARRIVE'",
      ),
    ).toBe(true);
  });
});
