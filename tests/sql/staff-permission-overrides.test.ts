import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * admin_set_staff_permission: the write 0022 left out and 0059 deferred.
 *
 * The function takes a desired state rather than an instruction, so the thing
 * worth testing is which of insert and delete it picks. A switch landing back
 * on what the role and the branch already give must delete its row, so the
 * person goes back to inheriting; a switch disagreeing with them must write
 * one. The case that makes this more than bookkeeping is menu:configure on a
 * branch-assigned manager, where the role says yes, the branch says no, and
 * the row is the only thing that can say yes again.
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

/** Calls the function as the Super Admin and hands back what it returned. */
async function setPermission(
  db: PGlite,
  targetId: string,
  permission: string,
  granted: boolean,
  actorId: string = ADMIN_ID,
): Promise<string> {
  const rows = await asUser<{ outcome: string }>(
    db,
    actorId,
    `select admin_set_staff_permission(
       '${targetId}'::uuid, '${permission}', ${granted}
     ) as outcome`,
  );
  return rows[0]!.outcome;
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

describe("admin_set_staff_permission", () => {
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

  describe("a permission the role withholds", () => {
    it("writes a row when it is switched on, and the person then holds it", async () => {
      expect(await setPermission(db, CASHIER_ID, "refunds:manage", true)).toBe("granted");
      expect(await overrideRow(db, CASHIER_ID, "refunds:manage")).toBe(true);
      expect(await holds(db, CASHIER_ID, "refunds:manage")).toBe(true);
    });

    it("deletes the row when it is switched back off, rather than storing a no", async () => {
      // The whole point of the two-position switch. Off is the cashier
      // default, so there is nothing to record, and the permission follows the
      // person if their role changes later.
      expect(await setPermission(db, CASHIER_ID, "refunds:manage", false)).toBe("inherited");
      expect(await overrideRow(db, CASHIER_ID, "refunds:manage")).toBeNull();
      expect(await holds(db, CASHIER_ID, "refunds:manage")).toBe(false);
    });
  });

  describe("a permission the role gives", () => {
    it("writes a denial when it is switched off", async () => {
      expect(await setPermission(db, CASHIER_ID, "orders:manage", false)).toBe("revoked");
      expect(await overrideRow(db, CASHIER_ID, "orders:manage")).toBe(false);
      expect(await holds(db, CASHIER_ID, "orders:manage")).toBe(false);
    });

    it("deletes the denial when it is switched back on", async () => {
      expect(await setPermission(db, CASHIER_ID, "orders:manage", true)).toBe("inherited");
      expect(await overrideRow(db, CASHIER_ID, "orders:manage")).toBeNull();
      expect(await holds(db, CASHIER_ID, "orders:manage")).toBe(true);
    });

    it("replaces an existing row rather than raising on the primary key", async () => {
      await setPermission(db, CASHIER_ID, "audit:view", true);
      expect(await setPermission(db, CASHIER_ID, "audit:view", true)).toBe("granted");
      expect(await overrideRow(db, CASHIER_ID, "audit:view")).toBe(true);
      await setPermission(db, CASHIER_ID, "audit:view", false);
    });
  });

  describe("the catalog, for a manager pinned to one counter", () => {
    it("writes a row to switch it on, because the branch took the default away", async () => {
      // The case the whole design turns on. The Manager role lists
      // menu:configure, so comparing against the role alone would read this as
      // a return to the default, delete nothing, write nothing, and leave the
      // manager without the catalog while the screen said otherwise.
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(false);
      expect(await setPermission(db, PINNED_MANAGER_ID, "menu:configure", true)).toBe(
        "granted",
      );
      expect(await overrideRow(db, PINNED_MANAGER_ID, "menu:configure")).toBe(true);
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(true);
    });

    it("deletes the row to switch it off again", async () => {
      expect(await setPermission(db, PINNED_MANAGER_ID, "menu:configure", false)).toBe(
        "inherited",
      );
      expect(await overrideRow(db, PINNED_MANAGER_ID, "menu:configure")).toBeNull();
      expect(await holds(db, PINNED_MANAGER_ID, "menu:configure")).toBe(false);
    });

    it("still stores a denial for a permission the branch did not already take", async () => {
      expect(await setPermission(db, PINNED_MANAGER_ID, "analytics:view", false)).toBe(
        "revoked",
      );
      expect(await overrideRow(db, PINNED_MANAGER_ID, "analytics:view")).toBe(false);
      await setPermission(db, PINNED_MANAGER_ID, "analytics:view", true);
    });
  });

  describe("who may call it, and about whom", () => {
    it("refuses a staff caller", async () => {
      await expect(
        setPermission(db, PINNED_MANAGER_ID, "refunds:manage", true, CASHIER_ID),
      ).rejects.toThrow(/FORBIDDEN/);
    });

    it("refuses the Super Admin changing themselves", async () => {
      await expect(
        setPermission(db, ADMIN_ID, "refunds:manage", false),
      ).rejects.toThrow(/CANNOT_CHANGE_SELF/);
    });

    it("refuses another admin account, even a stood-down one", async () => {
      await expect(
        setPermission(db, SECOND_ADMIN_ID, "refunds:manage", false),
      ).rejects.toThrow(/CANNOT_CHANGE_ADMIN/);
    });

    it("refuses an account that does not exist", async () => {
      await expect(
        setPermission(db, MISSING_ID, "refunds:manage", true),
      ).rejects.toThrow(/ACCOUNT_NOT_FOUND/);
    });

    it("refuses a permission the app does not have", async () => {
      await expect(
        setPermission(db, CASHIER_ID, "orders:delete", true),
      ).rejects.toThrow(/UNKNOWN_PERMISSION/);
      expect(await overrideRow(db, CASHIER_ID, "orders:delete")).toBeNull();
    });

    it("leaves the table itself unwritable by a session", async () => {
      // 0022 revoked the writes and this migration does not give them back:
      // the function is the only way in, which is what makes its guards mean
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
             'anon', 'admin_set_staff_permission(uuid, text, boolean)', 'execute'
           )`,
        ),
      ).toBe(false);
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege(
             'authenticated', 'admin_set_staff_permission(uuid, text, boolean)', 'execute'
           )`,
        ),
      ).toBe(true);
    });
  });

  describe("the audit trail", () => {
    it("names each of the three outcomes", async () => {
      await db.exec(`delete from audit_logs`);
      await setPermission(db, CASHIER_ID, "vouchers:manage", true);
      await setPermission(db, CASHIER_ID, "vouchers:manage", false);
      await setPermission(db, CASHIER_ID, "orders:view", false);

      const { rows } = await db.query<{ action: string }>(
        `select action from audit_logs order by id`,
      );
      expect(rows.map((row) => row.action)).toEqual([
        "workspace.permission_granted",
        "workspace.permission_inherited",
        "workspace.permission_revoked",
      ]);
      await setPermission(db, CASHIER_ID, "orders:view", true);
    });

    it("points at the person, through the overrides table", async () => {
      await db.exec(`delete from audit_logs`);
      await setPermission(db, CASHIER_ID, "settings:manage", true);

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
      await setPermission(db, CASHIER_ID, "settings:manage", false);
    });

    it("records the permission and both sides of the row, and nothing from the profile", async () => {
      await db.exec(`delete from audit_logs`);
      await setPermission(db, CASHIER_ID, "analytics:view", true);
      await setPermission(db, CASHIER_ID, "analytics:view", false);

      const { rows } = await db.query<{ diff: Record<string, unknown> }>(
        `select diff from audit_logs order by id`,
      );
      expect(rows[0]!.diff).toEqual({
        permission: "analytics:view",
        before: null,
        after: true,
        role_default: false,
      });
      // Going back to the default: the row that existed is gone, so after is
      // null. Null on either side means "no row, inheriting from the role".
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
    });

    it("writes nothing at all when the call is refused", async () => {
      await db.exec(`delete from audit_logs`);
      await expect(
        setPermission(db, CASHIER_ID, "orders:delete", true),
      ).rejects.toThrow(/UNKNOWN_PERMISSION/);
      expect(await scalar<string>(db, `select count(*)::text from audit_logs`)).toBe("0");
    });
  });
});
