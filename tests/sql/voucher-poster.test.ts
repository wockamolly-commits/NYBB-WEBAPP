import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * Tests over voucher posters, migration 0077.
 *
 * Three promises. The poster stays changeable on a code whose terms are
 * locked, because artwork is not a term. The row can never hold half a poster
 * or one hosted somewhere else. And the listing carries the poster exactly when
 * it carries the code, so a voucher that stops qualifying takes its poster
 * off the storefront with it.
 */

const MANAGER_ID = "77000000-0000-4000-8000-000000000001";
const CASHIER_ID = "77000000-0000-4000-8000-000000000002";

const URL_OK =
  "https://example.supabase.co/storage/v1/object/public/voucher-posters/2026/a.webp";
const BLUR = "data:image/webp;base64,AAAA";

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

async function asGuest<T>(db: PGlite, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select null::uuid $$;
    set role anon;
  `);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function world(): Promise<PGlite> {
  const db = await freshDatabase({ seed: true });
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER_ID}', 'manager@example.com'),
      ('${CASHIER_ID}', 'cashier@example.com');
    insert into profiles (id, role, staff_role, display_name, branch_id) values
      ('${MANAGER_ID}', 'staff', 'manager', 'Manager', null),
      ('${CASHIER_ID}', 'staff', 'cashier', 'Cashier', null);
    update app_settings set vouchers_enabled = true where id = 1;
  `);
  return db;
}

async function voucher(db: PGlite, over: Record<string, string> = {}): Promise<string> {
  const cols: Record<string, string> = {
    code: "'LAUNCH50'",
    amount_cents: "5000",
    is_active: "true",
    publicise: "true",
    ...over,
  };
  const rows = await db.query<{ id: string }>(`
    insert into vouchers (${Object.keys(cols).join(", ")})
    values (${Object.values(cols).join(", ")})
    returning id
  `);
  return rows.rows[0].id;
}

function setPoster(id: string, url = URL_OK, width = "1200", height = "1600", blur = BLUR) {
  const lit = (v: string | null) => (v === null ? "null" : `'${v}'`);
  return `select admin_set_voucher_poster('${id}', ${lit(url)}, ${width}, ${height}, ${lit(blur)})`;
}

async function posterOf(db: PGlite, id: string) {
  const rows = await db.query<{
    poster_url: string | null;
    poster_width: number | null;
    poster_height: number | null;
  }>(`select poster_url, poster_width, poster_height from vouchers where id = '${id}'`);
  return rows.rows[0];
}

type ListedPromo = { code: string; posterUrl: string | null; posterWidth: number | null };

async function listed(db: PGlite): Promise<ListedPromo[]> {
  const rows = await asGuest<{ promos: ListedPromo[] }>(
    db,
    "select list_customer_promos(null) as promos",
  );
  return rows[0].promos;
}

describe("setting a poster", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("sets and clears it", async () => {
    const id = await voucher(db);
    await asUser(db, MANAGER_ID, setPoster(id));
    expect(await posterOf(db, id)).toEqual({
      poster_url: URL_OK,
      poster_width: 1200,
      poster_height: 1600,
    });
    await asUser(
      db,
      MANAGER_ID,
      `select admin_set_voucher_poster('${id}', null, null, null, null)`,
    );
    expect(await posterOf(db, id)).toEqual({
      poster_url: null,
      poster_width: null,
      poster_height: null,
    });
  });

  it("refuses somebody without vouchers:manage", async () => {
    const id = await voucher(db);
    await expect(asUser(db, CASHIER_ID, setPoster(id))).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses a poster hosted anywhere but the posters bucket", async () => {
    const id = await voucher(db);
    await expect(
      asUser(db, MANAGER_ID, setPoster(id, "https://evil.example.com/a.webp")),
    ).rejects.toThrow(/INVALID_INPUT/);
    await expect(
      asUser(
        db,
        MANAGER_ID,
        setPoster(id, "https://example.supabase.co/storage/v1/object/public/menu-images/a.webp"),
      ),
    ).rejects.toThrow(/INVALID_INPUT/);
  });

  it("refuses half a poster or a zero-sized one", async () => {
    const id = await voucher(db);
    await expect(asUser(db, MANAGER_ID, setPoster(id, URL_OK, "0"))).rejects.toThrow(
      /INVALID_INPUT/,
    );
    await expect(asUser(db, MANAGER_ID, setPoster(id, URL_OK, "null"))).rejects.toThrow(
      /INVALID_INPUT/,
    );
    // And the table refuses it even from a path that skips the function.
    await expect(
      db.exec(`update vouchers set poster_url = '${URL_OK}' where id = '${id}'`),
    ).rejects.toThrow(/vouchers_poster_complete/);
  });

  it("names a voucher that does not exist", async () => {
    await expect(
      asUser(db, MANAGER_ID, setPoster("77000000-0000-4000-8000-0000000000ff")),
    ).rejects.toThrow(/VOUCHER_NOT_FOUND/);
  });

  it("still works once the code has met an order", async () => {
    // The point of a separate setter: 0067 freezes the terms, and the
    // artwork on a running promo is the thing most likely to change.
    const id = await voucher(db);
    await db.exec(`
      insert into orders (
        short_code, branch_id, price_list_id, pickup_code,
        customer_name, customer_phone, voucher_id
      )
      select 'ZZZ777', b.id, b.price_list_id, '0001', 'Steven', '09170000000', '${id}'
      from branches b order by b.slug limit 1;
    `);
    await asUser(db, MANAGER_ID, setPoster(id));
    expect((await posterOf(db, id)).poster_url).toBe(URL_OK);
  });

  it("records who changed it", async () => {
    const id = await voucher(db);
    await asUser(db, MANAGER_ID, setPoster(id));
    const rows = await db.query<{ action: string; actor_profile_id: string }>(
      `select action, actor_profile_id from audit_logs
       where target_table = 'vouchers' and target_id = '${id}'`,
    );
    expect(rows.rows).toEqual([{ action: "voucher.poster_set", actor_profile_id: MANAGER_ID }]);
  });
});

describe("the poster on the storefront", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await world();
  });

  it("travels with a listed code", async () => {
    const id = await voucher(db);
    await asUser(db, MANAGER_ID, setPoster(id));
    const [promo] = await listed(db);
    expect(promo.posterUrl).toBe(URL_OK);
    expect(promo.posterWidth).toBe(1200);
  });

  it("is null, not zero, on a code without one", async () => {
    await voucher(db);
    const [promo] = await listed(db);
    expect(promo.posterUrl).toBeNull();
    expect(promo.posterWidth).toBeNull();
  });

  it("leaves with the code when the code stops qualifying", async () => {
    const id = await voucher(db);
    await asUser(db, MANAGER_ID, setPoster(id));
    await db.exec(`update vouchers set is_active = false where id = '${id}'`);
    expect(await listed(db)).toEqual([]);
    await db.exec(
      `update vouchers set is_active = true, expires_at = now() - interval '1 minute'
       where id = '${id}'`,
    );
    expect(await listed(db)).toEqual([]);
  });

  it("shows the replacement as soon as it is set", async () => {
    const id = await voucher(db);
    await asUser(db, MANAGER_ID, setPoster(id));
    const next = URL_OK.replace("a.webp", "b.webp");
    await asUser(db, MANAGER_ID, setPoster(id, next));
    expect((await listed(db))[0].posterUrl).toBe(next);
  });
});

describe("who may call it", () => {
  it("is reachable by a signed-in staff session and by nobody else", async () => {
    const db = await world();
    const rows = await db.query<{ grantee: string }>(`
      select grantee from information_schema.routine_privileges
      where routine_name = 'admin_set_voucher_poster' and privilege_type = 'EXECUTE'
    `);
    expect(rows.rows.map((r) => r.grantee).sort()).toEqual(
      ["authenticated", "postgres"].sort(),
    );
  });
});
