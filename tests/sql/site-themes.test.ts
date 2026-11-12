import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "76000000-0000-4000-8000-000000000001";
const MANAGER_ID = "76000000-0000-4000-8000-000000000002";
const THEMER_ID = "76000000-0000-4000-8000-000000000003";

async function as<T>(db: PGlite, id: string | null, sql: string): Promise<readonly T[]> {
  await db.exec(
    id
      ? `create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$;
         set role authenticated;`
      : `create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
         set role anon;`,
  );
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function refusal(db: PGlite, id: string | null, sql: string): Promise<string> {
  try {
    await as(db, id, sql);
  } catch (error) {
    return (error as Error).message;
  }
  return "no error";
}

/**
 * 0107. The theme is written through one RPC that checks themes:manage; the
 * table itself has no grants, so no other permission reaches it.
 */
describe("site themes", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email) values
        ('${ADMIN_ID}', 'admin@example.com'),
        ('${MANAGER_ID}', 'manager@example.com'),
        ('${THEMER_ID}', 'themer@example.com');
      insert into profiles (id, role, staff_role, display_name, branch_id) values
        ('${ADMIN_ID}', 'admin', null, 'Owner', null),
        ('${MANAGER_ID}', 'staff', 'manager', 'Manager', null),
        ('${THEMER_ID}', 'staff', 'cashier', 'Themer', null);
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${THEMER_ID}', 'themes:manage', true);
    `);
  }, 120_000);

  it("answers the everyday look to a visitor before anything is applied", async () => {
    const [row] = await as<{ t: unknown }>(db, null, "select get_site_theme() as t");
    expect(row.t).toEqual({ id: "default", banner: { show: false, text: "" }, effects: true });
  });

  it("refuses a manager who has every default permission but not themes:manage", async () => {
    expect(
      await refusal(db, MANAGER_ID, "select admin_apply_site_theme('christmas', true, '', true)"),
    ).toContain("FORBIDDEN");
    expect(await refusal(db, MANAGER_ID, "select admin_get_site_theme()")).toContain("FORBIDDEN");
  });

  it("refuses a direct insert from any staff session, the permission notwithstanding", async () => {
    for (const id of [MANAGER_ID, THEMER_ID, ADMIN_ID]) {
      expect(
        await refusal(db, id, "insert into site_themes (theme_id) values ('christmas')"),
      ).toMatch(/permission denied/);
    }
    expect(await refusal(db, null, "select * from site_themes")).toMatch(/permission denied/);
    expect(await refusal(db, null, "select admin_apply_site_theme('christmas', true, '', true)")).toMatch(
      /permission denied/,
    );
  });

  it("lets a person granted themes:manage apply a theme, and audits it", async () => {
    await as(db, THEMER_ID, "select admin_apply_site_theme('halloween', true, '  Boo  ', false)");
    const [row] = await as<{ t: unknown }>(db, null, "select get_site_theme() as t");
    expect(row.t).toEqual({ id: "halloween", banner: { show: true, text: "Boo" }, effects: false });

    const [admin] = await as<{ t: Record<string, unknown> }>(db, THEMER_ID, "select admin_get_site_theme() as t");
    expect(admin.t.applied_by).toBe("Themer");

    const action = await scalar<string>(
      db,
      "select action || ':' || target_id from audit_logs where target_table = 'site_themes' order by id desc limit 1",
    );
    expect(action).toBe("theme.apply:halloween");
  });

  it("refuses an unknown theme and an over long banner by name", async () => {
    expect(await refusal(db, ADMIN_ID, "select admin_apply_site_theme('easter', false, '', true)")).toContain(
      "UNKNOWN_THEME",
    );
    expect(
      await refusal(db, ADMIN_ID, `select admin_apply_site_theme('christmas', true, '${"x".repeat(141)}', true)`),
    ).toContain("BANNER_TOO_LONG");
  });

  it("restores the default with the banner off, whatever was sent", async () => {
    await as(db, ADMIN_ID, "select admin_apply_site_theme('default', true, 'left over', true)");
    const [row] = await as<{ t: unknown }>(db, null, "select get_site_theme() as t");
    expect(row.t).toEqual({ id: "default", banner: { show: false, text: "" }, effects: true });
    expect(
      await scalar<string>(
        db,
        "select action from audit_logs where target_table = 'site_themes' order by id desc limit 1",
      ),
    ).toBe("theme.restore");
  });
});
