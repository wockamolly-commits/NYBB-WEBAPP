import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const STAFF_ID = "72000000-0000-4000-8000-000000000001";
const OTHER_BRANCH_ID = "72000000-0000-4000-8000-000000000099";

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
    /** Active orders are unique on this, so a test wanting two must say so. */
    pickupCode?: string;
  } = {},
) {
  const status = options.status ?? "pending";
  const method = options.method ?? "counter";
  const paymentStatus = options.paymentStatus ?? "due";
  const branch = options.branch ?? "pilot";
  const pickupCode = options.pickupCode ?? "2468";
  await db.exec(`
    insert into orders
      (short_code, status, branch_id, price_list_id, pickup_code,
       customer_name, customer_phone, total_cents)
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCode}',
           'Customer', '09170000000', 32900
    from branches b where b.slug = '${branch}';
    insert into payments (order_id, method, status, amount_cents)
    select id, '${method}', '${paymentStatus}', total_cents
    from orders where short_code = '${code}';
  `);
  return scalar<string>(db, `select id::text from orders where short_code = '${code}'`);
}

describe("staff_set_order_status", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("is exposed only to authenticated staff sessions", async () => {
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('authenticated',
          'staff_set_order_status(uuid, order_status, text)', 'execute')`,
      ),
    ).toBe(true);
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('anon',
          'staff_set_order_status(uuid, order_status, text)', 'execute')`,
      ),
    ).toBe(false);
  });

  it("starts an order in one call with both lifecycle events and one audit row", async () => {
    const id = await addOrder(db, "NY-START1");
    await db.exec(`select staff_set_order_status('${id}', 'preparing', null)`);

    expect(await scalar<string>(db, `select status::text from orders where id = '${id}'`)).toBe(
      "preparing",
    );
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from order_status_events where order_id = '${id}'`,
      ),
    ).toBe(2);
    expect(
      await scalar<string>(
        db,
        `select action from audit_logs where target_id = '${id}'`,
      ),
    ).toBe("order.started");
    expect(
      await scalar<boolean>(
        db,
        `select accepted_at is not null and preparing_at is not null
         from orders where id = '${id}'`,
      ),
    ).toBe(true);
  });

  it("does not let a replay advance the order again", async () => {
    const id = await addOrder(db, "NY-REPLAY");
    await db.exec(`select staff_set_order_status('${id}', 'preparing', null)`);
    await db.exec(`select staff_set_order_status('${id}', 'preparing', null)`);
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from audit_logs where target_id = '${id}'`,
      ),
    ).toBe(1);
  });

  it("blocks an unpaid online order from entering preparation", async () => {
    const id = await addOrder(db, "NY-UNPAID", {
      method: "gcash",
      paymentStatus: "pending",
    });
    await expect(
      db.exec(`select staff_set_order_status('${id}', 'preparing', null)`),
    ).rejects.toThrow(/PAYMENT_REQUIRED/);
  });

  it("honors an explicit orders permission denial", async () => {
    const id = await addOrder(db, "NY-DENIED");
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'orders:manage', false)
    `);
    await expect(
      db.exec(`select staff_set_order_status('${id}', 'preparing', null)`),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  /**
   * 0024 moved this function from "has this person been denied orders:manage"
   * to "does this person have it", which is the question every RLS policy asks
   * through current_staff_has_permission(). The two agree while both job
   * roles carry the permission by default, so the tests below lock down what
   * has to keep being true rather than reproducing a break that is not
   * reachable yet: every role that should be able to work the board still can,
   * the resolver and the transition give the same answer for the same person,
   * and the function is genuinely asking the resolver.
   */
  it("lets every job role that should work the board still work it", async () => {
    const roles = ["cashier", "manager"];
    for (const [index, role] of roles.entries()) {
      const id = await addOrder(db, `NY-ROLE-${role.slice(0, 3).toUpperCase()}`, {
        pickupCode: `100${index}`,
      });
      await db.exec(
        `update profiles set staff_role = '${role}' where id = '${STAFF_ID}'`,
      );
      await db.exec(`select staff_set_order_status('${id}', 'preparing', null)`);
      expect(
        await scalar<string>(db, `select status::text from orders where id = '${id}'`),
      ).toBe("preparing");
    }
  });

  it("gives the same answer as the resolver every policy reads", async () => {
    const id = await addOrder(db, "NY-AGREE1");

    const allowedBefore = await scalar<boolean>(
      db,
      `select current_staff_has_permission('orders:manage')`,
    );
    expect(allowedBefore).toBe(true);
    await db.exec(`select staff_set_order_status('${id}', 'preparing', null)`);

    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${STAFF_ID}', 'orders:manage', false)
    `);
    expect(
      await scalar<boolean>(db, `select current_staff_has_permission('orders:manage')`),
    ).toBe(false);
    await expect(
      db.exec(`select staff_set_order_status('${id}', 'ready', null)`),
    ).rejects.toThrow(/FORBIDDEN/);

    // Restoring the permission restores the transition, so the refusal above
    // was the resolver's answer and not a one-way latch.
    await db.exec(`
      update staff_permission_overrides set granted = true
      where profile_id = '${STAFF_ID}' and permission = 'orders:manage'
    `);
    await db.exec(`select staff_set_order_status('${id}', 'ready', null)`);
    expect(
      await scalar<string>(db, `select status::text from orders where id = '${id}'`),
    ).toBe("ready");
  });

  it("asks the shared resolver rather than hand-rolling the lookup again", async () => {
    // A source-level tripwire, deliberately. Reintroducing the old check would
    // pass every behavioural test above until a role without orders:manage is
    // added, and by then the database and the application would already
    // disagree about who may touch a live order.
    const source = await scalar<string>(
      db,
      `select prosrc from pg_proc where proname = 'staff_set_order_status'`,
    );
    expect(source).toContain("current_staff_has_permission('orders:manage')");
    expect(source).not.toContain("from staff_permission_overrides");
  });

  it("keeps branch-scoped staff inside their branch", async () => {
    const id = await addOrder(db, "NY-OTHER1", { branch: "other" });
    await db.exec(`
      update profiles set branch_id = (
        select id from branches where slug = 'pilot'
      ) where id = '${STAFF_ID}'
    `);
    await expect(
      db.exec(`select staff_set_order_status('${id}', 'preparing', null)`),
    ).rejects.toThrow(/FORBIDDEN_BRANCH/);
  });

  it("requires the pickup code and captures counter payment when claimed", async () => {
    const id = await addOrder(db, "NY-CLAIM1", { status: "preparing" });
    await db.exec(`select staff_set_order_status('${id}', 'ready', null)`);
    await expect(
      db.exec(`select staff_set_order_status('${id}', 'claimed', '9999')`),
    ).rejects.toThrow(/PICKUP_CODE_INVALID/);
    await db.exec(`select staff_set_order_status('${id}', 'claimed', '2468')`);

    expect(await scalar<string>(db, `select status::text from orders where id = '${id}'`)).toBe(
      "claimed",
    );
    expect(
      await scalar<string>(
        db,
        `select status::text from payments where order_id = '${id}'`,
      ),
    ).toBe("paid");
    expect(
      await scalar<boolean>(
        db,
        `select claimed_at is not null and claimed_by_profile_id = '${STAFF_ID}'
         from orders where id = '${id}'`,
      ),
    ).toBe(true);
    expect(
      await scalar<string>(
        db,
        `select action from audit_logs where target_id = '${id}' order by id desc limit 1`,
      ),
    ).toBe("order.claimed");
  });
});
