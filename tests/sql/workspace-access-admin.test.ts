import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "73000000-0000-4000-8000-000000000001";
const TARGET_ID = "73000000-0000-4000-8000-000000000002";
const OTHER_ADMIN_ID = "73000000-0000-4000-8000-000000000003";
const NEW_ADMIN_ID = "73000000-0000-4000-8000-000000000004";

describe("Workspace access administration", () => {
  let db: PGlite;
  let pilotBranchId: string;

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

      insert into price_lists (slug, name) values ('standard', 'Standard');
      insert into branches
        (slug, name, short_name, format, price_list_id, address_line, city)
      select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
      from price_lists where slug = 'standard';
    `);
    pilotBranchId = await scalar<string>(
      db,
      `select id::text from branches where slug = 'pilot'`,
    );
  }, 120_000);

  it("exposes only the audited functions to authenticated sessions", async () => {
    for (const signature of [
      "admin_list_workspace_access()",
      "admin_set_workspace_access(text, staff_role, uuid, boolean)",
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
    // One function, not two. create or replace matches on argument types, so
    // adding the branch parameter without dropping first would have left the
    // old branch-blind signature in place and callable.
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from pg_proc where proname = 'admin_set_workspace_access'`,
      ),
    ).toBe(1);
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
        `select admin_set_workspace_access(' TEAM@example.com ', 'cashier', null, true)::text`,
      ),
    ).toBe(TARGET_ID);
    expect(
      await scalar<string>(db, `select display_name from profiles where id = '${TARGET_ID}'`),
    ).toBe("Taylor Customer");

    await db.exec(`select admin_set_workspace_access('team@example.com', 'manager', null, true)`);
    await db.exec(`select admin_set_workspace_access('team@example.com', 'manager', null, false)`);
    expect(
      await scalar<boolean>(db, `select is_active from profiles where id = '${TARGET_ID}'`),
    ).toBe(false);
    await db.exec(`select admin_set_workspace_access('team@example.com', 'cashier', null, true)`);

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

  it("assigns a counter, moves it, and hands it back to the business", async () => {
    await db.exec(
      `select admin_set_workspace_access('team@example.com', 'cashier', '${pilotBranchId}', true)`,
    );
    expect(
      await scalar<string>(db, `select branch_id::text from profiles where id = '${TARGET_ID}'`),
    ).toBe(pilotBranchId);
    expect(
      await scalar<string>(
        db,
        `select action from audit_logs where target_id = '${TARGET_ID}' order by id desc limit 1`,
      ),
    ).toBe("workspace.branch_changed");
    expect(
      await scalar<string>(
        db,
        `select diff -> 'after' ->> 'branch_id'
         from audit_logs where target_id = '${TARGET_ID}' order by id desc limit 1`,
      ),
    ).toBe(pilotBranchId);

    // Back to business wide. Null is a destination here, not an omission, so
    // it has to be logged the same way the move out was.
    await db.exec(`select admin_set_workspace_access('team@example.com', 'cashier', null, true)`);
    expect(
      await scalar<string>(db, `select branch_id::text from profiles where id = '${TARGET_ID}'`),
    ).toBeNull();
    expect(
      await scalar<string>(
        db,
        `select action from audit_logs where target_id = '${TARGET_ID}' order by id desc limit 1`,
      ),
    ).toBe("workspace.branch_changed");

    // A role change on a member whose counter did not move still reads as a
    // role change, which pins the order of the arms in the action ladder.
    await db.exec(`select admin_set_workspace_access('team@example.com', 'manager', null, true)`);
    expect(
      await scalar<string>(
        db,
        `select action from audit_logs where target_id = '${TARGET_ID}' order by id desc limit 1`,
      ),
    ).toBe("workspace.role_changed");
    await db.exec(`select admin_set_workspace_access('team@example.com', 'cashier', null, true)`);
  });

  it("refuses a counter that does not exist", async () => {
    await expect(
      db.exec(`select admin_set_workspace_access(
        'team@example.com', 'cashier', '99999999-0000-4000-8000-000000000000', true
      )`),
    ).rejects.toThrow(/INVALID_BRANCH/);
  });

  it("keeps every access audit row out of the branch-scoped audit log", async () => {
    // The diff carries to_jsonb of the profile row, and profiles has a phone
    // column. 0056 admits a null-branch row to a business wide session only, so
    // a branch_id here would hand a branch manager the phone number of
    // everybody assigned to their counter. The trigger from 0023 backfills for
    // orders and nothing else, which is what keeps this null.
    expect(
      await scalar<number>(
        db,
        `select count(*)::int from audit_logs
         where action like 'workspace.%' and branch_id is not null`,
      ),
    ).toBe(0);
  });

  it("prevents self-demotion and changes to another admin", async () => {
    await expect(
      db.exec(`select admin_set_workspace_access('owner@example.com', 'manager', null, false)`),
    ).rejects.toThrow(/CANNOT_CHANGE_SELF/);
    await expect(
      db.exec(`select admin_set_workspace_access('old-owner@example.com', 'manager', null, true)`),
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
      db.exec(`select admin_set_workspace_access('owner@example.com', 'cashier', null, true)`),
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
