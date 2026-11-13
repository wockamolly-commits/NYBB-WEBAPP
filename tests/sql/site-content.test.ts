import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "77000000-0000-4000-8000-000000000001";
const MANAGER_ID = "77000000-0000-4000-8000-000000000002";
const EDITOR_ID = "77000000-0000-4000-8000-000000000003";

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
 * 0108. Page content is written only through RPCs that check content:manage.
 * The tables carry no grants, drafts are never public, and only publishing
 * changes what get_site_page answers.
 */
describe("site content", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await freshDatabase();
    await db.exec(`
      insert into auth.users (id, email) values
        ('${ADMIN_ID}', 'admin@example.com'),
        ('${MANAGER_ID}', 'manager@example.com'),
        ('${EDITOR_ID}', 'editor@example.com');
      insert into profiles (id, role, staff_role, display_name, branch_id) values
        ('${ADMIN_ID}', 'admin', null, 'Owner', null),
        ('${MANAGER_ID}', 'staff', 'manager', 'Manager', null),
        ('${EDITOR_ID}', 'staff', 'cashier', 'Editor', null);
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${EDITOR_ID}', 'content:manage', true);
    `);
  }, 120_000);

  it("answers null (the built-in text) to a visitor before anything is published", async () => {
    const [row] = await as<{ b: unknown }>(db, null, "select get_site_page('privacy') as b");
    expect(row.b).toBeNull();
  });

  it("refuses a manager who holds every default permission but not content:manage", async () => {
    for (const sql of [
      "select admin_get_site_page('about')",
      "select admin_list_site_pages()",
      `select admin_save_site_page_draft('about', '{"a":1}'::jsonb)`,
      `select admin_publish_site_page('about', '{"a":1}'::jsonb)`,
      "select admin_discard_site_page_draft('about')",
    ]) {
      expect(await refusal(db, MANAGER_ID, sql)).toContain("FORBIDDEN");
    }
  });

  it("refuses direct table access from every session, the permission notwithstanding", async () => {
    for (const id of [MANAGER_ID, EDITOR_ID, ADMIN_ID]) {
      expect(
        await refusal(db, id, `insert into site_page_versions (page, body) values ('home', '{}'::jsonb)`),
      ).toMatch(/permission denied/);
      expect(await refusal(db, id, "select * from site_page_drafts")).toMatch(/permission denied/);
    }
    expect(await refusal(db, null, "select * from site_page_versions")).toMatch(/permission denied/);
    expect(await refusal(db, null, "select admin_get_site_page('home')")).toMatch(/permission denied/);
    expect(await refusal(db, EDITOR_ID, "select site_page_state('home')")).toMatch(/permission denied/);
  });

  it("keeps a saved draft private: the public read does not change", async () => {
    await as(db, EDITOR_ID, `select admin_save_site_page_draft('about', '{"v":"draft"}'::jsonb)`);
    const [pub] = await as<{ b: unknown }>(db, null, "select get_site_page('about') as b");
    expect(pub.b).toBeNull();

    const [state] = await as<{ s: Record<string, unknown> }>(db, EDITOR_ID, "select admin_get_site_page('about') as s");
    expect(state.s.draft).toEqual({ v: "draft" });
    expect(state.s.draft_saved_by).toBe("Editor");
    expect(state.s.published).toBeNull();

    // A second save replaces the first rather than adding a row.
    await as(db, EDITOR_ID, `select admin_save_site_page_draft('about', '{"v":"draft 2"}'::jsonb)`);
    expect(await scalar<number>(db, "select count(*)::int from site_page_drafts where page = 'about'")).toBe(1);
  });

  it("publishes, clears the draft, and audits without copying the body", async () => {
    await as(db, EDITOR_ID, `select admin_publish_site_page('about', '{"v":"live"}'::jsonb)`);
    const [pub] = await as<{ b: unknown }>(db, null, "select get_site_page('about') as b");
    expect(pub.b).toEqual({ v: "live" });
    expect(await scalar<number>(db, "select count(*)::int from site_page_drafts where page = 'about'")).toBe(0);

    const [audit] = (
      await db.query<{ action: string; target_id: string; diff: Record<string, unknown> }>(
        "select action, target_id, diff from audit_logs where target_table = 'site_page_versions' order by id desc limit 1",
      )
    ).rows;
    expect(audit.action).toBe("content.publish");
    expect(audit.target_id).toBe("about");
    expect(audit.diff).toMatchObject({ page: "about", previous_version: null });
    expect(JSON.stringify(audit.diff)).not.toContain("live");
  });

  it("restores the built-in text by publishing null, keeping the history", async () => {
    await as(db, ADMIN_ID, "select admin_publish_site_page('about', null)");
    const [pub] = await as<{ b: unknown }>(db, null, "select get_site_page('about') as b");
    expect(pub.b).toBeNull();
    expect(await scalar<number>(db, "select count(*)::int from site_page_versions where page = 'about'")).toBe(2);
    expect(
      await scalar<string>(
        db,
        "select action from audit_logs where target_table = 'site_page_versions' order by id desc limit 1",
      ),
    ).toBe("content.restore");
  });

  it("discards a draft without touching what is live", async () => {
    await as(db, EDITOR_ID, `select admin_publish_site_page('terms', '{"v":"t1"}'::jsonb)`);
    await as(db, EDITOR_ID, `select admin_save_site_page_draft('terms', '{"v":"t2"}'::jsonb)`);
    await as(db, EDITOR_ID, "select admin_discard_site_page_draft('terms')");
    const [pub] = await as<{ b: unknown }>(db, null, "select get_site_page('terms') as b");
    expect(pub.b).toEqual({ v: "t1" });
    expect(await scalar<number>(db, "select count(*)::int from site_page_drafts")).toBe(0);
  });

  it("lists the four pages in order for the Workspace", async () => {
    const [row] = await as<{ l: { page: string }[] }>(db, EDITOR_ID, "select admin_list_site_pages() as l");
    expect(row.l.map((entry) => entry.page)).toEqual(["home", "about", "privacy", "terms"]);
  });

  it("refuses an unknown page, a non-object body and an oversized one by name", async () => {
    expect(await refusal(db, ADMIN_ID, `select admin_save_site_page_draft('menu', '{}'::jsonb)`)).toContain(
      "UNKNOWN_PAGE",
    );
    expect(await refusal(db, ADMIN_ID, `select admin_save_site_page_draft('home', '[1]'::jsonb)`)).toContain(
      "INVALID_INPUT",
    );
    expect(await refusal(db, ADMIN_ID, `select admin_publish_site_page('home', '"text"'::jsonb)`)).toContain(
      "INVALID_INPUT",
    );
    expect(
      await refusal(
        db,
        ADMIN_ID,
        `select admin_save_site_page_draft('home', jsonb_build_object('x', repeat('a', 300000)))`,
      ),
    ).toContain("TOO_LARGE");
  });

  it("treats content:manage as business wide", async () => {
    expect(await scalar<boolean>(db, "select business_wide_permission('content:manage')")).toBe(true);
    expect(await scalar<boolean>(db, "select known_permission('content:manage')")).toBe(true);
  });
});
