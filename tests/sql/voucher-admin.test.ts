import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Tests over the workspace writes, migration 0066.
 *
 * Two things to prove. The permission is checked inside the function rather
 * than by the page that calls it, which is spec section 22 item 3 and the
 * reason a staff session holds no write grant on vouchers at all. And a save is
 * one transaction across the voucher and its four scope lists, because a code
 * that is briefly live everywhere while its branch list catches up is a code
 * somebody can spend at the wrong counter.
 */

const ROVING_ID = "76000000-0000-4000-8000-000000000001";
const PINNED_ID = "76000000-0000-4000-8000-000000000002";
const CASHIER_ID = "76000000-0000-4000-8000-000000000003";

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
    set role authenticated;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

/** The same call, when the point of the test is that it is refused. */
async function expectRefused(db: PGlite, id: string, sql: string, reason: RegExp): Promise<void> {
  await expect(asUser(db, id, sql)).rejects.toThrow(reason);
}

function payload(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    code: "LAUNCH50",
    description: "Fifty off the launch week",
    amountCents: 5000,
    percentOff: null,
    maxDiscountCents: null,
    minOrderCents: 0,
    maxUses: null,
    maxUsesPerCustomer: 1,
    startsAt: null,
    expiresAt: null,
    isActive: true,
    branchIds: [],
    itemIds: [],
    categoryIds: [],
    customerPhones: [],
    customerUserIds: [],
    ...over,
  }).replace(/'/g, "''");
}

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ROVING_ID}', 'roving@example.com'),
      ('${PINNED_ID}', 'pinned@example.com'),
      ('${CASHIER_ID}', 'cashier@example.com');

    insert into profiles (id, role, staff_role, display_name, branch_id)
    values ('${ROVING_ID}', 'staff', 'manager', 'Roving', null);

    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${PINNED_ID}', 'staff', 'manager', 'Pinned', id
    from branches order by slug limit 1;

    insert into profiles (id, role, staff_role, display_name, branch_id)
    values ('${CASHIER_ID}', 'staff', 'cashier', 'Cashier', null);
  `);
  return db;
}

describe("who may manage a voucher", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await world();
  });

  it("lets an unassigned manager create one", async () => {
    const rows = await asUser<{ id: string }>(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload()}'::jsonb) as id`,
    );
    expect(rows[0].id).toBeTruthy();
  });

  it("refuses a cashier", async () => {
    await expectRefused(
      db,
      CASHIER_ID,
      `select admin_upsert_voucher('${payload()}'::jsonb)`,
      /FORBIDDEN/,
    );
  });

  it("refuses a manager pinned to one counter", async () => {
    // vouchers:manage is business wide from 0066: a promo code is one row every
    // counter shares, so a branch-assigned manager does not get it from their
    // job role and needs an override the Super Admin grants by hand.
    await expectRefused(
      db,
      PINNED_ID,
      `select admin_upsert_voucher('${payload()}'::jsonb)`,
      /FORBIDDEN/,
    );
  });

  it("lets that manager in once the Super Admin grants it", async () => {
    await db.exec(
      `insert into staff_permission_overrides (profile_id, permission, granted)
       values ('${PINNED_ID}', 'vouchers:manage', true)`,
    );
    const rows = await asUser<{ id: string }>(
      db,
      PINNED_ID,
      `select admin_upsert_voucher('${payload()}'::jsonb) as id`,
    );
    expect(rows[0].id).toBeTruthy();
  });

  it("holds no direct write grant on the table, whoever is asking", async () => {
    await expectRefused(
      db,
      ROVING_ID,
      "insert into vouchers (code, amount_cents) values ('SNEAKY', 100)",
      /permission denied/i,
    );
  });
});

describe("saving a voucher", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await world();
  });

  it("writes the record and an audit row", async () => {
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload()}'::jsonb) as id`,
      )
    )[0].id;

    expect(await scalar<string>(db, `select code from vouchers where id = '${id}'`)).toBe(
      "LAUNCH50",
    );
    expect(
      await scalar<number>(
        db,
        `select count(*) from audit_logs
         where target_table = 'vouchers' and target_id = '${id}' and action = 'voucher.create'`,
      ),
    ).toBe(1);
  });

  it("keeps a null cap as unlimited rather than writing a zero", async () => {
    // The trap from spec section 18, at the write end rather than the read end.
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload({ maxUses: null })}'::jsonb) as id`,
      )
    )[0].id;
    expect(await scalar<number | null>(db, `select max_uses from vouchers where id = '${id}'`)).toBe(
      null,
    );
  });

  it("refuses a code that names both kinds of discount, or neither", async () => {
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ amountCents: 5000, percentOff: 10 })}'::jsonb)`,
      /ONE_DISCOUNT_KIND/,
    );
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ amountCents: null, percentOff: null })}'::jsonb)`,
      /ONE_DISCOUNT_KIND/,
    );
  });

  it("refuses a code somebody else already has", async () => {
    await asUser(db, ROVING_ID, `select admin_upsert_voucher('${payload()}'::jsonb)`);
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ code: "launch50" })}'::jsonb)`,
      /DUPLICATE_CODE/,
    );
  });

  it("saves the scope lists with the voucher", async () => {
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher(
           jsonb_set(
             jsonb_set('${payload()}'::jsonb, '{branchIds}',
               (select jsonb_agg(to_jsonb(b.id::text)) from branches b where b.slug = 'mango-avenue')),
             '{categoryIds}',
             (select jsonb_agg(to_jsonb(c.id::text)) from menu_categories c where c.slug = 'chicken-wings')
           )
         ) as id`,
      )
    )[0].id;

    expect(
      await scalar<number>(db, `select count(*) from voucher_branches where voucher_id = '${id}'`),
    ).toBe(1);
    expect(
      await scalar<number>(db, `select count(*) from voucher_categories where voucher_id = '${id}'`),
    ).toBe(1);
  });

  it("normalises a customer phone list so it can ever match", async () => {
    // A number typed with spaces on the admin form would otherwise never equal
    // the digits a redemption is counted against.
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload({ customerPhones: ["0917 000 4321", "+63 918 111 2222"] })}'::jsonb) as id`,
      )
    )[0].id;

    const rows = await db.query<{ phone_digits: string }>(
      `select phone_digits from voucher_customers where voucher_id = $1 order by 1`,
      [id],
    );
    expect(rows.rows.map((row) => row.phone_digits)).toEqual(["09170004321", "639181112222"]);
  });

  it("replaces scope wholesale, so clearing a list means everywhere again", async () => {
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher(
           jsonb_set('${payload()}'::jsonb, '{branchIds}',
             (select jsonb_agg(to_jsonb(b.id::text)) from branches b where b.slug = 'mango-avenue'))
         ) as id`,
      )
    )[0].id;
    expect(
      await scalar<number>(db, `select count(*) from voucher_branches where voucher_id = '${id}'`),
    ).toBe(1);

    await asUser(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ branchIds: [] })}'::jsonb || jsonb_build_object('id', '${id}'))`,
    );
    // An empty branch list is not "no change", it is the voucher becoming valid
    // at every counter, and that has to be expressible.
    expect(
      await scalar<number>(db, `select count(*) from voucher_branches where voucher_id = '${id}'`),
    ).toBe(0);
  });

  it("refuses a cap lowered under the uses already taken", async () => {
    const id = (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload({ maxUses: 10 })}'::jsonb) as id`,
      )
    )[0].id;
    await db.exec(`update vouchers set uses_count = 4 where id = '${id}'`);

    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ maxUses: 2 })}'::jsonb || jsonb_build_object('id', '${id}'))`,
      /CAP_BELOW_USES/,
    );
  });
});

describe("switching a voucher off and removing it", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await world();
  });

  async function created(): Promise<string> {
    return (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload()}'::jsonb) as id`,
      )
    )[0].id;
  }

  it("disables and re-enables, recording each", async () => {
    const id = await created();
    await asUser(db, ROVING_ID, `select admin_set_voucher_active('${id}', false)`);
    expect(await scalar<boolean>(db, `select is_active from vouchers where id = '${id}'`)).toBe(
      false,
    );

    await asUser(db, ROVING_ID, `select admin_set_voucher_active('${id}', true)`);
    expect(await scalar<boolean>(db, `select is_active from vouchers where id = '${id}'`)).toBe(
      true,
    );
    expect(
      await scalar<number>(
        db,
        `select count(*) from audit_logs
         where target_id = '${id}' and action in ('voucher.enable', 'voucher.disable')`,
      ),
    ).toBe(2);
  });

  it("refuses a cashier reaching for the switch", async () => {
    const id = await created();
    await expectRefused(
      db,
      CASHIER_ID,
      `select admin_set_voucher_active('${id}', false)`,
      /FORBIDDEN/,
    );
  });

  it("deletes one that was never used", async () => {
    const id = await created();
    await asUser(db, ROVING_ID, `select admin_delete_voucher('${id}')`);
    expect(await scalar<number>(db, `select count(*) from vouchers where id = '${id}'`)).toBe(0);
  });

  it("refuses to delete one that has been redeemed", async () => {
    // History is not rewritable: 0008 makes the redemption reference restrict.
    // Naming the refusal is what stops it reaching the screen as a foreign key
    // error, and disable is the control the screen offers instead.
    const id = await created();
    await db.exec(`
      insert into orders (
        short_code, branch_id, price_list_id, pickup_code,
        customer_name, customer_phone
      )
      select 'ZZZ111', b.id, b.price_list_id, '0001', 'Steven', '09170000000'
      from branches b order by b.slug limit 1;

      insert into voucher_redemptions (voucher_id, order_id, amount_cents)
      select '${id}', o.id, 5000 from orders o where o.short_code = 'ZZZ111';
    `);

    await expectRefused(db, ROVING_ID, `select admin_delete_voucher('${id}')`, /VOUCHER_IN_USE/);
  });
});

/**
 * The master switch, section 5 of 0066.
 *
 * The engine has been dark since 0008 set vouchers_enabled to false, and every
 * layer built on top of it, the resolver in 0065 and the preview and the
 * placement, reads that flag before it will discount anything. This is the one
 * call that lifts it, so it gets the same three questions as the rest: does it
 * move the flag, does it say who moved it, and is it the only way through.
 */
describe("the engine's master switch", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await world();
  });

  function enabled(): Promise<boolean> {
    return scalar<boolean>(db, "select vouchers_enabled from app_settings where id = 1");
  }

  it("starts dark, which is what every layer above it assumes", async () => {
    expect(await enabled()).toBe(false);
  });

  it("turns the engine on and off again, recording each with its actor", async () => {
    await asUser(db, ROVING_ID, "select admin_set_vouchers_enabled(true)");
    expect(await enabled()).toBe(true);

    await asUser(db, ROVING_ID, "select admin_set_vouchers_enabled(false)");
    expect(await enabled()).toBe(false);

    // Both directions are logged, and the diff carries the value it moved from
    // as well as the one it moved to, so the log reads without the reader
    // having to reconstruct the order the rows happened in.
    expect(
      await scalar<number>(
        db,
        `select count(*) from audit_logs
         where target_table = 'app_settings' and target_id = '1'
           and actor_profile_id = '${ROVING_ID}'
           and action = 'vouchers.enable_engine'
           and diff = '{"before": false, "after": true}'::jsonb`,
      ),
    ).toBe(1);
    expect(
      await scalar<number>(
        db,
        `select count(*) from audit_logs
         where target_table = 'app_settings' and target_id = '1'
           and actor_profile_id = '${ROVING_ID}'
           and action = 'vouchers.disable_engine'
           and diff = '{"before": true, "after": false}'::jsonb`,
      ),
    ).toBe(1);
  });

  it("refuses a cashier, who would otherwise switch on the whole business", async () => {
    await expectRefused(
      db,
      CASHIER_ID,
      "select admin_set_vouchers_enabled(true)",
      /FORBIDDEN/,
    );
    expect(await enabled()).toBe(false);
  });

  it("refuses a null rather than reading it as off", async () => {
    // The function is not strict, so a null argument runs the body. Off is a
    // decision somebody makes; a null is a form that failed to say. Writing the
    // first when it was handed the second is how a live promotion gets switched
    // off by an empty checkbox.
    await expectRefused(
      db,
      ROVING_ID,
      "select admin_set_vouchers_enabled(null)",
      /INVALID_INPUT/,
    );
  });

  it("is the only way through, permission or not", async () => {
    // 0022 revokes update on app_settings from authenticated, so the function
    // is not merely the tidy route, it is the reachable one, and the audit row
    // cannot be skipped by writing the column directly.
    await expectRefused(
      db,
      ROVING_ID,
      "update app_settings set vouchers_enabled = true where id = 1",
      /permission denied/i,
    );
  });
});

/**
 * The freeze, migration 0067.
 *
 * Once a code has met an order its terms stop being editable, because the
 * order was placed under them and rewriting them makes every later reading of
 * that order wrong. The interesting half is what "met an order" means: 0065
 * gives a use back by DELETING the redemption row, so a test that looked only
 * at redemptions would unlock a code the moment its one order was cancelled,
 * which is exactly the case somebody would exploit by accident.
 */
describe("a code that has met an order", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await world();
  });

  async function created(over: Record<string, unknown> = {}): Promise<string> {
    return (
      await asUser<{ id: string }>(
        db,
        ROVING_ID,
        `select admin_upsert_voucher('${payload(over)}'::jsonb) as id`,
      )
    )[0].id;
  }

  /** An order that named the code, with the redemption 0065 would have written. */
  async function redeemed(id: string, code = "ZZZ111"): Promise<void> {
    await db.exec(`
      insert into orders (
        short_code, branch_id, price_list_id, pickup_code,
        customer_name, customer_phone, voucher_id
      )
      select '${code}', b.id, b.price_list_id, '0001', 'Steven', '09170000000', '${id}'
      from branches b order by b.slug limit 1;

      insert into voucher_redemptions (voucher_id, order_id, amount_cents)
      select '${id}', o.id, 5000 from orders o where o.short_code = '${code}';
    `);
  }

  /** The same order after it fell over: the use was given back, the order remains. */
  async function attemptedThenReturned(id: string, code = "ZZZ222"): Promise<void> {
    await redeemed(id, code);
    await db.exec(`delete from voucher_redemptions where voucher_id = '${id}'`);
  }

  it("refuses an edit once somebody has redeemed it", async () => {
    const id = await created();
    await redeemed(id);
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ id, amountCents: 9900 })}'::jsonb)`,
      /VOUCHER_LOCKED/,
    );
    // The refusal took the whole statement with it, terms included.
    expect(await scalar<number>(db, `select amount_cents from vouchers where id = '${id}'`)).toBe(
      5000,
    );
  });

  it("refuses an edit even after the order was cancelled and the use given back", async () => {
    const id = await created();
    await attemptedThenReturned(id);
    expect(
      await scalar<number>(db, `select count(*) from voucher_redemptions where voucher_id = '${id}'`),
    ).toBe(0);
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ id, percentOff: 10, amountCents: null })}'::jsonb)`,
      /VOUCHER_LOCKED/,
    );
  });

  it("refuses to rewrite its scope, which is the worse half of the problem", async () => {
    // Adding a branch limit after the fact makes a past redemption look as
    // though it happened somewhere the code did not apply.
    const id = await created();
    await redeemed(id);
    await expectRefused(
      db,
      ROVING_ID,
      `select admin_upsert_voucher('${payload({ id })}'::jsonb)`,
      /VOUCHER_LOCKED/,
    );
  });

  it("still lets it be switched off, which is the only way to stop a live code", async () => {
    const id = await created();
    await redeemed(id);
    await asUser(db, ROVING_ID, `select admin_set_voucher_active('${id}', false)`);
    expect(await scalar<boolean>(db, `select is_active from vouchers where id = '${id}'`)).toBe(
      false,
    );
  });

  it("refuses to delete one that was only attempted", async () => {
    // The hole 0067 closes: with the redemption row gone there was no foreign
    // key left to restrict the delete, and deleting the voucher would null
    // orders.voucher_id and erase the fact that the code was ever applied.
    const id = await created();
    await attemptedThenReturned(id);
    await expectRefused(db, ROVING_ID, `select admin_delete_voucher('${id}')`, /VOUCHER_IN_USE/);
    expect(await scalar<number>(db, `select count(*) from vouchers where id = '${id}'`)).toBe(1);
  });

  it("leaves a code nobody has tried completely editable", async () => {
    // The guard has to be narrow or it breaks the ordinary case, which is
    // building a campaign, correcting it, and only then launching it.
    const id = await created();
    await asUser(db, ROVING_ID, `select admin_upsert_voucher('${payload({ id, amountCents: 7500 })}'::jsonb)`);
    expect(await scalar<number>(db, `select amount_cents from vouchers where id = '${id}'`)).toBe(
      7500,
    );
  });

  it("tells the screen exactly what it tells the write", async () => {
    // One definition of locked, so the form cannot offer an edit the function
    // is going to refuse.
    const open = await created();
    const used = await created({ code: "USEDONE" });
    await attemptedThenReturned(used);

    const asked = async (id: string) =>
      (await asUser<{ locked: boolean }>(db, ROVING_ID, `select admin_voucher_locked('${id}') as locked`))[0]
        .locked;

    expect(await asked(open)).toBe(false);
    expect(await asked(used)).toBe(true);
  });

  it("does not answer a cashier asking", async () => {
    const id = await created();
    await expectRefused(db, CASHIER_ID, `select admin_voucher_locked('${id}')`, /FORBIDDEN/);
  });

  it("is not reachable by anon or authenticated as a bare predicate", async () => {
    // voucher_is_locked reads across every branch's orders, so it is internal
    // in the same way the 0065 resolvers are.
    await expectRefused(
      db,
      ROVING_ID,
      `select voucher_is_locked('${await created()}')`,
      /permission denied/i,
    );
  });
});
