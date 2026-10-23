import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

/**
 * Migration 0100: the Super Admin handover is one transaction, and the old
 * Super Admin loses their database rights when it commits, not when the new
 * one signs in.
 */

const OLD_ADMIN = "78000000-0000-4000-8000-000000000001";
const NEW_ADMIN = "78000000-0000-4000-8000-000000000002";

async function asUser<T>(db: PGlite, profileId: string, sql: string): Promise<T> {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${profileId}'::uuid $$;
  `);
  await db.exec("set role authenticated");
  try {
    return (await db.query<{ value: T }>(sql)).rows[0]!.value;
  } finally {
    await db.exec("reset role");
  }
}

async function setup(): Promise<PGlite> {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${OLD_ADMIN}', 'old.owner@example.com'),
      ('${NEW_ADMIN}', 'New.Owner@Example.com');
    insert into profiles (id, role, staff_role, display_name, branch_id, is_active)
    values ('${OLD_ADMIN}', 'admin', null, 'Old Owner', null, true);
    -- Auth's own table, standing in for the hosted one, so the session purge
    -- has something to delete.
    create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null);
    insert into auth.sessions (user_id) values ('${OLD_ADMIN}'), ('${OLD_ADMIN}'), ('${NEW_ADMIN}');
  `);
  return db;
}

const handOver = (db: PGlite, email: string) =>
  scalar<{ revoked: number; sessionsEnded: boolean; newAdminHasAccount: boolean }>(
    db,
    `select hand_over_super_admin('${email}')`,
  );

describe("hand_over_super_admin", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  }, 120_000);

  it("takes the old Super Admin's database rights away at once", async () => {
    expect(await asUser<boolean>(db, OLD_ADMIN, "select current_staff_has_permission('team:manage') as value")).toBe(true);

    const result = await handOver(db, "new.owner@example.com");
    expect(result).toEqual({ revoked: 1, sessionsEnded: true, newAdminHasAccount: true });

    // The same session, still holding a token: no rights left anywhere.
    expect(await asUser<boolean>(db, OLD_ADMIN, "select current_staff_has_permission('team:manage') as value")).toBe(false);
    expect(await asUser<string | null>(db, OLD_ADMIN, "select current_role_kind()::text as value")).toBeNull();
    expect(await scalar(db, `select count(*)::int from auth.sessions where user_id = '${OLD_ADMIN}'`)).toBe(0);
    expect(await scalar(db, `select count(*)::int from auth.sessions where user_id = '${NEW_ADMIN}'`)).toBe(1);
    expect(
      await scalar(db, `select count(*)::int from audit_logs where action = 'staff.super_admin_handed_over' and target_id = '${OLD_ADMIN}'`),
    ).toBe(1);
  });

  it("does not wait for the new Super Admin to have an account", async () => {
    const result = await handOver(db, "nobody.yet@example.com");
    expect(result).toMatchObject({ revoked: 1, newAdminHasAccount: false });
    expect(await scalar(db, `select is_active from profiles where id = '${OLD_ADMIN}'`)).toBe(false);
  });

  it("stops the old address provisioning itself back in after the handover", async () => {
    await handOver(db, "new.owner@example.com");
    await expect(
      db.query(`select provision_configured_super_admin('${OLD_ADMIN}', 'Old Owner')`),
    ).rejects.toThrow(/NOT_THE_SUPER_ADMIN/);
    expect(await scalar(db, `select is_active from profiles where id = '${OLD_ADMIN}'`)).toBe(false);

    // The named address signs in normally, whatever case its account uses.
    await db.query(`select provision_configured_super_admin('${NEW_ADMIN}', 'New Owner')`);
    expect(await scalar(db, `select role::text || ':' || is_active from profiles where id = '${NEW_ADMIN}'`)).toBe("admin:true");
  });

  it("refuses something that is not an address", async () => {
    await expect(db.query("select hand_over_super_admin('not an email')")).rejects.toThrow(/INVALID_EMAIL/);
    expect(await scalar(db, `select is_active from profiles where id = '${OLD_ADMIN}'`)).toBe(true);
  });

  it("is callable by the service role only", async () => {
    for (const role of ["anon", "authenticated"]) {
      expect(
        await scalar(db, `select has_function_privilege('${role}', 'hand_over_super_admin(text)', 'execute')`),
      ).toBe(false);
      expect(await scalar(db, `select has_table_privilege('${role}', 'super_admin_authority', 'select')`)).toBe(false);
    }
    expect(
      await scalar(db, "select has_function_privilege('service_role', 'hand_over_super_admin(text)', 'execute')"),
    ).toBe(true);
  });
});

describe("the authority seeded by 0100", () => {
  it("leaves provisioning as it was while no handover has named anybody", async () => {
    const db = await setup();
    expect(await scalar(db, "select count(*)::int from super_admin_authority")).toBe(0);
    await db.query(`select provision_configured_super_admin('${NEW_ADMIN}', 'New Owner')`);
    expect(await scalar(db, `select is_active from profiles where id = '${OLD_ADMIN}'`)).toBe(false);
  }, 120_000);
});
