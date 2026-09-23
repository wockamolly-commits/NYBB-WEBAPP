import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over promo push, migrations 0075.
 *
 * The property being defended here is that two consents stay two consents.
 * Agreeing to "tell me when my food is ready" is not agreeing to hear about a
 * discount next Tuesday, and the failure mode is not an error message: it is a
 * shop that quietly mails people who never said yes. So the tests that matter
 * most are the crossing ones, in both directions. Registering for promos must
 * write no order follow, registering for an order must write no promo consent,
 * and unsubscribing from promos must leave a waiting customer still being told
 * about their wings.
 *
 * The second property is the one 0047 was written for. push_subscriptions is
 * keyed by endpoint, so any new write path into it can steal a counter
 * tablet's row and drop it out of staff_push_targets, which silences the
 * kitchen. Every such path has to repeat the audience guard, and this proves
 * the new one does.
 */

const STAFF = "79000000-0000-4000-8000-000000000001";
const CUSTOMER = "79000000-0000-4000-8000-000000000002";

const ENDPOINT = "https://push.example/promo-a";
const TABLET = "https://push.example/counter-tablet";
const P256DH = "p256dh-key";
const AUTH = "auth-key";

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${STAFF}', 'staff@example.com'),
      ('${CUSTOMER}', 'customer@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${STAFF}', 'staff', 'manager', 'Manager', b.id
    from branches b where b.slug = 'pilot';
    update app_settings set vouchers_enabled = true where id = 1;
  `);
  return db;
}

function optIn(db: PGlite, endpoint = ENDPOINT): Promise<boolean> {
  return scalar<boolean>(
    db,
    `select register_promo_push_subscription('${endpoint}', '${P256DH}', '${AUTH}')`,
  );
}

function countOf(db: PGlite, sql: string): Promise<number> {
  return scalar<number>(db, sql).then(Number);
}

describe("opting in to promos", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("creates a customer subscription for somebody who has never ordered", async () => {
    // The reason this function exists at all. 0047 needs a short code and a
    // tracking token, and a person reading a poster has neither.
    expect(await optIn(db)).toBe(true);
    const rows = await db.query<{ audience: string; transport: string; profile_id: string | null }>(
      `select audience, transport, profile_id from push_subscriptions where endpoint = '${ENDPOINT}'`,
    );
    expect(rows.rows[0].audience).toBe("customer");
    expect(rows.rows[0].transport).toBe("web");
    // push_subscriptions_audience_target (0007) requires this to be null.
    expect(rows.rows[0].profile_id).toBeNull();
  });

  it("records the consent", async () => {
    await optIn(db);
    expect(
      await countOf(db, `select count(*) from push_promo_optins where endpoint = '${ENDPOINT}'`),
    ).toBe(1);
  });

  it("follows no orders, because that is a different consent", async () => {
    await optIn(db);
    expect(await countOf(db, "select count(*) from push_subscription_orders")).toBe(0);
  });

  it("is idempotent and keeps the original consent date", async () => {
    await optIn(db);
    const first = await scalar<string>(
      db,
      `select opted_in_at::text from push_promo_optins where endpoint = '${ENDPOINT}'`,
    );
    expect(await optIn(db)).toBe(true);
    const second = await scalar<string>(
      db,
      `select opted_in_at::text from push_promo_optins where endpoint = '${ENDPOINT}'`,
    );
    // When consent was given is the fact worth keeping. Re-registering a
    // browser is not a new agreement.
    expect(second).toBe(first);
  });

  it("refuses a blank endpoint or a missing key rather than writing a useless row", async () => {
    expect(
      await scalar<boolean>(db, `select register_promo_push_subscription('', '${P256DH}', '${AUTH}')`),
    ).toBe(false);
    expect(
      await scalar<boolean>(db, `select register_promo_push_subscription('${ENDPOINT}', '', '${AUTH}')`),
    ).toBe(false);
    expect(await countOf(db, "select count(*) from push_promo_optins")).toBe(0);
  });
});

describe("the flag", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("refuses consent while the engine is dark", async () => {
    // A subscriber list gathered while vouchers were off would be a list of
    // people who agreed to an offer the shop was not making.
    await db.exec("update app_settings set vouchers_enabled = false where id = 1");
    expect(await optIn(db)).toBe(false);
    expect(await countOf(db, "select count(*) from push_promo_optins")).toBe(0);
  });
});

describe("the counter tablet", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await db.exec(`
      insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key, profile_id)
      values ('staff', 'web', '${TABLET}', 'tablet-key', 'tablet-auth', '${STAFF}');
    `);
  });

  it("is not stolen by a staff member opening the promos page on it", async () => {
    // 0047 exists because exactly this rewrote a tablet's row and dropped it
    // out of staff_push_targets, so the kitchen stopped hearing about orders.
    // Any new write path into push_subscriptions has to repeat the guard.
    expect(await optIn(db, TABLET)).toBe(false);
  });

  it("keeps its audience, its keys and its profile", async () => {
    await optIn(db, TABLET);
    const rows = await db.query<{ audience: string; p256dh: string; profile_id: string }>(
      `select audience, p256dh, profile_id from push_subscriptions where endpoint = '${TABLET}'`,
    );
    expect(rows.rows[0].audience).toBe("staff");
    expect(rows.rows[0].p256dh).toBe("tablet-key");
    expect(rows.rows[0].profile_id).toBe(STAFF);
  });

  it("gains no promo consent", async () => {
    await optIn(db, TABLET);
    expect(await countOf(db, "select count(*) from push_promo_optins")).toBe(0);
  });
});

describe("opting out", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await optIn(db);
  });

  it("drops the consent", async () => {
    expect(
      await scalar<boolean>(db, `select forget_promo_push_subscription('${ENDPOINT}')`),
    ).toBe(true);
    expect(await countOf(db, "select count(*) from push_promo_optins")).toBe(0);
  });

  it("leaves the subscription itself alone", async () => {
    // Somebody turning promos off while their order is being cooked still
    // wants to know when it is ready.
    await scalar(db, `select forget_promo_push_subscription('${ENDPOINT}')`);
    expect(
      await countOf(db, `select count(*) from push_subscriptions where endpoint = '${ENDPOINT}'`),
    ).toBe(1);
  });

  it("is true even when there was nothing to drop, so a retry is not a failure", async () => {
    await scalar(db, `select forget_promo_push_subscription('${ENDPOINT}')`);
    expect(
      await scalar<boolean>(db, `select forget_promo_push_subscription('${ENDPOINT}')`),
    ).toBe(true);
  });

  it("goes with the device when the subscription is removed", async () => {
    await db.exec(`delete from push_subscriptions where endpoint = '${ENDPOINT}'`);
    expect(await countOf(db, "select count(*) from push_promo_optins")).toBe(0);
  });
});

describe("who gets sent to", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("is everybody who opted in, and only them", async () => {
    await optIn(db);
    await db.exec(`
      insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key)
      values ('customer', 'web', 'https://push.example/order-only', 'k', 'a');
    `);
    const rows = await db.query<{ endpoint: string }>("select endpoint from promo_push_targets()");
    expect(rows.rows.map((r) => r.endpoint)).toEqual([ENDPOINT]);
  });

  it("never reaches a counter tablet", async () => {
    await optIn(db);
    await db.exec(`
      insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key, profile_id)
      values ('staff', 'web', '${TABLET}', 'k', 'a', '${STAFF}');
      insert into push_promo_optins (endpoint) values ('${TABLET}');
    `);
    // Even with a consent row forced in behind the function's back, the
    // audience filter is what decides. A promo on the order board would be
    // read by a kitchen as something to cook.
    const rows = await db.query<{ endpoint: string }>("select endpoint from promo_push_targets()");
    expect(rows.rows.map((r) => r.endpoint)).toEqual([ENDPOINT]);
  });
});

describe("announcing a promo exactly once", () => {
  let db: PGlite;

  async function promo(over: Record<string, string> = {}): Promise<string> {
    const cols: Record<string, string> = {
      code: "'LAUNCH50'",
      amount_cents: "5000",
      is_active: "true",
      publicise: "true",
      expires_at: "null",
      ...over,
    };
    return scalar<string>(
      db,
      `insert into vouchers (${Object.keys(cols).join(", ")})
       values (${Object.values(cols).join(", ")}) returning id::text`,
    );
  }

  beforeEach(async () => {
    db = await setup();
  });

  it("hands the right to send to the first caller and refuses every later one", async () => {
    const id = await promo();
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(true);
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(false);
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(false);
  });

  it("records when it went out", async () => {
    const id = await promo();
    await scalar(db, `select claim_promo_announcement('${id}')`);
    expect(
      await scalar<string | null>(db, `select announced_at::text from vouchers where id = '${id}'`),
    ).not.toBeNull();
  });

  it("refuses a promo nobody publicised, without marking it announced", async () => {
    const id = await promo({ publicise: "false" });
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(false);
    expect(
      await scalar<string | null>(db, `select announced_at::text from vouchers where id = '${id}'`),
    ).toBeNull();
  });

  it("refuses a promo that is switched off", async () => {
    const id = await promo({ is_active: "false" });
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(false);
  });

  it("refuses a promo that has already expired", async () => {
    const id = await promo({ expires_at: "now() - interval '1 hour'" });
    expect(await scalar<boolean>(db, `select claim_promo_announcement('${id}')`)).toBe(false);
  });

  it("answers false rather than raising for a voucher that does not exist", async () => {
    expect(
      await scalar<boolean>(
        db,
        `select claim_promo_announcement('79000000-0000-4000-8000-0000000000ff')`,
      ),
    ).toBe(false);
  });
});

describe("who may call what", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  const can = (role: string, signature: string) =>
    scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

  it("lets a browser opt in and out, guest or signed in", async () => {
    const reg = "register_promo_push_subscription(text, text, text)";
    const forget = "forget_promo_push_subscription(text)";
    expect(await can("anon", reg)).toBe(true);
    expect(await can("authenticated", reg)).toBe(true);
    expect(await can("anon", forget)).toBe(true);
    expect(await can("authenticated", forget)).toBe(true);
    // The send path reads subscriptions directly and has no reason to
    // register one, the same reasoning 0047 records.
    expect(await can("service_role", reg)).toBe(false);
  });

  it("keeps the subscriber list and the announcement claim server side", async () => {
    const targets = "promo_push_targets()";
    const claim = "claim_promo_announcement(uuid)";
    expect(await can("anon", targets)).toBe(false);
    expect(await can("authenticated", targets)).toBe(false);
    expect(await can("service_role", targets)).toBe(true);
    // A browser that could claim the notice first could keep an advert from
    // ever going out, which is the same argument 0048 makes for orders.
    expect(await can("anon", claim)).toBe(false);
    expect(await can("authenticated", claim)).toBe(false);
    expect(await can("service_role", claim)).toBe(true);
  });
});
