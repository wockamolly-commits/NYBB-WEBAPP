import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "73000000-0000-4000-8000-000000000001";
const TARGET_ID = "73000000-0000-4000-8000-000000000002";
const OTHER_ADMIN_ID = "73000000-0000-4000-8000-000000000003";
const NEW_ADMIN_ID = "73000000-0000-4000-8000-000000000004";

describe("Workspace access administration", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email)
      values
        ('${ADMIN_ID}', 'owner@example.com'),
        ('${TARGET_ID}', 'team@example.com'),
        ('${OTHER_ADMIN_ID}', 'old-owner@example.com'),
        ('${NEW_ADMIN_ID}', 'new-owner@example.com');
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select '${ADMIN_ID}'::uuid $$;

      insert into profiles (id, role, staff_role, display_name, is_active)
      values
        ('${ADMIN_ID}', 'admin', null, 'Owner', true),
        ('${OTHER_ADMIN_ID}', 'admin', null, 'Old Owner', false);
      insert into customer_profiles (id, display_name)
      values ('${TARGET_ID}', 'Taylor Customer');
    `);
  }, 120_000);

  it("exposes only the audited functions to authenticated sessions", async () => {
    for (const signature of [
      "admin_list_workspace_access()",
      "admin_set_workspace_access(text, staff_role, boolean)",
    ]) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('authenticated', '${signature}', 'execute')`,
        ),
        signature,
      ).toBe(true);
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege('anon', '${signature}', 'execute')`,
        ),
        signature,
      ).toBe(false);
    }
    expect(
      await scalar<boolean>(
        db,
        `select has_table_privilege('authenticated', 'profiles', 'insert')`,
      ),
    ).toBe(false);
    expect(
      await scalar<boolean>(
        db,
        `select has_table_privilege('authenticated', 'profiles', 'update')`,
      ),
    ).toBe(false);
  });

  it("grants, changes, revokes, and restores access with an audit trail", async () => {
    expect(
      await scalar<string>(
        db,
        `select admin_set_workspace_access(' TEAM@example.com ', 'cashier', true)::text`,
      ),
    ).toBe(TARGET_ID);
    expect(
      await scalar<string>(db, `select display_name from profiles where id = '${TARGET_ID}'`),
    ).toBe("Taylor Customer");

    await db.exec(`select admin_set_workspace_access('team@example.com', 'manager', true)`);
    await db.exec(`select admin_set_workspace_access('team@example.com', 'manager', false)`);
    expect(
      await scalar<boolean>(db, `select is_active from profiles where id = '${TARGET_ID}'`),
    ).toBe(false);
    await db.exec(`select admin_set_workspace_access('team@example.com', 'cashier', true)`);

    expect(
      await scalar<string>(db, `select staff_role::text from profiles where id = '${TARGET_ID}'`),
    ).toBe("cashier");
    expect(
      await scalar<string>(
        db,
        `select string_agg(action, ',' order by id)
         from audit_logs where target_id = '${TARGET_ID}'`,
      ),
    ).toBe(
      "workspace.access_granted,workspace.role_changed,workspace.access_revoked,workspace.access_reactivated",
    );
    expect(
      await scalar<string>(
        db,
        `select email from admin_list_workspace_access() where profile_id = '${TARGET_ID}'`,
      ),
    ).toBe("team@example.com");
  });

  it("prevents self-demotion and changes to another admin", async () => {
    await expect(
      db.exec(`select admin_set_workspace_access('owner@example.com', 'manager', false)`),
    ).rejects.toThrow(/CANNOT_CHANGE_SELF/);
    await expect(
      db.exec(`select admin_set_workspace_access('old-owner@example.com', 'manager', true)`),
    ).rejects.toThrow(/CANNOT_CHANGE_ADMIN/);
  });

  it("rejects non-admin callers even when they have active Workspace access", async () => {
    await db.exec(`
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select '${TARGET_ID}'::uuid $$
    `);
    await expect(db.exec(`select * from admin_list_workspace_access()`)).rejects.toThrow(
      /FORBIDDEN/,
    );
    await expect(
      db.exec(`select admin_set_workspace_access('owner@example.com', 'cashier', true)`),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it("rotates the configured Super Admin and audit trail atomically", async () => {
    expect(
      await scalar<boolean>(
        db,
        `select has_function_privilege(
          'service_role', 'provision_configured_super_admin(uuid, text)', 'execute'
        )`,
      ),
    ).toBe(true);
    for (const role of ["anon", "authenticated"] as const) {
      expect(
        await scalar<boolean>(
          db,
          `select has_function_privilege(
            '${role}', 'provision_configured_super_admin(uuid, text)', 'execute'
          )`,
        ),
      ).toBe(false);
    }

    await db.exec(
      `select provision_configured_super_admin('${NEW_ADMIN_ID}', 'New Owner')`,
    );
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from profiles where role = 'admin' and is_active`,
      ),
    ).toBe(1);
    expect(
      await scalar<boolean>(
        db,
        `select is_active and role = 'admin' from profiles where id = '${NEW_ADMIN_ID}'`,
      ),
    ).toBe(true);
    expect(
      await scalar<string>(
        db,
        `select string_agg(action, ',' order by id)
         from audit_logs where actor_profile_id = '${NEW_ADMIN_ID}'`,
      ),
    ).toBe(
      "staff.super_admin_revoked_by_configuration,staff.super_admin_bootstrapped",
    );

    const before = await scalar<number>(
      db,
      `select count(*)::int from audit_logs where actor_profile_id = '${NEW_ADMIN_ID}'`,
    );
    await db.exec(
      `select provision_configured_super_admin('${NEW_ADMIN_ID}', 'New Owner')`,
    );
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from audit_logs where actor_profile_id = '${NEW_ADMIN_ID}'`,
      ),
    ).toBe(before);
  });
});
