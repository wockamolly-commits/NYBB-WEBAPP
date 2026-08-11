import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * The audit trail describes operational rows that are already branch scoped,
 * so reading it has to be scoped the same way or the scope on the rows is
 * decoration. These tests run as the real `authenticated` role, so the policy
 * is doing the work rather than a WHERE clause in the reader.
 */

const BRANCH_MANAGER = "75000000-0000-4000-8000-000000000001";
const ROVING_MANAGER = "75000000-0000-4000-8000-000000000002";
const BRANCH_CASHIER = "75000000-0000-4000-8000-000000000003";
const SUPER_ADMIN = "75000000-0000-4000-8000-000000000004";

async function actingAs<T>(
  db: PGlite,
  profileId: string,
  sql: string,
): Promise<readonly T[]> {
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

async function actions(db: PGlite, profileId: string): Promise<string[]> {
  const rows = await actingAs<{ action: string }>(
    db,
    profileId,
    "select action from audit_logs order by action",
  );
  return rows.map((row) => row.action);
}

describe("Audit log scope", () => {
  let db: PGlite;
  let pilotOrderId: string;
  let otherOrderId: string;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email) values
        ('${BRANCH_MANAGER}', 'pilot.manager@example.com'),
        ('${ROVING_MANAGER}', 'roving.manager@example.com'),
        ('${BRANCH_CASHIER}', 'pilot.cashier@example.com'),
        ('${SUPER_ADMIN}', 'admin@example.com');

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';

      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${BRANCH_MANAGER}', 'staff', 'manager', 'Pilot Manager', id
      from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving Manager', null);
      insert into profiles (id, role, staff_role, display_name, branch_id, phone)
      select '${BRANCH_CASHIER}', 'staff', 'cashier', 'Pilot Cashier', id, '09170000009'
      from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${SUPER_ADMIN}', 'admin', null, 'Super Admin', null);

      insert into orders
        (short_code, branch_id, price_list_id, pickup_code,
         customer_name, customer_phone)
      select 'NY-PILOT1', id, price_list_id, '1111', 'Pilot Customer', '09170000000'
      from branches where slug = 'pilot';
      insert into orders
        (short_code, branch_id, price_list_id, pickup_code,
         customer_name, customer_phone)
      select 'NY-OTHER1', id, price_list_id, '2222', 'Other Customer', '09170000001'
      from branches where slug = 'other';
    `);

    pilotOrderId = await scalar<string>(
      db,
      `select id::text from orders where short_code = 'NY-PILOT1'`,
    );
    otherOrderId = await scalar<string>(
      db,
      `select id::text from orders where short_code = 'NY-OTHER1'`,
    );

    await db.exec(`
      insert into audit_logs (actor_profile_id, action, target_table, target_id, diff)
      values
        ('${BRANCH_CASHIER}', 'order.claimed', 'orders', '${pilotOrderId}',
         '{"from": "ready", "to": "claimed"}'::jsonb),
        ('${BRANCH_CASHIER}', 'order.claimed', 'orders', '${otherOrderId}',
         '{"from": "ready", "to": "claimed"}'::jsonb),
        ('${SUPER_ADMIN}', 'workspace.access_granted', 'profiles',
         '${BRANCH_CASHIER}', '{"after": {"is_active": true}}'::jsonb),
        ('${SUPER_ADMIN}', 'order.started', 'orders', 'not-a-uuid',
         '{"note": "a target id that is not an order"}'::jsonb);
    `);
  }, 120_000);

  it("stamps the branch of the order an entry is about", async () => {
    const rows = await db.query<{ short_name: string | null; target_id: string }>(`
      select b.short_name, a.target_id
      from audit_logs a
      left join branches b on b.id = a.branch_id
      where a.target_table = 'orders'
      order by a.id
    `);
    expect(rows.rows).toEqual([
      { short_name: "Pilot", target_id: pilotOrderId },
      { short_name: "Other", target_id: otherOrderId },
      // A target_id that is not a uuid must not raise, and must not guess.
      { short_name: null, target_id: "not-a-uuid" },
    ]);
  });

  it("leaves a company record business wide rather than assigning it a site", async () => {
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from audit_logs
         where target_table = 'profiles' and branch_id is null`,
      ),
    ).toBe(1);
  });

  it("keeps a branch manager out of another branch's trail", async () => {
    expect(await actions(db, BRANCH_MANAGER)).toEqual(["order.claimed"]);
    expect(
      await actingAs<{ target_id: string }>(
        db,
        BRANCH_MANAGER,
        "select target_id from audit_logs",
      ),
    ).toEqual([{ target_id: pilotOrderId }]);
  });

  it("keeps a branch manager out of the company records too", async () => {
    const visible = await actions(db, BRANCH_MANAGER);
    expect(visible).not.toContain("workspace.access_granted");
  });

  it("shows every site and the company records to an unassigned manager", async () => {
    expect(await actions(db, ROVING_MANAGER)).toEqual([
      "order.claimed",
      "order.claimed",
      "order.started",
      "workspace.access_granted",
    ]);
  });

  it("shows the whole trail to the Super Admin", async () => {
    expect((await actions(db, SUPER_ADMIN)).length).toBe(4);
  });

  it("shows nothing to a role without the audit permission", async () => {
    expect(await actions(db, BRANCH_CASHIER)).toEqual([]);
  });

  it("honors an explicit audit:view denial on a manager", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${ROVING_MANAGER}', 'audit:view', false)
    `);
    expect(await actions(db, ROVING_MANAGER)).toEqual([]);
    await db.exec(
      `delete from staff_permission_overrides where profile_id = '${ROVING_MANAGER}'`,
    );
  });

  it("shows nothing to an anonymous caller", async () => {
    await db.exec(`
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select null::uuid $$;
    `);
    await db.exec("set role anon");
    try {
      await expect(db.exec("select action from audit_logs")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  });

  it("scopes the coworker profiles that back the actor column", async () => {
    // The audit page names its actors, so widening the audit read widened the
    // profiles read with it. A branch manager sees their own branch and
    // themselves, never an unassigned admin and never another site's staff.
    const names = await actingAs<{ display_name: string }>(
      db,
      BRANCH_MANAGER,
      "select display_name from profiles order by display_name",
    );
    expect(names.map((row) => row.display_name)).toEqual([
      "Pilot Cashier",
      "Pilot Manager",
    ]);
  });

  it("never grants a browser role a way to write the trail", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(
          db.exec(`
            insert into audit_logs (action, target_table, target_id)
            values ('forged', 'orders', '${pilotOrderId}')
          `),
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
