import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const MANAGER = "75000000-0000-4000-8000-000000000001";
const OTHER_BRANCH_STAFF = "75000000-0000-4000-8000-000000000002";
const CUSTOMER = "75000000-0000-4000-8000-000000000003";
const OTHER_CUSTOMER = "75000000-0000-4000-8000-000000000004";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER}', 'manager@example.com'),
      ('${OTHER_BRANCH_STAFF}', 'other@example.com'),
      ('${CUSTOMER}', 'customer@example.com'),
      ('${OTHER_CUSTOMER}', 'other-customer@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', b.id
    from branches b where b.slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${OTHER_BRANCH_STAFF}', 'staff', 'manager', 'Other', b.id
    from branches b where b.slug = 'other';
  `);
  return db;
}

// A monotonic 4-digit code per call. orders_active_pickup_code_key (0005)
// allows only one active order per branch per pickup code, and more than one
// test here places two active orders in the same branch.
let pickupCodeCounter = 1000;

async function addOrder(db: PGlite, code: string, branch = "pilot", status = "ready") {
  pickupCodeCounter += 1;
  const pickupCode = String(pickupCodeCounter);
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents
    )
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCode}',
           'Customer', '09170000000', 32900
    from branches b where b.slug = '${branch}'
    returning id::text
  `);
}

async function addOrderForUser(
  db: PGlite,
  code: string,
  userId: string,
  branch = "pilot",
  status = "ready",
) {
  pickupCodeCounter += 1;
  const pickupCode = String(pickupCodeCounter);
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, user_id
    )
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCode}',
           'Customer', '09170000000', 32900, '${userId}'
    from branches b where b.slug = '${branch}'
    returning id::text
  `);
}

async function tokenFor(db: PGlite, code: string) {
  return scalar<string>(db, `select tracking_token::text from orders where short_code = '${code}'`);
}

async function actAs(db: PGlite, id: string) {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
  `);
}

describe("push_subscriptions transport", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("accepts a web row carrying both keys", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values ('staff', '${MANAGER}', 'web', 'https://push.example/a', 'key', 'auth')
    `);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });

  it("accepts an expo row carrying neither key", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, transport, endpoint)
      values ('customer', 'expo', 'ExponentPushToken[aaa]')
    `);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });

  it("rejects a web row missing its keys", async () => {
    await expect(db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint)
      values ('staff', '${MANAGER}', 'web', 'https://push.example/b')
    `)).rejects.toThrow();
  });

  it("rejects an expo row carrying keys it cannot have", async () => {
    await expect(db.exec(`
      insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key)
      values ('customer', 'expo', 'ExponentPushToken[bbb]', 'key', 'auth')
    `)).rejects.toThrow();
  });
});

describe("register_customer_push_device", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("registers a device against the order the token proves", async () => {
    await addOrder(db, "NY-AAA111");
    const token = await tokenFor(db, "NY-AAA111");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-AAA111', '${token}', 'ExponentPushToken[one]', 'ios'
      )
    `);
    expect(ok).toBe(true);
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where order_code = 'NY-AAA111'
    `)).toBe(1);
  });

  it("refuses a wrong tracking token", async () => {
    await addOrder(db, "NY-BBB222");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-BBB222', '00000000-0000-4000-8000-000000000000',
        'ExponentPushToken[two]', 'android'
      )
    `);
    expect(ok).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(0);
  });

  it("refuses a malformed token without raising", async () => {
    await addOrder(db, "NY-CCC333");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-CCC333', 'not-a-uuid', 'ExponentPushToken[three]', 'ios'
      )
    `);
    expect(ok).toBe(false);
  });

  it("refuses a terminal order, which has nothing left to announce", async () => {
    await addOrder(db, "NY-DDD444", "pilot", "claimed");
    const token = await tokenFor(db, "NY-DDD444");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-DDD444', '${token}', 'ExponentPushToken[four]', 'ios'
      )
    `);
    expect(ok).toBe(false);
  });

  // The reference project's real bug: a returning customer had no live
  // registration for the new order, so background alerts never arrived.
  it("keeps one device row while following a second order", async () => {
    await addOrder(db, "NY-EEE555");
    await addOrder(db, "NY-FFF666");
    for (const code of ["NY-EEE555", "NY-FFF666"]) {
      const token = await tokenFor(db, code);
      await db.exec(`
        select register_customer_push_device(
          '${code}', '${token}', 'ExponentPushToken[same]', 'android'
        )
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(2);
  });

  it("is idempotent for the same device and order", async () => {
    await addOrder(db, "NY-GGG777");
    const token = await tokenFor(db, "NY-GGG777");
    for (let i = 0; i < 3; i += 1) {
      await db.exec(`
        select register_customer_push_device(
          'NY-GGG777', '${token}', 'ExponentPushToken[dup]', 'ios'
        )
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(1);
  });

  // 0042: the same owner fallback get_order_by_tracking (0014) and
  // customer_mark_order_arrived (0029) already carry, so a signed-in customer
  // with no tracking token in hand (account history, once it exists) is not
  // stuck behind a credential they were never given.
  it("registers a signed-in owner with no tracking token", async () => {
    await addOrderForUser(db, "NY-HHH888", CUSTOMER);
    await actAs(db, CUSTOMER);
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-HHH888', null, 'ExponentPushToken[owner]', 'ios'
      )
    `);
    expect(ok).toBe(true);
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where order_code = 'NY-HHH888'
    `)).toBe(1);
  });

  it("refuses a signed-in caller who does not own the order and holds no token", async () => {
    await addOrderForUser(db, "NY-III999", CUSTOMER);
    await actAs(db, OTHER_CUSTOMER);
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-III999', null, 'ExponentPushToken[intruder]', 'ios'
      )
    `);
    expect(ok).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(0);
  });
});

describe("register_staff_push_subscription", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("registers a signed-in staff tablet", async () => {
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t1', 'key', 'auth')
    `);
    expect(ok).toBe(true);
    expect(await scalar<string>(db, `
      select profile_id::text from push_subscriptions where endpoint = 'https://push.example/t1'
    `)).toBe(MANAGER);
  });

  it("refuses a deactivated profile", async () => {
    await db.exec(`update profiles set is_active = false where id = '${MANAGER}'`);
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t2', 'key', 'auth')
    `);
    expect(ok).toBe(false);
  });

  it("refuses a staff member denied orders:view", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${MANAGER}', 'orders:view', false)
    `);
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t3', 'key', 'auth')
    `);
    expect(ok).toBe(false);
  });

  it("updates rather than duplicating on re-registration", async () => {
    await actAs(db, MANAGER);
    for (let i = 0; i < 3; i += 1) {
      await db.exec(`
        select register_staff_push_subscription('https://push.example/t4', 'key', 'auth')
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });
});

describe("staff_push_targets", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values
        ('staff', '${MANAGER}', 'web', 'https://push.example/pilot', 'k1', 'a1'),
        ('staff', '${OTHER_BRANCH_STAFF}', 'web', 'https://push.example/other', 'k2', 'a2')
    `);
  });

  it("returns the branch's staff and excludes another branch's", async () => {
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows.map((r) => r.endpoint)).toEqual(["https://push.example/pilot"]);
  });

  it("includes an unassigned profile, which is business wide", async () => {
    await db.exec(`update profiles set branch_id = null where id = '${OTHER_BRANCH_STAFF}'`);
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows.map((r) => r.endpoint).sort()).toEqual([
      "https://push.example/other",
      "https://push.example/pilot",
    ]);
  });

  it("drops a deactivated staff member immediately", async () => {
    await db.exec(`update profiles set is_active = false where id = '${MANAGER}'`);
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows).toHaveLength(0);
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("exposes registration to the roles that need it and no others", async () => {
    const check = async (role: string, signature: string) =>
      scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

    expect(await check("anon", "register_customer_push_device(text, text, text, text)")).toBe(true);
    expect(await check("anon", "register_staff_push_subscription(text, text, text)")).toBe(false);
    expect(await check("anon", "staff_push_targets(uuid)")).toBe(false);
    expect(await check("authenticated", "staff_push_targets(uuid)")).toBe(false);
    expect(await check("service_role", "staff_push_targets(uuid)")).toBe(true);
  });

  it("leaves the three tables unreadable by anon and authenticated", async () => {
    for (const table of ["push_subscriptions", "push_subscription_orders", "notifications"]) {
      for (const role of ["anon", "authenticated"]) {
        expect(
          await scalar<boolean>(db, `select has_table_privilege('${role}', '${table}', 'select')`),
        ).toBe(false);
      }
    }
  });
});
