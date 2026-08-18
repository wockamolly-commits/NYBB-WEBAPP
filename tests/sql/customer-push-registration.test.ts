import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const STAFF = "76000000-0000-4000-8000-000000000001";
const CUSTOMER = "76000000-0000-4000-8000-000000000002";
const OTHER_CUSTOMER = "76000000-0000-4000-8000-000000000003";

const ENDPOINT = "https://push.example/customer-a";
const P256DH = "p256dh-key";
const AUTH = "auth-key";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${STAFF}', 'staff@example.com'),
      ('${CUSTOMER}', 'customer@example.com'),
      ('${OTHER_CUSTOMER}', 'other@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${STAFF}', 'staff', 'manager', 'Manager', b.id
    from branches b where b.slug = 'pilot';
  `);
  return db;
}

let pickupCodeCounter = 2000;

async function addOrder(db: PGlite, code: string, status = "ready", userId: string | null = null) {
  pickupCodeCounter += 1;
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, user_id
    )
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCodeCounter}',
           'Customer', '09170000000', 32900, ${userId ? `'${userId}'` : "null"}
    from branches b where b.slug = 'pilot'
    returning id::text
  `);
}

async function tokenFor(db: PGlite, code: string) {
  return scalar<string>(db, `select tracking_token::text from orders where short_code = '${code}'`);
}

async function actAs(db: PGlite, id: string | null) {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select ${id ? `'${id}'::uuid` : "null::uuid"} $$;
  `);
}

async function register(
  db: PGlite,
  code: string,
  token: string | null,
  endpoint = ENDPOINT,
) {
  return scalar<boolean>(db, `
    select register_customer_push_subscription(
      '${code}', ${token ? `'${token}'` : "null"}, '${endpoint}', '${P256DH}', '${AUTH}'
    )
  `);
}

describe("register_customer_push_subscription", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await actAs(db, null);
  });

  it("registers a web subscription against the order the token proves", async () => {
    await addOrder(db, "NY-CWP001");
    expect(await register(db, "NY-CWP001", await tokenFor(db, "NY-CWP001"))).toBe(true);
    expect(await scalar<string>(db, `
      select transport from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("web");
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where order_code = 'NY-CWP001'
    `)).toBe(1);
  });

  it("refuses a wrong tracking token", async () => {
    await addOrder(db, "NY-CWP002");
    const wrong = "11111111-1111-4111-8111-111111111111";
    expect(await register(db, "NY-CWP002", wrong)).toBe(false);
  });

  it("refuses a malformed token without raising", async () => {
    await addOrder(db, "NY-CWP003");
    expect(await register(db, "NY-CWP003", "not-a-uuid")).toBe(false);
  });

  it("registers a signed-in owner carrying no token at all", async () => {
    await addOrder(db, "NY-CWP004", "ready", CUSTOMER);
    await actAs(db, CUSTOMER);
    expect(await register(db, "NY-CWP004", null)).toBe(true);
  });

  it("refuses a signed-in caller who neither owns the order nor holds a token", async () => {
    await addOrder(db, "NY-CWP005", "ready", CUSTOMER);
    await actAs(db, OTHER_CUSTOMER);
    expect(await register(db, "NY-CWP005", null)).toBe(false);
  });

  it("refuses a terminal order, which has nothing left to announce", async () => {
    await addOrder(db, "NY-CWP006", "claimed");
    expect(await register(db, "NY-CWP006", await tokenFor(db, "NY-CWP006"))).toBe(false);
  });

  it("is idempotent for the same device and order", async () => {
    await addOrder(db, "NY-CWP007");
    const token = await tokenFor(db, "NY-CWP007");
    expect(await register(db, "NY-CWP007", token)).toBe(true);
    expect(await register(db, "NY-CWP007", token)).toBe(true);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(1);
  });

  it("keeps one device row while following a second order", async () => {
    await addOrder(db, "NY-CWP008");
    await addOrder(db, "NY-CWP009");
    await register(db, "NY-CWP008", await tokenFor(db, "NY-CWP008"));
    await register(db, "NY-CWP009", await tokenFor(db, "NY-CWP009"));
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(2);
  });

  // THE CASE THIS FUNCTION EXISTS TO PREVENT. push_subscriptions is unique on
  // endpoint, and 0038's customer insert upserts blindly, so a staff member
  // opening their own order on the counter tablet would flip that tablet's row
  // to audience = 'customer'. staff_push_targets filters on audience = 'staff',
  // so the tablet would go quiet with nothing anywhere saying why.
  it("refuses an endpoint that already belongs to staff, and leaves that row intact", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values ('staff', '${STAFF}', 'web', '${ENDPOINT}', 'staff-key', 'staff-auth')
    `);
    await addOrder(db, "NY-CWP010");

    expect(await register(db, "NY-CWP010", await tokenFor(db, "NY-CWP010"))).toBe(false);

    expect(await scalar<string>(db, `
      select audience from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("staff");
    expect(await scalar<string>(db, `
      select p256dh from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("staff-key");
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where endpoint = '${ENDPOINT}'
    `)).toBe(0);
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  // has_function_privilege rather than information_schema, matching
  // tests/sql/push-registration.test.ts. It answers the question directly and
  // is owner-agnostic, where a grantee listing has to filter the owner role by
  // name and goes red if PGlite names it differently.
  it("exposes registration to the roles that need it and no others", async () => {
    const signature =
      "register_customer_push_subscription(text, text, text, text, text)";
    const check = async (role: string) =>
      scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

    expect(await check("anon")).toBe(true);
    expect(await check("authenticated")).toBe(true);
    // Not service_role: the dispatch path reads subscriptions directly and has
    // no reason to register one.
    expect(await check("service_role")).toBe(false);
  });
});
