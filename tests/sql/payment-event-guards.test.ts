import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0091: payment events that arrive late, twice, or after a refund.
 */

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    update app_settings set
      paymongo_enabled = true,
      paymongo_methods = '{"qrph": true, "gcash": false, "maya": false, "card": false}'::jsonb,
      online_payment_expiry_minutes = 15
    where id = 1;
  `);
  return db;
}

async function onlineOrder(db: PGlite, code: string, intent: string): Promise<string> {
  const orderId = await scalar<string>(
    db,
    `insert into orders (
       short_code, status, branch_id, price_list_id, pickup_code,
       customer_name, customer_phone, total_cents, placed_at
     )
     select '${code}', 'pending', b.id, b.price_list_id, '2468',
            'Customer', '09170000000', 32900, now() - interval '5 minutes'
     from branches b where b.slug = 'pilot'
     returning id::text`,
  );
  await db.exec(`
    insert into payments (order_id, method, provider, status, amount_cents, provider_intent_id, reference)
    values ('${orderId}', 'qrph', 'paymongo', 'pending', 32900, '${intent}', 'client-key');
  `);
  return orderId;
}

/** Puts a payment straight into 'refunded', past the 0033 guard that wants refund rows. */
async function markRefunded(db: PGlite, orderId: string): Promise<void> {
  await db.exec(`
    alter table payments disable trigger user;
    update payments set status = 'refunded', needs_refund = false where order_id = '${orderId}';
    alter table payments enable trigger user;
  `);
}

const apply = (db: PGlite, intent: string, status: string) =>
  scalar<string | null>(
    db,
    `select apply_paymongo_payment('${intent}', '${status}', 'pay_x', '{}'::jsonb)::text`,
  );

describe("apply_paymongo_payment after a refund", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("ignores a redelivered paid event", async () => {
    const orderId = await onlineOrder(db, "NY-RFD001", "pi_rfd1");
    await apply(db, "pi_rfd1", "paid");
    await markRefunded(db, orderId);

    expect(await apply(db, "pi_rfd1", "paid")).toBeNull();
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe(
      "refunded",
    );
  });

  it("ignores a late failed event and leaves the order alone", async () => {
    const orderId = await onlineOrder(db, "NY-RFD002", "pi_rfd2");
    await apply(db, "pi_rfd2", "paid");
    await markRefunded(db, orderId);

    expect(await apply(db, "pi_rfd2", "failed")).toBeNull();
    expect(await scalar<string>(db, `select status::text from payments where order_id = '${orderId}'`)).toBe(
      "refunded",
    );
    expect(await scalar<string>(db, `select status::text from orders where id = '${orderId}'`)).toBe("pending");
  });
});

describe("apply_paymongo_payment told the same failure twice", () => {
  it("reports the first and stays quiet on the second", async () => {
    const db = await setup();
    const orderId = await onlineOrder(db, "NY-FAIL02", "pi_fail2");
    expect(await apply(db, "pi_fail2", "failed")).toBe(orderId);
    expect(await apply(db, "pi_fail2", "failed")).toBeNull();
  });
});

describe("claim_staff_new_order_notice", () => {
  it("does not announce an order that is no longer live", async () => {
    const db = await setup();
    const orderId = await onlineOrder(db, "NY-LATE01", "pi_late1");
    await db.exec(`update orders set status = 'cancelled', cancelled_reason = 'payment_timeout' where id = '${orderId}'`);

    // The customer paid after the sweep: the money is owed back, not cooked.
    expect(await apply(db, "pi_late1", "paid")).toBe(orderId);
    expect(await scalar<boolean>(db, `select needs_refund from payments where order_id = '${orderId}'`)).toBe(true);
    expect(await scalar<boolean>(db, `select claim_staff_new_order_notice('${orderId}')`)).toBe(false);
  });

  it("still announces a live order exactly once", async () => {
    const db = await setup();
    const orderId = await onlineOrder(db, "NY-LIVE01", "pi_live1");
    expect(await scalar<boolean>(db, `select claim_staff_new_order_notice('${orderId}')`)).toBe(true);
    expect(await scalar<boolean>(db, `select claim_staff_new_order_notice('${orderId}')`)).toBe(false);
  });
});

const paidEvent = (amount: number | string, currency = "PHP") =>
  JSON.stringify({
    data: {
      id: "evt_1",
      attributes: {
        type: "payment.paid",
        livemode: false,
        data: { id: "pay_1", attributes: { amount, currency, status: "paid", payment_intent_id: "pi_amt" } },
      },
    },
  });

describe("apply_paymongo_payment checks the amount PayMongo reports", () => {
  let db: PGlite;
  let orderId: string;
  beforeEach(async () => {
    db = await setup();
    orderId = await onlineOrder(db, "NY-AMT1", "pi_amt");
  }, 120_000);

  const applyEvent = (body: string) =>
    db.query<{ id: string | null }>(
      "select apply_paymongo_payment('pi_amt', 'paid', 'pay_1', $1::jsonb)::text as id",
      [body],
    ).then((result) => result.rows[0]?.id ?? null);

  it("marks the payment paid when the amount and currency match", async () => {
    expect(await applyEvent(paidEvent(32900))).toBe(orderId);
    expect(await scalar(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("paid");
  });

  it("refuses a smaller amount, keeps the payment unpaid, and records why", async () => {
    expect(await applyEvent(paidEvent(100))).toBeNull();
    expect(await scalar(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("pending");
    expect(
      await scalar(
        db,
        `select diff->>'received_amount' from audit_logs where action = 'payment.amount_mismatch' and target_id = '${orderId}'`,
      ),
    ).toBe("100");
  });

  it("refuses another currency and an amount that is not a whole number", async () => {
    expect(await applyEvent(paidEvent(32900, "USD"))).toBeNull();
    expect(await applyEvent(paidEvent("329.00"))).toBeNull();
    expect(await scalar(db, `select status::text from payments where order_id = '${orderId}'`)).toBe("pending");
  });
});
