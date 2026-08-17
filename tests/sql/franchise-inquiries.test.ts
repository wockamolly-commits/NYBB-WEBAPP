import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const ADMIN_ID = "88000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "88000000-0000-4000-8000-000000000002";

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
      ('${CUSTOMER_ID}', 'customer@example.com');
    insert into profiles (id, role, display_name) values
      ('${ADMIN_ID}', 'admin', 'Owner');
  `);
  // CUSTOMER_ID deliberately gets no profiles row. user_role is ('admin',
  // 'staff') only, so a customer is an authenticated user the staff tables have
  // never heard of, and current_role_kind() returns null for them.
  return db;
}

describe("submit_franchise_inquiry", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
  });

  it("lets a stranger leave a lead", async () => {
    const [row] = await asRole<{ ok: boolean }>(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry(
         'Maria Santos', 'maria@example.com', '09170000000',
         'Bohol, still deciding', 'Interested in a mall unit.'
       ) as ok`,
    );
    expect(row.ok).toBe(true);

    const stored = await scalar<number>(db, "select count(*)::int from franchise_inquiries");
    expect(stored).toBe(1);
  });

  it("stores the email folded and trimmed, so two spellings are one lead", async () => {
    await asRole(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry('Maria Santos', '  Maria@Example.COM ', '09170000000')`,
    );

    const email = await scalar<string>(db, "select email from franchise_inquiries");
    expect(email).toBe("maria@example.com");
  });

  it("turns blank optional fields into null rather than empty strings", async () => {
    await asRole(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry('Maria Santos', 'm@example.com', '09170000000', '   ', '  ')`,
    );

    const [row] = (
      await db.query<{ city: string | null; message: string | null }>(
        "select city, message from franchise_inquiries",
      )
    ).rows;
    expect(row).toEqual({ city: null, message: null });
  });

  it("leaves a lead unhandled, so the open-leads index finds it", async () => {
    await asRole(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry('Maria Santos', 'm@example.com', '09170000000')`,
    );

    const open = await scalar<number>(
      db,
      "select count(*)::int from franchise_inquiries where handled_at is null",
    );
    expect(open).toBe(1);
  });

  it("never records the inquirer's address or browser", async () => {
    // 0008 provided the columns and 0045 declines to fill them. The rate
    // limiter hashes addresses for the same reason; see the note in 0045.
    await asRole(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry('Maria Santos', 'm@example.com', '09170000000')`,
    );

    const [row] = (
      await db.query<{ source_ip: string | null; user_agent: string | null }>(
        "select source_ip::text, user_agent from franchise_inquiries",
      )
    ).rows;
    expect(row).toEqual({ source_ip: null, user_agent: null });
  });

  it("refuses a lead with no name, email or phone", async () => {
    for (const args of [
      `'  ', 'm@example.com', '09170000000'`,
      `'Maria', '   ', '09170000000'`,
      `'Maria', 'm@example.com', '  '`,
    ]) {
      const [row] = await asRole<{ ok: boolean }>(
        db,
        "anon",
        null,
        `select submit_franchise_inquiry(${args}) as ok`,
      );
      expect(row.ok).toBe(false);
    }

    const stored = await scalar<number>(db, "select count(*)::int from franchise_inquiries");
    expect(stored).toBe(0);
  });

  it("refuses an over-long field rather than storing megabytes", async () => {
    const [row] = await asRole<{ ok: boolean }>(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry(
         'Maria Santos', 'm@example.com', '09170000000', null, repeat('a', 4001)
       ) as ok`,
    );
    expect(row.ok).toBe(false);

    const stored = await scalar<number>(db, "select count(*)::int from franchise_inquiries");
    expect(stored).toBe(0);
  });
});

describe("franchise_inquiries visibility", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = await setup();
    await asRole(
      db,
      "anon",
      null,
      `select submit_franchise_inquiry('Maria Santos', 'm@example.com', '09170000000')`,
    );
  });

  it("hides leads from anon", async () => {
    await expect(
      asRole(db, "anon", null, "select * from franchise_inquiries"),
    ).rejects.toThrow();
  });

  it("hides leads from a signed-in customer", async () => {
    const rows = await asRole(db, "authenticated", CUSTOMER_ID, "select * from franchise_inquiries");
    expect(rows).toHaveLength(0);
  });

  it("shows leads to an admin", async () => {
    const rows = await asRole(db, "authenticated", ADMIN_ID, "select * from franchise_inquiries");
    expect(rows).toHaveLength(1);
  });

  it("gives the public no way to write the table except through the function", async () => {
    await expect(
      asRole(
        db,
        "anon",
        null,
        `insert into franchise_inquiries (name, email, phone)
         values ('Direct', 'd@example.com', '09170000000')`,
      ),
    ).rejects.toThrow();
  });
});
