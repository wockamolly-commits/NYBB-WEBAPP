import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "81000000-0000-4000-8000-000000000001";
const MANAGER = "81000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "81000000-0000-4000-8000-000000000003";

async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$; set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${CASHIER}', 'cashier@example.com'),
      ('${MANAGER}', 'manager@example.com'),
      ('${ROVING_MANAGER}', 'roving@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active, is_accepting_orders, sort_order)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true, true, 4 from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');
  `);
  return db;
}

function create(
  shortName: string,
  {
    name = "NYBB Hot Wings, Ayala Center",
    format = "mall",
    phones = "array['0917 000 0000', ' ', '032 000 0000']",
    priceList = "null",
  }: { name?: string; format?: string; phones?: string; priceList?: string } = {},
) {
  return `select staff_create_branch('${name}', '${shortName}', '${format}', ' Level 2, Ayala Center ', '', 'Cebu City', ${phones}, ${priceList})::text as id`;
}

describe("staff_create_branch", () => {
  let db: PGlite;

  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants the authenticated workspace, never anon", async () => {
    const signature = "staff_create_branch(text, text, text, text, text, text, text[], uuid)";
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_list_price_lists()', 'execute')`)).toBe(false);
  });

  it("creates a shut branch on the only price list and audits it", async () => {
    const [row] = await asUser<{ id: string }>(db, ROVING_MANAGER, create("Ayala Center"));
    const branch = await db.query<{
      slug: string;
      address_line: string;
      barangay: string | null;
      phones: string[];
      is_active: boolean;
      is_accepting_orders: boolean;
      sort_order: number;
      price_list: string;
    }>(`
      select b.slug, b.address_line, b.barangay, b.phones, b.is_active,
             b.is_accepting_orders, b.sort_order, p.slug as price_list
      from branches b join price_lists p on p.id = b.price_list_id
      where b.id = '${row!.id}'
    `);
    expect(branch.rows[0]).toEqual({
      slug: "ayala-center",
      address_line: "Level 2, Ayala Center",
      barangay: null,
      phones: ["0917 000 0000", "032 000 0000"],
      is_active: false,
      is_accepting_orders: false,
      sort_order: 5,
      price_list: "standard",
    });
    expect(await scalar<number>(db, `select count(*)::int from store_hours where branch_id = '${row!.id}'`)).toBe(0);
    expect(await scalar<boolean>(db, `select branch_is_open_at('${row!.id}')`)).toBe(false);
    expect(await scalar<string>(db, "select action from audit_logs order by id desc limit 1")).toBe("store.branch_created");
    expect(await scalar<string>(db, "select target_id from audit_logs order by id desc limit 1")).toBe(row!.id);
  });

  it("shows the new branch in the settings list so it can be configured", async () => {
    await asUser(db, ROVING_MANAGER, create("Ayala Center"));
    const rows = await asUser<{ slug: string; is_active: boolean }>(
      db,
      ROVING_MANAGER,
      "select slug, is_active from staff_list_store_availability() order by slug",
    );
    expect(rows).toEqual([
      { slug: "ayala-center", is_active: false },
      { slug: "pilot", is_active: true },
    ]);
  });

  it("refuses a cashier and a manager tied to one branch", async () => {
    await expect(asUser(db, CASHIER, create("Ayala Center"))).rejects.toThrow(/FORBIDDEN/);
    await expect(asUser(db, MANAGER, create("Ayala Center"))).rejects.toThrow(/BUSINESS_WIDE_FORBIDDEN/);
    expect(await scalar<number>(db, "select count(*)::int from branches")).toBe(1);
  });

  it("refuses a short name another branch already uses, in any case", async () => {
    await expect(asUser(db, ROVING_MANAGER, create("PILOT"))).rejects.toThrow(/DUPLICATE_SHORT_NAME/);
  });

  it("keeps slugs unique when two short names reduce to the same one", async () => {
    await asUser(db, ROVING_MANAGER, create("SM City"));
    await asUser(db, ROVING_MANAGER, create("SM-City!"));
    const slugs = await db.query<{ slug: string }>("select slug from branches where slug like 'sm-city%' order by slug");
    expect(slugs.rows.map((r) => r.slug)).toEqual(["sm-city", "sm-city-2"]);
  });

  it("rejects an unknown format and blank required fields", async () => {
    await expect(asUser(db, ROVING_MANAGER, create("Kiosk", { format: "kiosk" }))).rejects.toThrow(/INVALID_FORMAT/);
    await expect(asUser(db, ROVING_MANAGER, create("   "))).rejects.toThrow(/INVALID_INPUT/);
  });

  it("asks which price list once there is more than one", async () => {
    await db.exec("insert into price_lists (slug, name) values ('forecourt', 'Forecourt')");
    await expect(asUser(db, ROVING_MANAGER, create("Shell Banilad"))).rejects.toThrow(/PRICE_LIST_REQUIRED/);
    const forecourt = await scalar<string>(db, "select id::text from price_lists where slug = 'forecourt'");
    const [row] = await asUser<{ id: string }>(db, ROVING_MANAGER, create("Shell Banilad", { priceList: `'${forecourt}'` }));
    expect(await scalar<string>(db, `select price_list_id::text from branches where id = '${row!.id}'`)).toBe(forecourt);
    const lists = await asUser<{ slug: string }>(db, ROVING_MANAGER, "select slug from staff_list_price_lists()");
    expect(lists.map((l) => l.slug)).toEqual(["standard", "forecourt"]);
  });
});
