import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import {
  ALL_PERMISSIONS,
  BUSINESS_WIDE_PERMISSIONS,
  resolvePermissions,
  roleDefaultPermissions,
  STAFF_JOB_ROLES,
  type PermissionOverride,
  type StaffJobRole,
} from "@/lib/staff/roles";
import { freshDatabase, scalar } from "./harness";

const ROVING_ID = "75000000-0000-4000-8000-000000000001";
const PINNED_ID = "75000000-0000-4000-8000-000000000002";
const GRANTED_ID = "75000000-0000-4000-8000-000000000003";
const CASHIER_ID = "75000000-0000-4000-8000-000000000004";

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

/**
 * The four people this file is about, described once for both sides.
 *
 * Each entry is what the database row says and what lib/staff/roles.ts would
 * be handed for the same person, so the parity test below can ask both the
 * same question without restating either.
 */
type Persona = {
  id: string;
  role: StaffJobRole;
  pinned: boolean;
  overrides: PermissionOverride[];
};

const PERSONAS: Persona[] = [
  { id: ROVING_ID, role: "manager", pinned: false, overrides: [] },
  { id: PINNED_ID, role: "manager", pinned: true, overrides: [] },
  {
    id: GRANTED_ID,
    role: "manager",
    pinned: true,
    overrides: [{ permission: "menu:configure", granted: true }],
  },
  { id: CASHIER_ID, role: "cashier", pinned: true, overrides: [] },
];

describe("business wide permissions", () => {
  let db: PGlite;
  let branchId: string;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email)
      values
        ('${ROVING_ID}', 'roving@example.com'),
        ('${PINNED_ID}', 'pinned@example.com'),
        ('${GRANTED_ID}', 'granted@example.com'),
        ('${CASHIER_ID}', 'cashier@example.com');

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';

      insert into profiles (id, role, staff_role, display_name, branch_id)
      values ('${ROVING_ID}', 'staff', 'manager', 'Roving', null);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${PINNED_ID}', 'staff', 'manager', 'Pinned', id from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${GRANTED_ID}', 'staff', 'manager', 'Granted', id from branches where slug = 'pilot';
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${CASHIER_ID}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';

      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${GRANTED_ID}', 'menu:configure', true);
    `);
    branchId = await scalar<string>(db, `select id::text from branches where slug = 'pilot'`);
  }, 120_000);

  it("names the same permissions as business wide on both sides", async () => {
    for (const permission of ALL_PERMISSIONS) {
      const inSql = await scalar<boolean>(
        db,
        `select business_wide_permission('${permission}')`,
      );
      expect(inSql, permission).toBe(
        (BUSINESS_WIDE_PERMISSIONS as readonly string[]).includes(permission),
      );
    }
  });

  it("gives the same role defaults as the app, before any override or branch", async () => {
    // 0060 lifted this list out of the case expression inside
    // current_staff_has_permission so that admin_set_staff_permission could
    // read it too, rather than a third copy of it. Two copies remain, one here
    // and one in ROLE_PERMISSIONS, and this is the tripwire between them: the
    // function decides whether a switch writes a row or deletes one, so a
    // disagreement would make a switch look like it worked and change nothing.
    for (const role of STAFF_JOB_ROLES) {
      const fromApp = roleDefaultPermissions(role);
      for (const permission of ALL_PERMISSIONS) {
        const inSql = await scalar<boolean>(
          db,
          `select role_default_permission('${role}'::staff_role, '${permission}')`,
        );
        expect(inSql, `${role} ${permission}`).toBe(fromApp.includes(permission));
      }
    }
  });

  it("gives a profile with no job role nothing at all", async () => {
    // The else arm. A null staff_role reaches this only on an admin row, whose
    // permission check short circuits before it, but the function is callable
    // on its own and should not answer true to anything here.
    for (const permission of ALL_PERMISSIONS) {
      expect(
        await scalar<boolean>(db, `select role_default_permission(null, '${permission}')`),
        permission,
      ).toBe(false);
    }
  });

  it("gives the same answer as the app for every permission and every person", async () => {
    // The drift guard. current_staff_has_permission and resolvePermissions are
    // two implementations of one rule, and the app hiding a button the database
    // still allows (or refusing one it allows) is the failure this catches.
    // 0024 added the same shape of test for order transitions.
    for (const persona of PERSONAS) {
      const resolved = resolvePermissions(
        persona.role,
        persona.overrides,
        persona.pinned ? branchId : null,
      );
      for (const permission of ALL_PERMISSIONS) {
        const [row] = await asUser<{ allowed: boolean }>(
          db,
          persona.id,
          `select current_staff_has_permission('${permission}') as allowed`,
        );
        expect(row?.allowed, `${persona.id} ${permission}`).toBe(
          resolved.includes(permission),
        );
      }
    }
  });

  it("keeps the catalog from a pinned manager and hands it over by exception", async () => {
    // asUser sets auth.uid() per call, so each of these asks as one person.
    const configure = async (id: string) =>
      (
        await asUser<{ allowed: boolean }>(
          db,
          id,
          `select current_staff_has_permission('menu:configure') as allowed`,
        )
      )[0]?.allowed;

    expect(await configure(ROVING_ID), "roving").toBe(true);
    expect(await configure(PINNED_ID), "pinned").toBe(false);
    expect(await configure(GRANTED_ID), "granted by exception").toBe(true);
    expect(await configure(CASHIER_ID), "cashier").toBe(false);
  });

  it("still lets an override take a business wide permission away", async () => {
    // The new arm must not have turned the override into a one-way switch: a
    // denial on the roving manager is still a denial.
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${ROVING_ID}', 'menu:configure', false)
    `);
    const [row] = await asUser<{ allowed: boolean }>(
      db,
      ROVING_ID,
      `select current_staff_has_permission('menu:configure') as allowed`,
    );
    expect(row?.allowed).toBe(false);
    await db.exec(`delete from staff_permission_overrides where profile_id = '${ROVING_ID}'`);
  });

  it("keeps the helper away from anonymous sessions", async () => {
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('anon', 'business_wide_permission(text)', 'execute')`,
      ),
    ).toBe(false);
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege('authenticated', 'business_wide_permission(text)', 'execute')`,
      ),
    ).toBe(true);
  });
});
