import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * admin_set_staff_permissions: the write behind the Manage permissions panel.
 *
 * Two things are worth testing here and they pull in different directions.
 *
 * The first is per permission: the function takes a desired state rather than
 * an instruction, so it has to pick between writing a row and deleting one,
 * and the answer depends on what the role and the branch already give. The
 * case that makes it subtle is menu:configure on a branch-assigned manager,
 * where the role says yes and the branch says no, so switching it on is the
 * one thing that must write a row rather than read as a return to the default.
 *
 * The second is across the set: Save is one decision, so a set with a bad line
 * in it must leave nothing behind. That is the whole reason the loop is in the
 * database instead of the browser, and "wrote nothing at all" is the assertion
 * that proves it.
 */

const ADMIN_ID = "76000000-0000-4000-8000-000000000001";
const SECOND_ADMIN_ID = "76000000-0000-4000-8000-000000000002";
const CASHIER_ID = "76000000-0000-4000-8000-000000000003";
const PINNED_MANAGER_ID = "76000000-0000-4000-8000-000000000004";
const MISSING_ID = "76000000-0000-4000-8000-0000000000ff";

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

/** Saves a set of changes as the Super Admin and hands back the outcome map. */
async function save(
  db: PGlite,
  targetId: string,
  changes: Record<string, boolean>,
  actorId: string = ADMIN_ID,
): Promise<Record<string, string>> {
  const rows = await asUser<{ outcomes: Record<string, string> }>(
    db,
    actorId,
    `select admin_set_staff_permissions(
       '${targetId}'::uuid, '${JSON.stringify(changes)}'::jsonb
     ) as outcomes`,
  );
  return rows[0]!.outcomes;
}

async function overrideRow(
  db: PGlite,
  targetId: string,
  permission: string,
): Promise<boolean | null> {
  const { rows } = await db.query<{ granted: boolean }>(
    `select granted from staff_permission_overrides
     where profile_id = '${targetId}' and permission = '${permission}'`,
  );
  return rows.length === 0 ? null : rows[0]!.granted;
}

async function holds(db: PGlite, id: string, permission: string): Promise<boolean> {
  const rows = await asUser<{ allowed: boolean }>(
    db,
    id,
    `select current_staff_has_permission('${permission}') as allowed`,
  );
  return rows[0]!.allowed;
}

async function auditCount(db: PGlite): Promise<number> {
  return Number(
    await scalar<string>(
      db,
      `select count(*)::text from audit_logs where action like 'workspace.permission_%'`,
    ),
  );
}

describe("admin_set_staff_permissions", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email)
      values
        ('${ADMIN_ID}', 'admin@example.com'),
        ('${SECOND_ADMIN_ID}', 'admin2@example.com'),
        ('${CASHIER_ID}', 'cashier@example.com'),
        ('${PINNED_MANAGER_ID}', 'pinned@example.com');

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';

      insert into profiles (id, role, staff_role, display_name, branch_id)
      values
        ('${ADMIN_ID}', 'admin', null, 'Super Admin', null),
        ('${CASHIER_ID}', 'staff', 'cashier', 'Cashier', null);

      -- Revoked, because profiles_one_active_admin_idx from 0022 allows one
      -- active admin and only one. A stood-down admin is the only second admin
      -- row that can exist, and it is the one worth testing: the guard has to
      -- read the role on the row, not whether the account still works.
      insert into profiles (id, role, staff_role, display_name, branch_id, is_active)
      values ('${SECOND_ADMIN_ID}', 'admin', null, 'Former Admin', null, false);
      insert into profiles (id, role, staff_role, display_name, branch_id)
      select '${PINNED_MANAGER_ID}', 'staff', 'manager', 'Pinned', id
      from branches where slug = 'pilot';
    `);
  }, 120_000);

  describe("a set of changes", () => {
    it("applies every one of them, and says what each became", async () => {
      const outcomes = await save(db, CASHIER_ID, {
        "refunds:manage": true,
        "audit:view": true,
        "orders:manage": false,
      });
      expect(outcomes).toEqual({
        "refunds:manage": "granted",
        "audit:view": "granted",
        "orders:manage": "revoked",
      });
      expect(await holds(db, CASHIER_ID, "refunds:manage")).toBe(true);
      expect(await holds(db, CASHIER_ID, "audit:view")).toBe(true);
      expect(await holds(db, CASHIER_ID, "orders:manage")).toBe(false);
    });

    it("takes them all back off again in one call", async () => {
      const outcomes = await save(db, CASHIER_ID, {
        "refunds:manage": false,
        "audit:view": false,
        "orders:manage": true,
      });
      expect(outcomes).toEqual({
        "refunds:manage": "inherited",
        "audit:view": "inherited",
        "orders:manage": "inherited",
      });
      // All three were back on their default, so no rows are left at all.
      expect(
        await scalar<string>(
          db,
          `select count(*)::text from staff_permission_overrides
           where profile_id = '${CASHIER_ID}'`,
        ),
      ).toBe("0");
    });

    it("writes nothing at all when one line of the set is bad", async () => {
      // The guarantee the Save button is for. A set is one decision, so a set
      // that cannot be honoured in full is not honoured in part.
      const before = await auditCount(db);
      await expect(
        save(db, CASHIER_ID, { "refunds:manage": true, "orders:delete": true }),
      ).rejects.toThrow(/UNKNOWN_PERMISSION/);

      expect(await overrideRow(db, CASHIER_ID, "refunds:manage")).toBeNull();
      expect(await holds(db, CASHIER_ID, "refunds:manage")).toBe(false);
      expect(await auditCount(db)).toBe(before);
    });

    it("refuses a value that is not a yes or a no", async () => {
      await expect(
        db
          .query(
            `select admin_set_staff_permissions(
               '${CASHIER_ID}'::uuid, '{"refunds:manage": "yes"}'::jsonb
             )`,
          )
          .then(() => undefined, (error: Error) => Promise.reject(error)),
      ).rejects.toThrow();
      expect(await overrideRow(db, CASHIER_ID, "refunds:manage")).toBeNull();
    });

    it("refuses an empty set rather than writing an empty save", async () => {
      await expect(save(db, CASHIER_ID, {})).rejects.toThrow(/NO_CHANGES/);
    });
  });

  describe("a permission that is already where it is being put", () => {
    it("writes no row and no audit line", async () => {
      // A stale page re-sending a value that was already true used to log a
      // change that did not happen.
      const before = await auditCount(db);
      const outcomes = await save(db, CASHIER_ID, {
        "orders:view": true,
        "refunds:manage": false,
      });
      expect(outcomes).toEqual({
        "orders:view": "unchanged",
        "refunds:manage": "unchanged",
      });
      expect(await auditCount(db)).toBe(before);
    });

    it("still clears a redundant row that agrees with the role", async () => {
      // Not the same thing as no row, though the panel reads both as
      // inherited. One can only arrive from an older hand edit, and asking for
      // the default is the moment to be rid of it.
      await db.exec(`
        insert into staff_permission_overrides (profile_id, permission, granted)
        values ('${CASHIER_ID}', 'orders:view', true)
      `);
      const outcomes = await save(db, CASHIER_ID, { "orders:view": true });
      expect(outcomes).toEqual({ "orders:view": "inherited" });
      expect(await overrideRow(db, CASHIER_ID, "orders:view")).toBeNull();
      expect(await holds(db, CASHIER_ID, "orders:view")).toBe(true);
    });
  });

  describe("the catalog, for a manager pinned to one counter", () => {
    it("writes a row to switch it on, because the branch took the default away", async () => {
      // Comparing against the role alone would read this as a return to the
      // Manager default, delete nothing, write nothing, and leave the manager
      // without the catalog while the screen said otherwise.
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(false);
      expect(await save(db, PINNED_MANAGER_ID, { "menu:configure": true })).toEqual({
        "menu:configure": "granted",
      });
      expect(await overrideRow(db, PINNED_MANAGER_ID, "menu:configure")).toBe(true);
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(true);
    });

    it("deletes the row to switch it off again", async () => {
      expect(await save(db, PINNED_MANAGER_ID, { "menu:configure": false })).toEqual({
        "menu:configure": "inherited",
      });
      expect(await overrideRow(db, PINNED_MANAGER_ID, "menu:configure")).toBeNull();
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(false);
    });

    it("still stores a denial for a permission the branch did not already take", async () => {
      expect(await save(db, PINNED_MANAGER_ID, { "analytics:view": false })).toEqual({
        "analytics:view": "revoked",
      });
      expect(await overrideRow(db, PINNED_MANAGER_ID, "analytics:view")).toBe(false);
      await save(db, PINNED_MANAGER_ID, { "analytics:view": true });
    });
  });

  describe("who may call it, and about whom", () => {
    it("refuses a staff caller", async () => {
      await expect(
        save(db, PINNED_MANAGER_ID, { "refunds:manage": true }, CASHIER_ID),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("refuses the Super Admin changing themselves", async () => {
      await expect(save(db, ADMIN_ID, { "refunds:manage": false })).rejects.toThrow(
        /CANNOT_CHANGE_SELF/,
      );
    });

    it("refuses another admin account, even a stood-down one", async () => {
      await expect(
        save(db, SECOND_ADMIN_ID, { "refunds:manage": false }),
      ).rejects.toThrow(/CANNOT_CHANGE_ADMIN/);
    });

    it("refuses an account that does not exist", async () => {
      await expect(save(db, MISSING_ID, { "refunds:manage": true })).rejects.toThrow(
        /ACCOUNT_NOT_FOUND/,
      );
    });

    it("leaves the table itself unwritable by a session", async () => {
      // 0022 revoked the writes and neither 0060 nor 0061 gives them back: the
      // function is the only way in, which is what makes its guards mean
      // anything.
      for (const privilege of ["insert", "update", "delete"]) {
        expect(
          await scalar<boolean>(
            db,
            `select has_table_privilege(
               'authenticated', 'staff_permission_overrides', '${privilege}'
             )`,
          ),
          privilege,
        ).toBe(false);
      }
    });

    it("keeps the function away from anonymous sessions", async () => {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege(
             'anon', 'admin_set_staff_permissions(uuid, jsonb)', 'execute'
           )`,
        ),
      ).toBe(false);
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege(
             'authenticated', 'admin_set_staff_permissions(uuid, jsonb)', 'execute'
           )`,
        ),
      ).toBe(true);
    });

    it("leaves no single-permission function behind", async () => {
      // 0060's signature is dropped, not shadowed. create or replace matches on
      // argument types, so a leftover signature stays callable by anything
      // holding its grant, which 0059 hit with staff_set_menu_item_hold.
      expect(
        await scalar<string>(
          db,
          `select count(*)::text from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'admin_set_staff_permission'`,
        ),
      ).toBe("0");
    });
  });

  describe("the audit trail", () => {
    it("writes one row per permission, not one per save", async () => {
      await db.exec(`delete from audit_logs`);
      await save(db, CASHIER_ID, {
        "vouchers:manage": true,
        "settings:manage": true,
      });

      const { rows } = await db.query<{ action: string; diff: { permission: string } }>(
        `select action, diff from audit_logs order by id`,
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.diff.permission).sort()).toEqual([
        "settings:manage",
        "vouchers:manage",
      ]);
      expect(new Set(rows.map((row) => row.action))).toEqual(
        new Set(["workspace.permission_granted"]),
      );
    });

    it("points at the person, through the overrides table, with no branch", async () => {
      await db.exec(`delete from audit_logs`);
      await save(db, CASHIER_ID, { "vouchers:manage": false });

      const { rows } = await db.query<{
        actor_profile_id: string;
        target_table: string;
        target_id: string;
        branch_id: string | null;
      }>(`select actor_profile_id, target_table, target_id, branch_id from audit_logs`);
      expect(rows[0]).toMatchObject({
        actor_profile_id: ADMIN_ID,
        target_table: "staff_permission_overrides",
        target_id: CASHIER_ID,
      });
      // Null, and it must stay null. The read policy restated in 0056 admits a
      // null-branch row to a business wide session only, which is what keeps a
      // branch manager out of rows about other people's accounts.
      expect(rows[0]!.branch_id).toBeNull();
    });

    it("records both sides of the row, and nothing from the profile", async () => {
      await db.exec(`delete from audit_logs`);
      await save(db, CASHIER_ID, { "analytics:view": true });
      await save(db, CASHIER_ID, { "analytics:view": false });

      const { rows } = await db.query<{ diff: Record<string, unknown> }>(
        `select diff from audit_logs order by id`,
      );
      expect(rows[0]!.diff).toEqual({
        permission: "analytics:view",
        before: null,
        after: true,
        role_default: false,
      });
      // Back to the default: the row that existed is gone, so after is null.
      // Null on either side means "no row, inheriting from the role".
      expect(rows[1]!.diff).toEqual({
        permission: "analytics:view",
        before: true,
        after: null,
        role_default: false,
      });
      // profiles carries a phone column. A diff that never holds the profile
      // row cannot leak it however the audit policies are rewritten later.
      for (const row of rows) {
        expect(Object.keys(row.diff)).toEqual([
          "after",
          "before",
          "permission",
          "role_default",
        ]);
      }
      await db.exec(`delete from staff_permission_overrides`);
    });
  });
});
