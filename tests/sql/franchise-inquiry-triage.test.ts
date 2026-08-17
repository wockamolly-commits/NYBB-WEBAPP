import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "89000000-0000-4000-8000-000000000001";
const STAFF_ID = "89000000-0000-4000-8000-000000000002";
const CUSTOMER_ID = "89000000-0000-4000-8000-000000000003";
const BRANCH_SLUG = "pilot";

async function asRole<T>(
  db: PGlite,
  role: "anon" | "authenticated",
  userId: string | null,
  sql: string,
): Promise<readonly T[]> {
  const identity = userId ? `'${userId}'::uuid` : "null::uuid";
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select ${identity} $$;
    set role ${role};
  `);
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
      ('${ADMIN_ID}', 'admin@example.com'),
      ('${STAFF_ID}', 'staff@example.com'),
      ('${CUSTOMER_ID}', 'customer@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select '${BRANCH_SLUG}', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, display_name) values
      ('${ADMIN_ID}', 'admin', 'Owner');
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${STAFF_ID}', 'staff', 'manager', 'Manager', id
    from branches where slug = '${BRANCH_SLUG}';
  `);
  // One lead, left by a stranger through the public path.
  await asRole(
    db,
    "anon",
    null,
    `select submit_franchise_inquiry('Maria Santos', 'm@example.com', '09170000000')`,
  );
  return db;
}

async function leadId(db: PGlite): Promise<string> {
  return scalar<string>(db, "select id::text from franchise_inquiries limit 1");
}

describe("set_franchise_inquiry_handled", () => {
  let db: PGlite;
  let id: string;

  beforeEach(async () => {
    db = await setup();
    id = await leadId(db);
  });

  it("lets an admin close a lead and records who did it", async () => {
    const [row] = await asRole<{ ok: boolean }>(
      db,
      "authenticated",
      ADMIN_ID,
      `select set_franchise_inquiry_handled('${id}', true) as ok`,
    );
    expect(row.ok).toBe(true);

    const [stored] = (
      await db.query<{ handled_at: string | null; handled_by_profile_id: string | null }>(
        "select handled_at, handled_by_profile_id from franchise_inquiries",
      )
    ).rows;
    expect(stored.handled_at).not.toBeNull();
    expect(stored.handled_by_profile_id).toBe(ADMIN_ID);
  });

  it("reopens a lead and forgets who closed it", async () => {
    // Leaving the name behind would tell the next reader that somebody is
    // already dealing with a lead that is open again.
    await asRole(
      db,
      "authenticated",
      ADMIN_ID,
      `select set_franchise_inquiry_handled('${id}', true)`,
    );
    await asRole(
      db,
      "authenticated",
      ADMIN_ID,
      `select set_franchise_inquiry_handled('${id}', false)`,
    );

    const [stored] = (
      await db.query<{ handled_at: string | null; handled_by_profile_id: string | null }>(
        "select handled_at, handled_by_profile_id from franchise_inquiries",
      )
    ).rows;
    expect(stored).toEqual({ handled_at: null, handled_by_profile_id: null });
  });

  it("refuses a staff member, who cannot even read these leads", async () => {
    await expect(
      asRole(
        db,
        "authenticated",
        STAFF_ID,
        `select set_franchise_inquiry_handled('${id}', true)`,
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("refuses a signed-in customer", async () => {
    await expect(
      asRole(
        db,
        "authenticated",
        CUSTOMER_ID,
        `select set_franchise_inquiry_handled('${id}', true)`,
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("refuses a customer reopening a lead, the case a foreign key would not catch", async () => {
    // The exploitable half of the NULL-versus-false bug in 0046. A customer has
    // no profiles row, so is_admin() returns NULL rather than false. Closing a
    // lead happened to fail on the handled_by foreign key; reopening one sets
    // that column to null, so it satisfied the key and went through.
    await asRole(
      db,
      "authenticated",
      ADMIN_ID,
      `select set_franchise_inquiry_handled('${id}', true)`,
    );

    await expect(
      asRole(
        db,
        "authenticated",
        CUSTOMER_ID,
        `select set_franchise_inquiry_handled('${id}', false)`,
      ),
    ).rejects.toThrow(/not authorized/i);

    const stillHandled = await scalar<number>(
      db,
      "select count(*)::int from franchise_inquiries where handled_at is not null",
    );
    expect(stillHandled).toBe(1);
  });

  it("is not reachable by anon at all", async () => {
    await expect(
      asRole(db, "anon", null, `select set_franchise_inquiry_handled('${id}', true)`),
    ).rejects.toThrow();
  });

  it("leaves the lead open when a refused caller tried", async () => {
    await asRole(
      db,
      "authenticated",
      STAFF_ID,
      `select set_franchise_inquiry_handled('${id}', true)`,
    ).catch(() => undefined);

    const open = await scalar<number>(
      db,
      "select count(*)::int from franchise_inquiries where handled_at is null",
    );
    expect(open).toBe(1);
  });

  it("reports false for an id that matches nothing", async () => {
    const [row] = await asRole<{ ok: boolean }>(
      db,
      "authenticated",
      ADMIN_ID,
      `select set_franchise_inquiry_handled(
         '99999999-0000-4000-8000-000000000000', true
       ) as ok`,
    );
    expect(row.ok).toBe(false);
  });

  it("cannot be used to rewrite the lead's contact details", async () => {
    // The whole reason this is a function rather than a restored table grant.
    await expect(
      asRole(
        db,
        "authenticated",
        ADMIN_ID,
        `update franchise_inquiries set email = 'attacker@example.com'`,
      ),
    ).rejects.toThrow();
  });
});
