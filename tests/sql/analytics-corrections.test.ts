import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0096: what the sales report counts.
 *
 * A small world of its own rather than more rows in order-analytics.test.ts,
 * whose shared fixture every other assertion there is measured against.
 */

const ADMIN_ID = "77000000-0000-4000-8000-0000000000aa";
const FROM = "2026-09-01T00:00:00+08:00";
const TO = "2026-09-03T00:00:00+08:00";

type Report = {
  orders_count: number;
  paid_count: number;
  gross_sales_cents: number;
  refunded_cents: number;
  customers: { new: number; returning: number };
};

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values ('${ADMIN_ID}', 'admin@example.com');
    insert into profiles (id, role, staff_role, display_name) values ('${ADMIN_ID}', 'admin', null, 'Admin');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City' from price_lists;
  `);
  return db;
}

async function order(
  db: PGlite,
  spec: {
    placedAt: string;
    phone: string;
    status?: string;
    cancelledReason?: string;
    payment?: "paid" | "pending" | "failed" | null;
    totalCents?: number;
  },
): Promise<string> {
  const total = spec.totalCents ?? 32900;
  const orderId = await scalar<string>(
    db,
    `insert into orders (
       short_code, pickup_code, status, branch_id, price_list_id, customer_name, customer_phone,
       subtotal_cents, total_cents, placed_at, cancelled_reason
     )
     select generate_short_code(), generate_pickup_code(), '${spec.status ?? "claimed"}'::order_status,
            b.id, b.price_list_id, 'Tester', '${spec.phone}', ${total}, ${total},
            '${spec.placedAt}'::timestamptz, ${spec.cancelledReason ? `'${spec.cancelledReason}'` : "null"}
     from branches b
     returning id`,
  );
  if (spec.payment !== null) {
    await db.query(
      `insert into payments (order_id, method, status, amount_cents, paid_at)
       values ($1, 'counter', $2::payment_status, ${total}, '${spec.placedAt}'::timestamptz)`,
      [orderId, spec.payment ?? "paid"],
    );
  }
  return orderId;
}

async function refund(db: PGlite, orderId: string, amountCents: number): Promise<void> {
  await db.query(
    `insert into refunds (payment_id, order_id, amount_cents, reason, status, settled_at)
     select p.id, p.order_id, ${amountCents}, 'requested_by_customer', 'succeeded', now()
     from payments p where p.order_id = $1`,
    [orderId],
  );
}

async function report(db: PGlite): Promise<Report> {
  await db.exec(
    `create or replace function auth.uid() returns uuid language sql stable as $$ select '${ADMIN_ID}'::uuid $$; set role authenticated;`,
  );
  try {
    const result = await db.query<{ report: Report }>(
      `select order_analytics('${FROM}'::timestamptz, '${TO}'::timestamptz, null) as report`,
    );
    return result.rows[0].report;
  } finally {
    await db.exec("reset role");
  }
}

describe("order_analytics after 0096", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("leaves an abandoned online checkout out of the orders and the customers", async () => {
    await order(db, {
      placedAt: "2026-09-01T12:00:00+08:00",
      phone: "0917 111 2222",
      status: "cancelled",
      cancelledReason: "payment_timeout",
      payment: "pending",
    });
    // The same person comes back and pays. That is their first order.
    await order(db, { placedAt: "2026-09-01T12:30:00+08:00", phone: "+63 917 111 2222" });

    const result = await report(db);
    expect(result.orders_count).toBe(1);
    expect(result.customers).toEqual({ new: 1, returning: 0 });
  });

  it("still counts an order the branch refused", async () => {
    await order(db, {
      placedAt: "2026-09-01T12:00:00+08:00",
      phone: "0917 333 4444",
      status: "rejected",
      payment: null,
    });
    expect((await report(db)).orders_count).toBe(1);
  });

  it("treats one mobile written two ways as one returning customer", async () => {
    await order(db, { placedAt: "2026-08-20T12:00:00+08:00", phone: "0917 555 6666" });
    await order(db, { placedAt: "2026-09-01T12:00:00+08:00", phone: "+63 917 555 6666" });
    expect((await report(db)).customers).toEqual({ new: 0, returning: 1 });
  });

  it("counts a refunded sale in gross and reports the refund beside it", async () => {
    const full = await order(db, { placedAt: "2026-09-01T12:00:00+08:00", phone: "0917 777 8888" });
    const partial = await order(db, { placedAt: "2026-09-01T13:00:00+08:00", phone: "0917 777 9999" });
    await refund(db, full, 32900);
    await db.query("update payments set status = 'refunded' where order_id = $1", [full]);
    await refund(db, partial, 32800);

    const result = await report(db);
    expect(result.paid_count).toBe(2);
    expect(result.gross_sales_cents).toBe(65800);
    expect(result.refunded_cents).toBe(65700);
  });
});
