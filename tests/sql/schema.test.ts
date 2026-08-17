import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, migrationFiles, scalar } from "./harness";

/**
 * Structural tests over every checked-in migration.
 *
 * These are the checks that would otherwise only fail after a Supabase project
 * exists, which is to say after it is expensive to be wrong.
 */
describe("migrations", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
  }, 120_000);

  it("are numbered contiguously from 0001", async () => {
    const files = await migrationFiles();
    expect(files.map((name) => name.slice(0, 4))).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
      "0012",
      "0013",
      "0014",
      "0015",
      "0016",
      "0017",
      "0018",
      "0019",
      "0020",
      "0021",
      "0022",
      "0023",
      "0024",
      "0025",
      "0026",
      "0027",
      "0028",
      "0029",
      "0030",
      "0031",
      "0032",
      "0033",
      "0034",
      "0035",
      "0036",
      "0037",
      "0038",
      "0039",
      "0040",
      "0041",
      "0042",
      "0043",
      "0044",
      "0045",
    ]);
  });

  it("enable row level security on every table", async () => {
    const result = await db.query<{ tablename: string }>(`
      select c.relname as tablename
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      order by 1
    `);
    expect(result.rows.map((row) => row.tablename)).toEqual([]);
  });

  // The rule from 0009: the storefront reaches the database only through
  // SECURITY DEFINER functions. A table privilege held by anon means somebody
  // opened a direct read path, and that is worth failing a build over.
  it("grant anon no privilege on any table", async () => {
    const result = await db.query<{
      tablename: string;
      privilege_type: string;
    }>(`
      select table_name as tablename, privilege_type
      from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'
      order by 1, 2
    `);
    expect(result.rows).toEqual([]);
  });

  // The writes that must stay inside SECURITY DEFINER functions, per spec
  // section 22 point 3. A grant here would let a staff session change an order
  // status with a bare update and skip the audit trail entirely.
  it("grant authenticated no write on orders, payments or slots", async () => {
    const result = await db.query<{
      tablename: string;
      privilege_type: string;
    }>(`
      select table_name as tablename, privilege_type
      from information_schema.role_table_grants
      where grantee = 'authenticated'
        and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        and table_name in (
          'orders', 'order_items', 'order_item_options', 'order_status_events',
          'payments', 'pickup_slots', 'pos_sync', 'checkout_attempts',
          'carts', 'cart_items', 'cart_item_options',
          'audit_logs', 'notifications', 'rate_limits',
          'voucher_redemptions', 'push_subscriptions'
        )
      order by 1, 2
    `);
    expect(result.rows).toEqual([]);
  });

  it("keep owner and catalog writes behind audited functions", async () => {
    const result = await db.query<{
      tablename: string;
      privilege_type: string;
    }>(`
      select table_name as tablename, privilege_type
      from information_schema.role_table_grants
      where grantee = 'authenticated'
        and table_schema = 'public'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
        and table_name in (
          'price_lists', 'branches', 'store_hours', 'menu_categories',
          'menu_items', 'item_variations', 'menu_option_groups',
          'menu_options', 'menu_item_option_groups',
          'item_variation_prices', 'menu_option_variation_prices',
          'vouchers', 'staff_invitations', 'staff_permission_overrides',
          'app_settings', 'franchise_inquiries'
        )
      order by 1, 2
    `);
    expect(result.rows).toEqual([]);
  });

  it("make future Data API exposure opt-in", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      expect(
        await scalar<boolean>(
          db,
          `select has_schema_privilege('${role}', 'public', 'create')`,
        ),
        `${role} schema create`,
      ).toBe(false);
    }

    const defaults = await db.query<{ object_type: string; grantee: string }>(`
      select
        case d.defaclobjtype
          when 'r' then 'table'
          when 'S' then 'sequence'
          when 'f' then 'function'
        end as object_type,
        coalesce(g.rolname, 'public') as grantee
      from pg_default_acl d
      cross join lateral aclexplode(d.defaclacl) a
      left join pg_roles g on g.oid = a.grantee
      join pg_namespace n on n.oid = d.defaclnamespace
      where n.nspname = 'public'
        and (
          (d.defaclobjtype = 'r'
            and a.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
          or (d.defaclobjtype = 'S'
            and a.privilege_type in ('USAGE', 'SELECT'))
          or (d.defaclobjtype = 'f' and a.privilege_type = 'EXECUTE')
        )
        and coalesce(g.rolname, 'public') in ('public', 'anon', 'authenticated')
      order by 1, 2
    `);
    expect(defaults.rows).toEqual([]);
  });

  // Postgres grants EXECUTE to PUBLIC on every new function. 0010 takes that
  // back by name. A rate limiter any anonymous visitor can drive is not a rate
  // limiter, so this one is not a style preference.
  it("do not leave rate_limit_hit callable by anon", async () => {
    const canCall = await scalar<boolean>(
      db,
      `select has_function_privilege('anon', 'rate_limit_hit(text, int, int)', 'execute')`,
    );
    expect(canCall).toBe(false);
  });

  it("keep staff email lookup server-only", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      const canCall = await scalar<boolean>(
        db,
        `select has_function_privilege('${role}', 'resolve_active_staff_email(text)', 'execute')`,
      );
      expect(canCall, role).toBe(false);
    }
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('service_role', 'resolve_active_staff_email(text)', 'execute')`,
      ),
    ).toBe(true);
  });

  it("resolve only active staff emails", async () => {
    await db.exec(`
      insert into auth.users (id, email)
      values
        ('71000000-0000-4000-8000-000000000001', 'active@example.com'),
        ('71000000-0000-4000-8000-000000000002', 'inactive@example.com');
      insert into profiles (id, role, staff_role, display_name, is_active)
      values
        ('71000000-0000-4000-8000-000000000001', 'staff', 'cashier', 'Active', true),
        ('71000000-0000-4000-8000-000000000002', 'staff', 'kitchen', 'Inactive', false);
    `);

    expect(
      await scalar<string>(
        db,
        `select profile_staff_role::text from resolve_active_staff_email(' ACTIVE@example.com ')`,
      ),
    ).toBe("cashier");
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from resolve_active_staff_email('inactive@example.com')`,
      ),
    ).toBe(0);
  });

  // A policy expression is evaluated as the querying role, so a staff read
  // fails on the FUNCTION rather than on the table if this is missed, which is
  // a genuinely confusing error to land on.
  it("let authenticated call the functions its own policies name", async () => {
    for (const fn of [
      "current_role_kind()",
      "is_staff()",
      "is_admin()",
      "current_staff_has_permission(text)",
      "current_staff_can_access_branch(uuid)",
    ]) {
      const canCall = await scalar<boolean>(
        db,
        `select has_function_privilege('authenticated', '${fn}', 'execute')`,
      );
      expect(canCall, fn).toBe(true);
    }
  });

  // Named without a count on purpose: it read "eight" while the list held nine,
  // because the number is the one part nobody updates when they add a function.
  it("expose exactly this set of functions to anon", async () => {
    const result = await db.query<{ name: string }>(`
      select p.proname as name
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and has_function_privilege('anon', p.oid, 'execute')
        -- Extension-owned functions are excluded. pgcrypto lands in the
        -- extensions schema on Supabase but in public under PGlite, and its
        -- forty PUBLIC-executable helpers are not this schema's doing.
        and not exists (
          select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
        )
      order by 1
    `);
    // The entire public surface, reviewable in one glance. Widening it is
    // supposed to be a decision, which is why this list is spelled out rather
    // than counted: get_storefront_menu joined it in 0011, get_pickup_slots in
    // 0012, and place_order in 0013, and each had to come through this
    // assertion to do so.
    //
    // place_order is the first WRITE on the list, and it is here on purpose. A
    // guest has to be able to place an order, and a signed-in customer has to
    // reach it as themselves so auth.uid() stamps orders.user_id, which a
    // service-role client would make impossible. What keeps that safe is that
    // it takes slugs and quantities and resolves every peso itself.
    //
    // get_order_by_tracking (0014) is the first read here that returns a named
    // person's details, and the only one that demands a secret to do it. The
    // short code identifies the order; the tracking token authorizes reading
    // it, and a wrong token is given the same answer as a code that never
    // existed so the code space is not worth scraping.
    //
    // register_customer_push_device (0038) is checked the same way as
    // get_order_by_tracking: the short code and tracking token together decide
    // whether the caller may speak for the order, this time to attach a device
    // to it rather than to read it.
    //
    // submit_franchise_inquiry (0045) is the second write here and the only one
    // that authorizes nothing at all, because a franchise lead is a stranger
    // introducing themselves. What bounds it is that it writes to a table anon
    // cannot read back, stores no address or user agent, and refuses anything
    // over its length limits. The abuse it cannot prevent on its own, a flood of
    // plausible-looking leads, is bounded in the app by an address rate limit
    // and a honeypot instead.
    expect(result.rows.map((row) => row.name)).toEqual([
      "branch_accepts_orders",
      "branch_is_open_at",
      "customer_mark_order_arrived",
      "get_order_by_tracking",
      "get_pickup_slots",
      "get_public_settings",
      "get_storefront_menu",
      "place_order",
      "register_customer_push_device",
      "submit_franchise_inquiry",
    ]);
  });

  // The column is kept so that adding dine-in later is a constraint change
  // rather than a migration of every order row. Until then it does not accept
  // one.
  it("pin orders.service_mode to pickup", async () => {
    await db.exec(`
      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches (slug, name, short_name, format, price_list_id,
                            address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Somewhere', 'Cebu City'
      from price_lists where slug = 'standard';
    `);
    await expect(
      db.exec(`
        insert into orders (short_code, branch_id, price_list_id, pickup_code,
                            service_mode, customer_name, customer_phone)
        select 'NY-DINEIN', b.id, b.price_list_id, '1234', 'dine_in',
               'Test', '09170000000'
        from branches b where b.slug = 'pilot'
      `),
    ).rejects.toThrow(/service_mode/);
  });
});

describe("option pricing", () => {
  let db: PGlite;
  let ids: {
    optionFlat: string;
    optionPerVariation: string;
    optionFree: string;
    half: string;
    full: string;
    listStandard: string;
    listOther: string;
  };

  // A miniature menu rather than the real seed, so each of the three
  // resolution paths can be isolated. The seed exercises the same function
  // against the real numbers in seed.test.ts.
  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into price_lists (slug, name)
        values ('standard', 'Standard'), ('kiosk', 'Kiosk');
      insert into menu_categories (slug, name) values ('wings', 'Wings');
      insert into menu_items (category_id, slug, name)
        select id, 'wings', 'Wings' from menu_categories where slug = 'wings';
      insert into item_variations (item_id, slug, label, short_label, price_cents)
        select id, 'half', 'Half', 'HALF', 32900 from menu_items where slug = 'wings';
      insert into item_variations (item_id, slug, label, short_label, price_cents)
        select id, 'full', 'Full', 'FULL', 52900 from menu_items where slug = 'wings';
      insert into menu_option_groups (slug, name) values ('heat', 'Heat');
      insert into menu_options (group_id, slug, name, price_cents)
        select id, 'per-variation', 'Per variation', null from menu_option_groups where slug = 'heat';
      insert into menu_options (group_id, slug, name, price_cents)
        select id, 'flat', 'Flat', 1500 from menu_option_groups where slug = 'heat';
      insert into menu_options (group_id, slug, name, price_cents)
        select id, 'free', 'Free', null from menu_option_groups where slug = 'heat';
    `);

    const row = (
      await db.query<Record<string, string>>(`
        select
          (select id from menu_options where slug = 'flat') as "optionFlat",
          (select id from menu_options where slug = 'per-variation') as "optionPerVariation",
          (select id from menu_options where slug = 'free') as "optionFree",
          (select id from item_variations where slug = 'half') as half,
          (select id from item_variations where slug = 'full') as full,
          (select id from price_lists where slug = 'standard') as "listStandard",
          (select id from price_lists where slug = 'kiosk') as "listOther"
      `)
    ).rows[0];
    ids = row as typeof ids;

    await db.exec(`
      insert into menu_option_variation_prices (option_id, variation_id, price_list_id, price_cents)
      values
        ('${ids.optionPerVariation}', '${ids.half}', '${ids.listStandard}', 3000),
        ('${ids.optionPerVariation}', '${ids.full}', '${ids.listStandard}', 4000);
    `);
  }, 120_000);

  // Centavos come back from a bigint column, which the driver may hand over
  // as a number or a bigint depending on magnitude. Normalise once.
  const resolve = async (option: string, variation: string, list: string) =>
    Number(
      await scalar<number | bigint>(
        db,
        `select resolve_option_price_cents('${option}', '${variation}', '${list}')`,
      ),
    );

  it("path 1: a variation-specific row wins", async () => {
    expect(
      await resolve(ids.optionPerVariation, ids.half, ids.listStandard),
    ).toBe(3000);
    expect(
      await resolve(ids.optionPerVariation, ids.full, ids.listStandard),
    ).toBe(4000);
  });

  it("path 2: falls back to the option's flat price", async () => {
    expect(await resolve(ids.optionFlat, ids.half, ids.listStandard)).toBe(
      1500,
    );
    // Flat means flat: the variation makes no difference on this path.
    expect(await resolve(ids.optionFlat, ids.full, ids.listStandard)).toBe(
      1500,
    );
  });

  it("path 3: free when neither exists", async () => {
    expect(await resolve(ids.optionFree, ids.half, ids.listStandard)).toBe(0);
  });

  // The failure that would actually ship: a second price list is created, the
  // override rows are written for the first, and the new branch quietly gives
  // its heat away. Resolution is per price list, and this proves it.
  it("does not leak one price list's overrides into another", async () => {
    expect(await resolve(ids.optionPerVariation, ids.half, ids.listOther)).toBe(
      0,
    );
  });

  it("resolves a variation price from the list, then from the base row", async () => {
    const base = await scalar<number | bigint>(
      db,
      `select resolve_variation_price_cents('${ids.half}', '${ids.listStandard}')`,
    );
    expect(Number(base)).toBe(32900);

    await db.exec(`
      insert into item_variation_prices (variation_id, price_list_id, price_cents)
      values ('${ids.half}', '${ids.listOther}', 35900)
    `);
    const overridden = await scalar<number | bigint>(
      db,
      `select resolve_variation_price_cents('${ids.half}', '${ids.listOther}')`,
    );
    expect(Number(overridden)).toBe(35900);
  });

  // Null here means "this variation does not exist", which callers must treat
  // as a hard error. A missing item price is a bug, not a discount, and this
  // is the line that separates it from the deliberate 0 above.
  it("returns null for an unknown variation rather than zero", async () => {
    const missing = await scalar<number | null>(
      db,
      `select resolve_variation_price_cents(
         '00000000-0000-0000-0000-000000000000', '${ids.listStandard}')`,
    );
    expect(missing).toBeNull();
  });
});

describe("pickup slots and hours", () => {
  let db: PGlite;
  let branchId: string;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches (slug, name, short_name, format, price_list_id,
                            address_line, city, is_active, is_accepting_orders)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Somewhere', 'Cebu City', true, true
      from price_lists where slug = 'standard';
    `);
    branchId = await scalar<string>(
      db,
      `select id from branches where slug = 'pilot'`,
    );
  }, 120_000);

  it("refuse to reserve past capacity", async () => {
    await db.exec(`
      insert into pickup_slots (branch_id, slot_start, capacity, reserved)
      values ('${branchId}', timestamptz '2026-09-01 19:00+08', 6, 6)
    `);
    await expect(
      db.exec(`
        update pickup_slots set reserved = reserved + 1
        where branch_id = '${branchId}'
      `),
    ).rejects.toThrow(/pickup_slots_within_capacity/);
  });

  it("refuse two orders the same live pickup code at one branch", async () => {
    const order = (code: string, status: string) => `
      insert into orders (short_code, branch_id, price_list_id, pickup_code, status,
                          customer_name, customer_phone)
      select '${code}', '${branchId}', pl.id, '4242', '${status}', 'Test', '09170000000'
      from price_lists pl where pl.slug = 'standard';
    `;
    await db.exec(order("NY-AAAAAA", "ready"));
    await expect(db.exec(order("NY-BBBBBB", "pending"))).rejects.toThrow(
      /orders_active_pickup_code_key/,
    );
    // Once the first order is off the counter the code is free again, which is
    // the only reason four digits is enough.
    await db.exec(order("NY-CCCCCC", "claimed"));
  });

  // No hours means closed. The real weekday hours are still an open question
  // for the owner, and a platform that invents them is worse than one that
  // says it does not know.
  it("report a branch with no store_hours as closed", async () => {
    const open = await scalar<boolean>(
      db,
      `select branch_is_open_at('${branchId}', timestamptz '2026-09-01 12:00+08')`,
    );
    expect(open).toBe(false);
  });

  it("respect a normal window", async () => {
    // 2026-09-01 is a Tuesday in Asia/Manila, so weekday 2.
    await db.exec(`
      insert into store_hours (branch_id, weekday, opens_at, closes_at)
      values ('${branchId}', 2, '10:00', '21:00')
    `);
    const at = (iso: string) =>
      scalar<boolean>(
        db,
        `select branch_is_open_at('${branchId}', timestamptz '${iso}')`,
      );

    expect(await at("2026-09-01 09:59+08")).toBe(false);
    expect(await at("2026-09-01 10:00+08")).toBe(true);
    expect(await at("2026-09-01 20:59+08")).toBe(true);
    expect(await at("2026-09-01 21:00+08")).toBe(false);
  });

  // A forecourt that trades until 2am is not an exotic case in this branch
  // mix, and the tail after midnight belongs to the day the window opened on.
  it("respect a window that crosses midnight", async () => {
    // Wednesday, weekday 3.
    await db.exec(`
      insert into store_hours (branch_id, weekday, opens_at, closes_at)
      values ('${branchId}', 3, '18:00', '02:00')
    `);
    const at = (iso: string) =>
      scalar<boolean>(
        db,
        `select branch_is_open_at('${branchId}', timestamptz '${iso}')`,
      );

    expect(await at("2026-09-02 17:59+08")).toBe(false);
    expect(await at("2026-09-02 23:30+08")).toBe(true);
    // Thursday 01:00 is still Wednesday's shift.
    expect(await at("2026-09-03 01:00+08")).toBe(true);
    expect(await at("2026-09-03 02:00+08")).toBe(false);
  });

  it("treats an equal open and close time as a real 24-hour day", async () => {
    // Central Bloc is owner-confirmed 24/7. Equal times used to be rejected as
    // a typo, which made every representation contain a fabricated closure.
    await db.exec(`
      insert into store_hours (branch_id, weekday, opens_at, closes_at)
      values ('${branchId}', 4, '00:00', '00:00')
    `);
    const at = (iso: string) => scalar<boolean>(
      db,
      `select branch_is_open_at('${branchId}', timestamptz '${iso}')`,
    );
    expect(await at("2026-09-03 00:00+08")).toBe(true);
    expect(await at("2026-09-03 12:34+08")).toBe(true);
    expect(await at("2026-09-03 23:59+08")).toBe(true);
  });

  it("stay closed while the branch is inactive", async () => {
    await db.exec(
      `update branches set is_active = false where id = '${branchId}'`,
    );
    const open = await scalar<boolean>(
      db,
      `select branch_is_open_at('${branchId}', timestamptz '2026-09-01 12:00+08')`,
    );
    expect(open).toBe(false);
    await db.exec(
      `update branches set is_active = true where id = '${branchId}'`,
    );
  });

  it("gate ordering on the global switch as well as the branch", async () => {
    const accepts = () =>
      scalar<boolean>(
        db,
        `select branch_accepts_orders('${branchId}', timestamptz '2026-09-01 12:00+08')`,
      );
    expect(await accepts()).toBe(true);

    await db.exec(
      `update app_settings set accepting_orders = false where id = 1`,
    );
    expect(await accepts()).toBe(false);
    await db.exec(
      `update app_settings set accepting_orders = true where id = 1`,
    );

    await db.exec(
      `update branches set is_accepting_orders = false where id = '${branchId}'`,
    );
    expect(await accepts()).toBe(false);
  });
});

describe("code generators", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
  }, 120_000);

  it("produce short codes with no lookalike characters", async () => {
    const result = await db.query<{ code: string }>(
      `select generate_short_code() as code from generate_series(1, 200)`,
    );
    for (const { code } of result.rows) {
      expect(code).toMatch(/^NY-[2-9A-HJ-NP-Z]{6}$/);
    }
  });

  it("produce four-digit pickup codes across the whole range", async () => {
    const result = await db.query<{ code: string }>(
      `select generate_pickup_code() as code from generate_series(1, 500)`,
    );
    const codes = result.rows.map((row) => row.code);
    for (const code of codes) expect(code).toMatch(/^[0-9]{4}$/);
    // Leading zeros must survive: lpad, not a bare cast.
    expect(codes.every((code) => code.length === 4)).toBe(true);
    expect(new Set(codes).size).toBeGreaterThan(400);
  });
});

describe("rate limiter", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
  }, 120_000);

  it("allows up to the limit, then refuses", async () => {
    const hit = () => scalar<boolean>(db, `select rate_limit_hit('k', 3, 60)`);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(true);
    expect(await hit()).toBe(false);
  });

  it("rolls the window when it goes stale", async () => {
    await db.exec(`select rate_limit_hit('roll', 1, 60)`);
    expect(
      await scalar<boolean>(db, `select rate_limit_hit('roll', 1, 60)`),
    ).toBe(false);
    await db.exec(`update rate_limits set window_start = now() - interval '2 hours'
                   where key = 'roll'`);
    expect(
      await scalar<boolean>(db, `select rate_limit_hit('roll', 1, 60)`),
    ).toBe(true);
  });
});
