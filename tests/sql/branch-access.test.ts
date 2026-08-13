import { beforeEach, describe, expect, it } from "vitest";
import { freshDatabase, scalar } from "./harness";

const ASSIGNED = "74000000-0000-4000-8000-000000000001";
const UNASSIGNED = "74000000-0000-4000-8000-000000000002";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ASSIGNED}', 'assigned@example.com'),
      ('${UNASSIGNED}', 'unassigned@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${ASSIGNED}', 'staff', 'manager', 'Assigned', b.id
    from branches b where b.slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name)
    values ('${UNASSIGNED}', 'staff', 'manager', 'Unassigned');
  `);
  return db;
}

async function branchId(db: Awaited<ReturnType<typeof setup>>, slug: string) {
  return scalar<string>(db, `select id::text from branches where slug = '${slug}'`);
}

describe("staff_can_access_branch", () => {
  let db: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    db = await setup();
  });

  it("lets a branch-assigned profile reach its own branch", async () => {
    const pilot = await branchId(db, "pilot");
    expect(
      await scalar<boolean>(db, `select staff_can_access_branch('${ASSIGNED}', '${pilot}')`),
    ).toBe(true);
  });

  it("refuses a branch-assigned profile another branch", async () => {
    const other = await branchId(db, "other");
    expect(
      await scalar<boolean>(db, `select staff_can_access_branch('${ASSIGNED}', '${other}')`),
    ).toBe(false);
  });

  it("lets an unassigned profile reach every branch, which is business wide", async () => {
    const other = await branchId(db, "other");
    expect(
      await scalar<boolean>(db, `select staff_can_access_branch('${UNASSIGNED}', '${other}')`),
    ).toBe(true);
  });

  it("refuses a deactivated profile", async () => {
    const pilot = await branchId(db, "pilot");
    await db.exec(`update profiles set is_active = false where id = '${ASSIGNED}'`);
    expect(
      await scalar<boolean>(db, `select staff_can_access_branch('${ASSIGNED}', '${pilot}')`),
    ).toBe(false);
  });

  // The whole reason this function exists: the session-scoped one and the
  // profile-scoped one must never be able to disagree.
  it("agrees with current_staff_can_access_branch for the same person", async () => {
    const pilot = await branchId(db, "pilot");
    const other = await branchId(db, "other");
    await db.exec(`
      create or replace function auth.uid()
      returns uuid language sql stable as $$ select '${ASSIGNED}'::uuid $$;
    `);
    for (const branch of [pilot, other]) {
      const session = await scalar<boolean>(
        db, `select current_staff_can_access_branch('${branch}')`,
      );
      const direct = await scalar<boolean>(
        db, `select staff_can_access_branch('${ASSIGNED}', '${branch}')`,
      );
      expect(session).toBe(direct);
    }
  });

  it("is not callable by anon", async () => {
    const granted = await scalar<boolean>(db, `
      select has_function_privilege('anon', 'staff_can_access_branch(uuid, uuid)', 'execute')
    `);
    expect(granted).toBe(false);
  });
});
