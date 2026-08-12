import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Rejecting an order, in the database.
 *
 * The interesting claims are not "does the status change". They are the three
 * things a branch cannot undo by hand afterwards: the pickup window has to go
 * back into circulation, a payment that was already taken has to be marked as
 * owed rather than quietly kept, and the reason has to survive as a code
 * because a customer is going to read a sentence built from it.
 */

const STAFF_ID = "73000000-0000-4000-8000-000000000001";
const OTHER_BRANCH_ID = "73000000-0000-4000-8000-000000000099";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email)
    values ('${STAFF_ID}', 'cashier@example.com');
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${STAFF_ID}'::uuid $$;

    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches
      (id, slug, name, short_name, format, price_list_id, address_line, city)
    select '${OTHER_BRANCH_ID}', 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches
      (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';

    insert into profiles (id, role, staff_role, display_name)
    values ('${STAFF_ID}', 'staff', 'cashier', 'Cashier');
  `);
  return db;
}

async function addOrder(
  db: PGlite,
  code: string,
  options: {
    status?: string;
    method?: string;
    paymentStatus?: string;
    branch?: string;
    pickupCode?: string;
    withSlot?: boolean;
  } = {},
) {
  const status = options.status ?? "pending";
  const method = options.method ?? "qrph";
  const paymentStatus = options.paymentStatus ?? "pending";
  const branch = options.branch ?? "pilot";
  const pickupCode = options.pickupCode ?? "2468";

  if (options.withSlot) {
    await db.exec(`
      insert into pickup_slots (branch_id, slot_start, capacity, reserved)
      select b.id, now() + interval '1 hour', 4, 1
      from branches b where b.slug = '${branch}';
    `);
  }

  await db.exec(`
    insert into orders
      (short_code, status, branch_id, price_list_id, pickup_code,
       customer_name, customer_phone, total_cents, pickup_slot_id)
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCode}',
           'Customer', '09170000000', 32900,
           ${options.withSlot ? "(select id from pickup_slots order by slot_start desc limit 1)" : "null"}
    from branches b where b.slug = '${branch}';
    insert into payments (order_id, method, status, amount_cents)
    select id, '${method}', '${paymentStatus}', total_cents
    from orders where short_code = '${code}';
  `);
  return scalar<string>(db, `select id::text from orders where short_code = '${code}'`);
}

describe("staff_reject_order", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("is exposed only to authenticated staff sessions", async () => {
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('authenticated',
          'staff_reject_order(uuid, text)', 'execute')`,
      ),
    ).toBe(true);
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('anon', 'staff_reject_order(uuid, text)', 'execute')`,
      ),
    ).toBe(false);
  });

  it("rejects an unpaid order and gives the pickup window back", async () => {
    const id = await addOrder(db, "NY-REJ001", { withSlot: true });
    await db.exec(`select staff_reject_order('${id}', 'sold_out')`);

    expect(await scalar<string>(db, `select status::text from orders where id = '${id}'`)).toBe(
      "rejected",
    );
    expect(
      await scalar<string>(db, `select rejected_reason from orders where id = '${id}'`),
    ).toBe("sold_out");
    expect(
      await scalar<string | null>(db, `select pickup_slot_id::text from orders where id = '${id}'`),
    ).toBeNull();
    // The window is capacity the branch has refused. Leaving it reserved means
    // turning away the next customer for an order nobody is making.
    expect(await scalar<number>(db, `select reserved from pickup_slots limit 1`)).toBe(0);
  });

  it("stores the code and never a sentence", async () => {
    // The customer's tracking page builds the sentence from this value. A row
    // holding prose would mean wording that cannot be changed without a
    // migration, and an internal note reaching a customer.
    const id = await addOrder(db, "NY-REJ002");
    await db.exec(`select staff_reject_order('${id}', 'too_busy')`);
    const reason = await scalar<string>(db, `select rejected_reason from orders where id = '${id}'`);
    expect(reason).toBe("too_busy");
    expect(reason).not.toMatch(/\s/);
  });

  it("refuses a reason that is not on the list", async () => {
    const id = await addOrder(db, "NY-REJ003");
    await expect(
      db.exec(`select staff_reject_order('${id}', 'cust was rude')`),
    ).rejects.toThrow(/REJECT_REASON_INVALID/);
    await expect(db.exec(`select staff_reject_order('${id}', null)`)).rejects.toThrow(
      /REJECT_REASON_INVALID/,
    );
    expect(await scalar<string>(db, `select status::text from orders where id = '${id}'`)).toBe(
      "pending",
    );
  });

  it("marks a paid order as owing a refund without issuing one", async () => {
    // The owner's ruling: rejecting and refunding are two deliberate steps.
    // This one only records the debt.
    const id = await addOrder(db, "NY-REJ004", { paymentStatus: "paid" });
    await db.exec(`select staff_reject_order('${id}', 'closing')`);

    expect(
      await scalar<boolean>(db, `select needs_refund from payments where order_id = '${id}'`),
    ).toBe(true);
    expect(
      await scalar<number>(db, `select count(*)::int from refunds where order_id = '${id}'`),
    ).toBe(0);
    expect(
      await scalar<string>(db, `select status::text from payments where order_id = '${id}'`),
    ).toBe("paid");
  });

  it("does not claim a refund is owed when nothing was taken", async () => {
    const id = await addOrder(db, "NY-REJ005", { paymentStatus: "pending" });
    await db.exec(`select staff_reject_order('${id}', 'sold_out')`);
    expect(
      await scalar<boolean>(db, `select needs_refund from payments where order_id = '${id}'`),
    ).toBe(false);
  });

  it("can refuse an order at any point before it is handed over", async () => {
    for (const [index, status] of ["pending", "accepted", "preparing", "ready"].entries()) {
      const id = await addOrder(db, `NY-REJS0${index}`, {
        status,
        pickupCode: `100${index}`,
      });
      await db.exec(`select staff_reject_order('${id}', 'sold_out')`);
      expect(
        await scalar<string>(db, `select status::text from orders where id = '${id}'`),
        status,
      ).toBe("rejected");
    }
  });

  it("will not refuse an order that has already been eaten", async () => {
    // After a handover this is a refund conversation, not a status change.
    const id = await addOrder(db, "NY-REJ006", { status: "claimed" });
    await expect(db.exec(`select staff_reject_order('${id}', 'sold_out')`)).rejects.toThrow(
      /INVALID_TRANSITION/,
    );
  });

  it("treats a second rejection as the same rejection", async () => {
    const id = await addOrder(db, "NY-REJ007", { withSlot: true });
    await db.exec(`select staff_reject_order('${id}', 'sold_out')`);
    await db.exec(`select staff_reject_order('${id}', 'too_busy')`);

    // One trail, one release. A replay that decremented the slot again would
    // hand the same capacity out twice.
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from order_status_events where order_id = '${id}' and to_status = 'rejected'`,
      ),
    ).toBe(1);
    expect(await scalar<number>(db, `select reserved from pickup_slots limit 1`)).toBe(0);
    expect(
      await scalar<string>(db, `select rejected_reason from orders where id = '${id}'`),
    ).toBe("sold_out");
  });

  it("leaves a lifecycle event and one audit row naming the branch", async () => {
    const id = await addOrder(db, "NY-REJ008", { paymentStatus: "paid" });
    await db.exec(`select staff_reject_order('${id}', 'sold_out')`);

    expect(
      await scalar<string>(
        db,
        `select reason from order_status_events where order_id = '${id}' and to_status = 'rejected'`,
      ),
    ).toBe("sold_out");
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from audit_logs where action = 'order.rejected' and target_id = '${id}'`,
      ),
    ).toBe(1);
    expect(
      await scalar<boolean>(
        db,
        `select (diff->>'owesRefund')::boolean from audit_logs where action = 'order.rejected' and target_id = '${id}'`,
      ),
    ).toBe(true);
  });

  it("will not let a branch refuse another branch's order", async () => {
    await db.exec(`
      update profiles set branch_id = (select id from branches where slug = 'pilot')
      where id = '${STAFF_ID}';
    `);
    const id = await addOrder(db, "NY-REJ009", { branch: "other", pickupCode: "3579" });
    await expect(db.exec(`select staff_reject_order('${id}', 'sold_out')`)).rejects.toThrow(
      /FORBIDDEN_BRANCH/,
    );
  });

  it("refuses a staff member whose role does not carry orders:manage", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'orders:manage', false);
    `);
    const id = await addOrder(db, "NY-REJ010");
    await expect(db.exec(`select staff_reject_order('${id}', 'sold_out')`)).rejects.toThrow(
      /FORBIDDEN/,
    );
  });
});
