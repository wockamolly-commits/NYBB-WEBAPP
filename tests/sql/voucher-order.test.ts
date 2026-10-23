import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * Tests over the owner's promo order, migration 0078.
 *
 * The promises: an untouched order behaves exactly as before, with nothing
 * placed. A set order leads the listing and marks what it placed; which one
 * is featured is decided by the storefront (featuredPromo) after its own
 * filters. The setter is all or nothing, only places
 * advertised codes, and works on a locked code. Hiding a code takes it out of
 * the order so it cannot come back months later as featured.
 */

const MANAGER_ID = "78100000-0000-4000-8000-000000000001";
const CASHIER_ID = "78100000-0000-4000-8000-000000000002";
const ALICE = "78100000-0000-4000-8000-000000000003";

async function as<T>(db: PGlite, id: string | null, role: string, sql: string) {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select ${id ? `'${id}'::uuid` : "null::uuid"} $$;
    set role ${role};
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

const asManager = <T,>(db: PGlite, sql: string) => as<T>(db, MANAGER_ID, "authenticated", sql);

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER_ID}', 'manager@example.com'),
      ('${CASHIER_ID}', 'cashier@example.com'),
      ('${ALICE}', 'alice@example.com');
    insert into profiles (id, role, staff_role, display_name, branch_id) values
      ('${MANAGER_ID}', 'staff', 'manager', 'Manager', null),
      ('${CASHIER_ID}', 'staff', 'cashier', 'Cashier', null);
    update app_settings set vouchers_enabled = true where id = 1;
  `);
  return db;
}

/** A live, advertised code. `ends` is minutes from now, null for never. */
async function voucher(db: PGlite, code: string, ends: number | null, over = ""): Promise<string> {
  const expires = ends === null ? "null" : `now() + interval '${ends} minutes'`;
  const rows = await db.query<{ id: string }>(`
    insert into vouchers (code, amount_cents, is_active, publicise, expires_at ${over ? ", " + over.split("=")[0] : ""})
    values ('${code}', 5000, true, true, ${expires} ${over ? ", " + over.split("=")[1] : ""})
    returning id
  `);
  return rows.rows[0].id;
}

type Listed = { code: string; placed: boolean };

async function listed(db: PGlite, user: string | null = null): Promise<Listed[]> {
  const rows = await as<{ promos: Listed[] }>(
    db,
    user,
    user ? "authenticated" : "anon",
    "select list_customer_promos(null) as promos",
  );
  return rows[0].promos.map((p) => ({ code: p.code, placed: p.placed }));
}

function order(ids: string[]): string {
  return `select admin_set_voucher_order(array[${ids.map((id) => `'${id}'`).join(",")}]::uuid[])`;
}

describe("before anybody sets an order", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("lists soonest ending first, as it always has, with nothing placed", async () => {
    await voucher(db, "LATER", 600);
    await voucher(db, "SOON", 60);
    await voucher(db, "FOREVER", null);
    expect(await listed(db)).toEqual([
      { code: "SOON", placed: false },
      { code: "LATER", placed: false },
      { code: "FOREVER", placed: false },
    ]);
  });
});

describe("an order the owner set", () => {
  let db: PGlite;
  let soon: string, later: string, forever: string;
  beforeEach(async () => {
    db = await world();
    later = await voucher(db, "LATER", 600);
    soon = await voucher(db, "SOON", 60);
    forever = await voucher(db, "FOREVER", null);
  });

  it("leads the listing and marks every code it placed", async () => {
    await asManager(db, order([forever, later, soon]));
    expect(await listed(db)).toEqual([
      { code: "FOREVER", placed: true },
      { code: "LATER", placed: true },
      { code: "SOON", placed: true },
    ]);
  });

  it("puts placed codes before unplaced ones, which keep the old order", async () => {
    await asManager(db, order([forever]));
    expect((await listed(db)).map((p) => p.code)).toEqual(["FOREVER", "SOON", "LATER"]);
  });

  it("drops a placed code that stops qualifying, keeping the rest in order", async () => {
    // The top code is switched off: it leaves the listing, and the next
    // placed one leads (lib/promos/schema.ts features the first placed).
    await asManager(db, order([forever, later, soon]));
    await db.exec(`update vouchers set is_active = false where id = '${forever}'`);
    expect(await listed(db)).toEqual([
      { code: "LATER", placed: true },
      { code: "SOON", placed: true },
    ]);
  });

  it("goes back to automatic on an empty order", async () => {
    await asManager(db, order([forever, later, soon]));
    await asManager(db, "select admin_set_voucher_order('{}'::uuid[])");
    expect(await listed(db)).toEqual([
      { code: "SOON", placed: false },
      { code: "LATER", placed: false },
      { code: "FOREVER", placed: false },
    ]);
  });

  it("replaces the whole order rather than merging into it", async () => {
    await asManager(db, order([forever, later, soon]));
    await asManager(db, order([soon]));
    const rows = await db.query<{ code: string; display_priority: number | null }>(
      "select code, display_priority from vouchers order by code",
    );
    expect(rows.rows).toEqual([
      { code: "FOREVER", display_priority: null },
      { code: "LATER", display_priority: null },
      { code: "SOON", display_priority: 1 },
    ]);
  });

  it("takes a hidden code out of the order", async () => {
    await asManager(db, order([forever, later]));
    await asManager(db, `select admin_set_voucher_publicise('${forever}', false)`);
    await asManager(db, `select admin_set_voucher_publicise('${forever}', true)`);
    // Advertised again, but not placed again from a stale rank.
    expect(await listed(db)).toEqual([
      { code: "LATER", placed: true },
      { code: "SOON", placed: false },
      { code: "FOREVER", placed: false },
    ]);
  });

  it("records who set it, before and after", async () => {
    await asManager(db, order([forever, soon]));
    const rows = await db.query<{ action: string; diff: { before: string[]; after: string[] } }>(
      "select action, diff from audit_logs where action like 'voucher.order%'",
    );
    expect(rows.rows).toEqual([
      { action: "voucher.order_set", diff: { before: [], after: ["FOREVER", "SOON"] } },
    ]);
  });
});

describe("what the setter refuses", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("refuses somebody without vouchers:manage", async () => {
    const id = await voucher(db, "ONE", null);
    await expect(
      as(db, CASHIER_ID, "authenticated", order([id])),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses to place a code that is not advertised", async () => {
    const id = await voucher(db, "QUIET", null);
    await db.exec(`update vouchers set publicise = false where id = '${id}'`);
    await expect(asManager(db, order([id]))).rejects.toThrow(/NOT_PUBLICISED/);
  });

  it("refuses the same code twice and a code that does not exist", async () => {
    const id = await voucher(db, "ONE", null);
    await expect(asManager(db, order([id, id]))).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asManager(db, order([id, "78100000-0000-4000-8000-0000000000ff"])),
    ).rejects.toThrow(/VOUCHER_NOT_FOUND/);
  });

  it("still works on a code that has met an order", async () => {
    const id = await voucher(db, "USED", null);
    await db.exec(`
      insert into orders (
        short_code, branch_id, price_list_id, pickup_code,
        customer_name, customer_phone, voucher_id
      )
      select 'ZZZ781', b.id, b.price_list_id, '0001', 'Steven', '09170000000', '${id}'
      from branches b order by b.slug limit 1;
    `);
    await asManager(db, order([id]));
    expect(await listed(db)).toEqual([{ code: "USED", placed: true }]);
  });

  it("is reachable by a signed-in staff session and by nobody else", async () => {
    const rows = await db.query<{ grantee: string }>(`
      select grantee from information_schema.routine_privileges
      where routine_name = 'admin_set_voucher_order' and privilege_type = 'EXECUTE'
    `);
    expect(rows.rows.map((r) => r.grantee).sort()).toEqual(["authenticated", "postgres"].sort());
  });
});
