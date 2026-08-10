import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

describe("order tracking Realtime broadcasts", () => {
  let db: PGlite;
  const token = "82000000-0000-4000-8000-000000000001";

  beforeAll(async () => {
    db = await freshDatabase({ seed: true });
    await db.exec(`
      insert into orders (
        short_code, tracking_token, branch_id, price_list_id, pickup_code,
        customer_name, customer_phone
      )
      select
        'NY-LIVE21', '${token}', b.id, b.price_list_id, '2468',
        'Realtime Customer', '09170000000'
      from branches b
      where b.slug = 'garden-bloc';
    `);
  }, 120_000);

  it("broadcasts a data-free signal on the bearer-token topic", async () => {
    await db.exec(
      `update orders set status = 'preparing' where short_code = 'NY-LIVE21'`,
    );

    expect(
      await scalar<string>(
        db,
        `select topic from realtime.sent_messages order by ctid desc limit 1`,
      ),
    ).toBe(`order-tracking:${token}`);
    expect(
      await scalar<string>(
        db,
        `select event from realtime.sent_messages order by ctid desc limit 1`,
      ),
    ).toBe("status_changed");
    expect(
      await scalar<boolean>(
        db,
        `select private from realtime.sent_messages order by ctid desc limit 1`,
      ),
    ).toBe(false);
    expect(
      await scalar<string>(
        db,
        `select payload::text from realtime.sent_messages order by ctid desc limit 1`,
      ),
    ).toBe('{"changed": true}');
  });

  it("does not broadcast an unrelated edit", async () => {
    const before = await scalar<number>(
      db,
      `select count(*)::int from realtime.sent_messages`,
    );
    await db.exec(`
      update orders set customer_name = 'Updated Name' where short_code = 'NY-LIVE21'
    `);
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from realtime.sent_messages`,
      ),
    ).toBe(before);
  });

  it("keeps the trigger function unavailable to every application role", async () => {
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('${role}', 'broadcast_order_tracking_status()', 'execute')`,
        ),
        role,
      ).toBe(false);
    }
  });
});
