import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase } from "./harness";

/**
 * Migration 0098: promo codes in the audit log are readable only with promo
 * code access, and the database is what enforces it.
 *
 * Run as the real `authenticated` role, so the policies do the work. The
 * branch manager here is the one the owner's 2026-08-27 ruling describes: it
 * still sees the voucher entries, and must not see the code in them.
 */

const BRANCH_MANAGER = "76000000-0000-4000-8000-000000000001";
const PROMO_MANAGER = "76000000-0000-4000-8000-000000000002";
const SUPER_ADMIN = "76000000-0000-4000-8000-000000000003";
const OTHER_BRANCH_MANAGER = "76000000-0000-4000-8000-000000000004";
const VOUCHER_ID = "76000000-0000-4000-8000-0000000000aa";
const MENU_ITEM_ID = "76000000-0000-4000-8000-0000000000bb";

async function actingAs<T>(db: PGlite, profileId: string, sql: string): Promise<readonly T[]> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${profileId}'::uuid $$;
  `);
  await db.exec("set role authenticated");
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

describe("promo codes in the audit log", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email) values
        ('${BRANCH_MANAGER}', 'pilot.manager@example.com'),
        ('${PROMO_MANAGER}', 'promo.manager@example.com'),
        ('${SUPER_ADMIN}', 'admin@example.com'),
        ('${OTHER_BRANCH_MANAGER}', 'other.manager@example.com');

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City' from price_lists;
      insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
      select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City' from price_lists;

      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${BRANCH_MANAGER}', 'staff', 'manager', 'Pilot Manager', id from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${PROMO_MANAGER}', 'staff', 'manager', 'Roving Manager', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${SUPER_ADMIN}', 'admin', null, 'Super Admin', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${OTHER_BRANCH_MANAGER}', 'staff', 'manager', 'Other Manager', id from branches where slug = 'other';

      insert into orders (short_code, branch_id, price_list_id, pickup_code, customer_name, customer_phone)
      select 'NY-OTHER9', id, price_list_id, '2222', 'Other Customer', '09170000001'
      from branches where slug = 'other';

      insert into audit_logs (actor_profile_id, action, target_table, target_id, diff) values
        ('${SUPER_ADMIN}', 'voucher.create', 'vouchers', '${VOUCHER_ID}',
         '{"before": null, "after": {"code": "STAFF50", "amount_cents": 5000}}'::jsonb),
        ('${SUPER_ADMIN}', 'menu.item.updated', 'menu_items', '${MENU_ITEM_ID}',
         '{"before": {"code": "W1"}, "after": {"code": "W2"}}'::jsonb);
      insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
      select '${OTHER_BRANCH_MANAGER}', 'order.claimed', 'orders', id::text,
             '{"from": "ready", "to": "claimed", "voucher_code": "OTHER10"}'::jsonb
      from orders where short_code = 'NY-OTHER9';
    `);
  }, 120_000);

  it("keeps the voucher entry readable for a branch manager, without the code", async () => {
    const rows = await actingAs<{ action: string; diff: unknown }>(
      db,
      BRANCH_MANAGER,
      "select action, diff from audit_logs where target_table = 'vouchers'",
    );
    expect(rows).toEqual([
      {
        action: "voucher.create",
        diff: { before: null, after: { code: "[restricted]", amount_cents: 5000 } },
      },
    ]);
  });

  it("gives the branch manager no way to the full copy, even by asking the table directly", async () => {
    const rows = await actingAs(db, BRANCH_MANAGER, "select diff from audit_log_restricted_details");
    expect(rows).toEqual([]);
  });

  it("gives a promo code manager and the Super Admin the code back", async () => {
    for (const viewer of [PROMO_MANAGER, SUPER_ADMIN]) {
      const rows = await actingAs<{ code: string }>(
        db,
        viewer,
        `select r.diff->'after'->>'code' as code
         from audit_log_restricted_details r
         join audit_logs a on a.id = r.audit_log_id
         where a.target_table = 'vouchers'`,
      );
      expect(rows).toEqual([{ code: "STAFF50" }]);
    }
  });

  it("never widens what the audit policy allows: no full copy of another branch's row", async () => {
    // The branch manager holds no vouchers:manage, but even granted it, the
    // order row at another branch stays out of reach because the audit row does.
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${BRANCH_MANAGER}', 'vouchers:manage', true)
    `);
    try {
      const rows = await actingAs<{ diff: unknown }>(
        db,
        BRANCH_MANAGER,
        `select r.diff from audit_log_restricted_details r
         where r.diff->>'voucher_code' = 'OTHER10'`,
      );
      expect(rows).toEqual([]);
    } finally {
      await db.exec(`delete from staff_permission_overrides where profile_id = '${BRANCH_MANAGER}'`);
    }
  });

  it("masks a promo code on an order row, and leaves a menu item's own code alone", async () => {
    const order = await actingAs<{ code: string }>(
      db,
      OTHER_BRANCH_MANAGER,
      "select diff->>'voucher_code' as code from audit_logs where action = 'order.claimed'",
    );
    expect(order).toEqual([{ code: "[restricted]" }]);

    const menu = await db.query<{ diff: unknown }>(
      "select diff from audit_logs where target_table = 'menu_items'",
    );
    expect(menu.rows[0]?.diff).toEqual({ before: { code: "W1" }, after: { code: "W2" } });
  });

  it("is not something an anonymous visitor can touch", async () => {
    const grant = await db.query<{ allowed: boolean }>(
      "select has_table_privilege('anon', 'audit_log_restricted_details', 'select') as allowed",
    );
    expect(grant.rows[0]?.allowed).toBe(false);
  });
});

describe("the voucher save path through 0098", () => {
  it("splits any voucher entry at insert, keeping the masked phones as they are", async () => {
    const db = await freshDatabase();
    // Any writer is covered because the split is a trigger. A direct insert
    // shaped like the RPC's is enough to show the trigger fires on it.
    await db.exec(`
      insert into audit_logs (action, target_table, target_id, diff)
      values ('voucher.update', 'vouchers', 'v1',
              '{"before": {"code": "OLD"}, "after": {"code": "NEW"}, "scope": {"customerPhones": ["***4567"]}}'::jsonb)
    `);
    const visible = await db.query<{ diff: unknown }>("select diff from audit_logs");
    expect(visible.rows[0]?.diff).toEqual({
      before: { code: "[restricted]" },
      after: { code: "[restricted]" },
      scope: { customerPhones: ["***4567"] },
    });
    const full = await db.query<{ diff: { after: { code: string } } }>(
      "select diff from audit_log_restricted_details",
    );
    expect(full.rows[0]?.diff.after.code).toBe("NEW");
  });
});
