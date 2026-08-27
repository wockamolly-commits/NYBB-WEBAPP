# Workspace Menu Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Workspace a menu management surface so the owner can edit categories, items, sizes, prices, option groups, heat pricing and photography, and a cashier can mark an item sold out at their own counter, without a developer and without a migration.

**Architecture:** Reads are ordinary PostgREST selects, because `0022` left the `select` grant intact and the RLS policy on every menu table already resolves `menu:view`. Writes are `SECURITY DEFINER` RPCs that repeat the permission check and write their own audit row, because `0022` revoked `insert`, `update` and `delete` from `authenticated` and its header says not to re-grant them. Availability holds are rows in a new per branch table, and expiry is a timestamp comparison inside one function rather than a sweep.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Supabase (PostgREST + `SECURITY DEFINER` RPC), Postgres, Tailwind v4, Zod v4, sharp, Vitest with PGlite for SQL tests.

**Spec:** `docs/superpowers/specs/2026-08-25-workspace-menu-management-design.md`

## Global Constraints

- **No em dashes** anywhere: not in code comments, commit messages, documentation, or shipped UI copy. Use commas, periods, or parentheses.
- **Do not apply these migrations.** Migrations are live through `0050` and frozen. This plan writes `0051` through `0054`. They are exercised by the PGlite test harness only. Nothing here runs `supabase db push`, `supabase migration up`, or any MCP `apply_migration` call.
- **Never re-grant table writes on menu tables.** `0022` revoked `insert`, `update` and `delete` on every menu table from `authenticated` on purpose. If a form cannot write, the answer is an RPC, never a `grant`.
- **No service role client in this feature.** The reference uses one. Here reads go through `createStaffClient()` and writes go through RPCs. `SUPABASE_SERVICE_ROLE_KEY` must not appear in any file this plan touches.
- **The server prices everything.** Never send a price from the client that is charged. The forms edit the numbers the server prices from; the client never computes a total.
- **Next.js 16, not from memory.** Before touching routing, caching, Server Actions or image handling, read the relevant guide in `node_modules/next/dist/docs/`. Middleware is `proxy.ts` here.
- **`"use server"` files may only export async functions.** Exporting a constant or a type from an actions file passes typecheck and unit tests, then fails `npm run build`. Shared types live in `lib/staff/menu-types.ts`.
- **`npm run build` is part of the test loop**, not just `tsc`. React Server Component boundary errors appear only there.
- **Workspace ground is ink.** Use the existing `Button` recipe with `tone="dark"` from `components/ui/Button.tsx`, and `WorkspaceFieldLabel` / `WorkspaceInput` / `WorkspaceSelect` for form controls. Do not write raw colour classes for controls.
- **Text contrast floor is `bone/55`.** `/45` and below fail AA on this ground. Never go below `text-nybb-bone/55` for text a user has to read.
- **Touch targets are 44px minimum.** `min-h-11` in this codebase. The counter runs on a tablet.
- **Never nest a `<button>` inside an `<a>`.** Invalid HTML, unpredictable behaviour.
- **A Server Action that mutates cookies then navigates loses the race.** Not expected here, but if any action ends in `router.push`, wait for the transition to settle first. See `components/order/ReorderButton.tsx` for the fixed pattern.
- Full verification command set, run before every commit that ends a task:
  `npm run typecheck && npm run lint && npx vitest run && npm run build`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/0051_menu_item_branch_holds.sql` | The holds table, `menu_item_is_available()`, `staff_set_menu_item_hold()`, RLS, grants. |
| `supabase/migrations/0052_menu_availability_readers.sql` | `get_storefront_menu()` and `place_order()` recreated with the hold gate. The only file in this plan that touches customer checkout. |
| `supabase/migrations/0053_staff_menu_catalog_writes.sql` | `staff_save_menu_category`, `staff_save_menu_option_group`, `staff_save_menu_option`, `staff_reorder_menu`, `staff_delete_menu_entity`. |
| `supabase/migrations/0054_staff_menu_item_writes.sql` | `staff_save_menu_item`, `staff_set_menu_item_image`, `staff_set_option_variation_prices`. |
| `lib/staff/menu-types.ts` | Every type this feature's server and client code share. No imports from `server-only`. |
| `lib/staff/menu.ts` | Server. Eight selects, assembled into `ManagedMenu`. Enforcement is the database's; this file only reads. |
| `lib/staff/menu-image.ts` | Server. Crop, resize, encode and blur placeholder for an uploaded photo. Wraps sharp. |
| `app/(workspace)/workspace/menu/page.tsx` | The list, gated on `menu:view`. |
| `app/(workspace)/workspace/menu/actions.ts` | Every Server Action for this feature. Async exports only. |
| `app/(workspace)/workspace/menu/MenuList.tsx` | Client. The grouped list and its empty states. |
| `app/(workspace)/workspace/menu/ItemHoldControl.tsx` | Client. The sold-out form on one row. |
| `app/(workspace)/workspace/menu/categories/page.tsx` | Categories, gated on `menu:configure`. |
| `app/(workspace)/workspace/menu/categories/CategoryEditor.tsx` | Client. |
| `app/(workspace)/workspace/menu/options/page.tsx` | Option groups, gated on `menu:configure`. |
| `app/(workspace)/workspace/menu/options/OptionGroupEditor.tsx` | Client. Option rows, and from Task 11 each one's photo. |
| `app/(workspace)/workspace/menu/items/ItemEditor.tsx` | Client. The item form, shared by the new and edit routes. |
| `app/(workspace)/workspace/menu/items/HeatPriceGrid.tsx` | Client. Option by size prices. |
| `app/(workspace)/workspace/menu/items/ImageField.tsx` | Client. Upload plus zoom and vertical offset. |
| `app/(workspace)/workspace/menu/items/new/page.tsx` | Gated on `menu:configure`. |
| `app/(workspace)/workspace/menu/items/[id]/page.tsx` | Gated on `menu:configure`. |
| `app/(workspace)/workspace/layout.tsx` | Modified. One nav entry. |
| `app/(marketing)/menu/[category]/page.tsx` | Modified. `dynamicParams = true`. |
| `app/(marketing)/menu/[category]/[item]/page.tsx` | Modified. `dynamicParams = true`. |
| `next.config.ts` or `scripts/ingest-legacy-images.ts` | Modified. One of the two, to settle the bucket name. Task 11 decides which. |

**Test files**

| File | Covers |
| --- | --- |
| `tests/sql/menu-item-holds.test.ts` | Task 1. |
| `tests/sql/menu-availability-readers.test.ts` | Task 2. |
| `tests/sql/menu-catalog-writes.test.ts` | Task 5. |
| `tests/sql/menu-item-writes.test.ts` | Task 8. |
| `tests/unit/staff-menu-read.test.ts` | Task 3. |
| `tests/unit/menu-image.test.ts` | Task 11. |

---

## Context every task needs

**How the SQL tests work.** `tests/sql/harness.ts` runs every checked-in migration against PGlite, which is Postgres compiled to WebAssembly, in process. It is not Supabase: `auth.uid()` and the `anon` / `authenticated` / `service_role` roles are shims. A green run means the schema is coherent, not that RLS is proven. Read the harness header comment before writing a test that asserts a grant.

**How a test becomes a signed-in staff member.** Redefine `auth.uid()` and switch role. Copy this helper into each new test file, exactly as `tests/sql/store-availability.test.ts` has it:

```ts
async function asUser<T>(db: PGlite, id: string, sql: string): Promise<readonly T[]> {
  await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$ select '${id}'::uuid $$; set role authenticated;`);
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
}
```

**The two permission helpers already exist**, from `0022`:

- `current_staff_has_permission(p_permission text) returns boolean` resolves the caller's role defaults and their per person overrides. An `admin` gets everything.
- `current_staff_can_access_branch(p_branch_id uuid) returns boolean` is true when the caller's `profiles.branch_id` is null (a roving manager or admin) or matches. **It does not check any permission.** A function that needs both must call both.

**The audit row shape**, from `0023`:

```sql
insert into audit_logs (actor_profile_id, action, target_table, target_id, diff, branch_id)
values (v_actor_id, 'menu.item.updated', 'menu_items', v_item_id::text, jsonb_build_object('before', ..., 'after', ...), null);
```

`target_id` is `text`. `branch_id` is null for a business wide change and set for a branch scoped one.

**A no-op writes no audit row.** `staff_set_branch_accepting_orders` establishes this: an entry saying a value was set to the value it already held describes nothing that happened, and a trail full of them is harder to read than one without.

**Grants go in the same migration that creates the function**, per `0010`, and follow the `0025` idiom exactly:

```sql
revoke execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz) to authenticated;
```

The `revoke` names `anon` and `authenticated` explicitly and not just `public`. Supabase ships a default privilege granting `execute` to all three, so a revoke `from public` alone removes a privilege nobody held. The harness reproduces that default, which is why the test can catch it.

**Error codes.** Raise `FORBIDDEN`, `BRANCH_FORBIDDEN`, `INVALID_INPUT` and the specific ones named per task, always `using errcode = 'P0001'`. The Server Action maps them to sentences the way `app/(workspace)/workspace/availability/actions.ts` does with its `friendly()` function.

---

## Task 1: The holds table and the one definition of available

**Files:**
- Create: `supabase/migrations/0051_menu_item_branch_holds.sql`
- Test: `tests/sql/menu-item-holds.test.ts` (create)

**Interfaces:**
- Consumes: `current_staff_has_permission(text)`, `current_staff_can_access_branch(uuid)`, `set_updated_at()` trigger function (from `0001`), `audit_logs` (from `0007`, branch column from `0023`).
- Produces:
  - table `menu_item_branch_holds (item_id, branch_id, kind, unavailable_until, created_by, created_at, updated_at)`
  - `menu_item_is_available(p_item_id uuid, p_branch_id uuid, p_at timestamptz default now()) returns boolean`
  - `staff_set_menu_item_hold(p_item_id uuid, p_branch_id uuid, p_kind text, p_unavailable_until timestamptz default null) returns void`

  Task 2 calls `menu_item_is_available`. Task 4 calls `staff_set_menu_item_hold`. Task 3 selects from the table.

**Design notes the implementer must not reinvent.**

`p_kind` is `'today'`, `'until'` or `'indefinite'` to set a hold, and **null to lift one**. Lifting deletes the row. There is no `is_held` boolean anywhere: a boolean beside a timestamp is two states that can disagree.

`menu_item_is_available` returns true when `p_branch_id` is null. That is deliberate and load bearing: `get_storefront_menu` is called with no branch slug before a customer has chosen a store, and a menu that hides everything in that state would be worse than one that hides nothing. Say so in a comment on the function.

Expiry is `unavailable_until > p_at` inside the function. There is no sweep, no cron and no `refresh_expired_...` call. The reference calls one at the top of every page load; do not port it.

- [ ] **Step 1: Write the failing test**

Create `tests/sql/menu-item-holds.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "78000000-0000-4000-8000-000000000001";
const OTHER_CASHIER = "78000000-0000-4000-8000-000000000002";
const ROVING_MANAGER = "78000000-0000-4000-8000-000000000003";

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
      ('${OTHER_CASHIER}', 'other@example.com'),
      ('${ROVING_MANAGER}', 'roving@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${OTHER_CASHIER}', 'staff', 'cashier', 'Other cashier', id from branches where slug = 'other';
    insert into profiles (id, role, staff_role, display_name)
    values ('${ROVING_MANAGER}', 'staff', 'manager', 'Roving manager');

    insert into menu_categories (slug, name) values ('wings', 'Wings');
    insert into menu_items (category_id, slug, name)
    select id, 'chicken-wings', 'Chicken Wings' from menu_categories where slug = 'wings';
  `);
  return db;
}

const itemId = (db: PGlite) => scalar<string>(db, "select id::text from menu_items where slug = 'chicken-wings'");
const branchId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);

describe("menu item branch holds", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("grants execute to authenticated and never to anon", async () => {
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz)', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', 'staff_set_menu_item_hold(uuid, uuid, text, timestamptz)', 'execute')`)).toBe(false);
  });

  it("never grants the table's writes to authenticated", async () => {
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'select')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'insert')`)).toBe(false);
    expect(await scalar<boolean>(db, `select has_table_privilege('authenticated', 'menu_item_branch_holds', 'delete')`)).toBe(false);
  });

  it("reports an item with no hold as available", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(true);
  });

  it("reports an item as available when no branch is given", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', null)`)).toBe(true);
  });

  it("lets a cashier hold an item at their own branch only", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    const other = await branchId(db, "other");

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(true);

    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite')`),
    ).rejects.toThrow(/BRANCH_FORBIDDEN/);
  });

  it("expires a timed hold with no sweep in between", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() + interval '2 hours')`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now())`)).toBe(false);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}', now() + interval '3 hours')`)).toBe(true);
  });

  it("refuses a timed hold with no end and a past end", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', null)`),
    ).rejects.toThrow(/HOLD_NEEDS_AN_END/);
    await expect(
      asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'until', now() - interval '1 hour')`),
    ).rejects.toThrow(/HOLD_END_IN_PAST/);
  });

  it("lifts a hold when kind is null, and leaves no row behind", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);

    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${pilot}')`)).toBe(true);
    expect(await scalar<number>(db, "select count(*)::int from menu_item_branch_holds")).toBe(0);
  });

  it("lets a roving manager hold at any branch", async () => {
    const item = await itemId(db);
    const other = await branchId(db, "other");
    await asUser(db, ROVING_MANAGER, `select staff_set_menu_item_hold('${item}', '${other}', 'indefinite')`);
    expect(await scalar<boolean>(db, `select menu_item_is_available('${item}', '${other}')`)).toBe(false);
  });

  it("records one branch scoped audit row per real change and none for a no-op", async () => {
    const item = await itemId(db);
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', 'indefinite')`);

    const rows = await asUser<{ action: string; branch_id: string | null }>(
      db, ROVING_MANAGER, "select action, branch_id::text from audit_logs order by id",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("menu.item.held");
    expect(rows[0]?.branch_id).toBe(pilot);

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${item}', '${pilot}', null)`);
    const after = await asUser<{ action: string }>(db, ROVING_MANAGER, "select action from audit_logs order by id");
    expect(after.map((row) => row.action)).toEqual(["menu.item.held", "menu.item.released"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sql/menu-item-holds.test.ts`
Expected: FAIL. Every case errors with `relation "menu_item_branch_holds" does not exist` or `function menu_item_is_available(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0051_menu_item_branch_holds.sql`:

```sql
-- 0051_menu_item_branch_holds.sql
-- Marking one item sold out at one counter, and the single definition of
-- whether an item is available there.
--
-- WHY THIS IS A TABLE AND NOT TWO COLUMNS ON menu_items.
--
-- The reference is a single store, so it carries unavailability_kind and
-- unavailable_until on the item row. This platform is nine branches sharing one
-- catalog. Those columns here would mean the cashier at Central Bloc running out
-- of wings hides them at Mango Avenue too, and correcting that later is a
-- migration plus a storefront change. 0002 states the project's position on
-- exactly this: the schema carries all nine branches from day one so that
-- opening the second is a boolean, not a migration.
--
-- It also splits the two menu permissions cleanly, which one column cannot.
-- menu_items.is_active is the manager's decision, off the menu everywhere and
-- indefinitely, and needs menu:configure. A row here is the cashier's decision
-- mid shift, paused at this counter until tonight, and needs menu:availability.
--
-- THERE IS NO SWEEP.
--
-- The reference calls refresh_expired_menu_item_availability() at the top of
-- every menu page load to clear holds that have run out. Comparing the
-- timestamp inside menu_item_is_available() gets the same behaviour with no
-- cron, and with no window in which an expired hold is still hiding an item.
-- Deleting long expired rows is housekeeping and belongs to nothing here.

create table menu_item_branch_holds (
  item_id uuid not null references menu_items(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,

  -- 'today' and 'until' both carry an end and differ only in what the screen
  -- said when it was set, which is worth keeping for the audit trail.
  -- 'indefinite' has no end and is lifted by hand.
  kind text not null check (kind in ('today', 'until', 'indefinite')),
  unavailable_until timestamptz,

  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (item_id, branch_id),

  -- Lifting a hold deletes the row. There is deliberately no is_held boolean:
  -- a flag beside a timestamp is two states that can disagree.
  constraint hold_has_an_end check (
    kind = 'indefinite' or unavailable_until is not null
  )
);
create index menu_item_branch_holds_branch_idx on menu_item_branch_holds (branch_id);
create trigger menu_item_branch_holds_set_updated_at
  before update on menu_item_branch_holds
  for each row execute function set_updated_at();

alter table menu_item_branch_holds enable row level security;

create policy "staff read holds" on menu_item_branch_holds
  for select using (current_staff_has_permission('menu:view'));

-- Select only. The write is the RPC below, per 0022. Do not add insert, update
-- or delete here to bring a form back in a hurry.
grant select on menu_item_branch_holds to authenticated;

-- ---------------------------------------------------------------------------
-- The one definition of available.
-- ---------------------------------------------------------------------------
--
-- branch_is_open_at() is the only definition of open and every surface calls
-- it. This is the same arrangement for items: get_storefront_menu, place_order
-- and the workspace list all call this rather than comparing a timestamp
-- themselves, so the menu and the checkout gate cannot disagree.
--
-- A null branch returns true, and that is load bearing rather than sloppy.
-- get_storefront_menu is called with no branch slug before a customer has
-- picked a store. A menu that hid every item in that state would be worse than
-- one that hid none, and a hold is a fact about one counter, not about the
-- catalog.
create or replace function menu_item_is_available(
  p_item_id uuid,
  p_branch_id uuid,
  p_at timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from menu_item_branch_holds h
    where h.item_id = p_item_id
      and h.branch_id = p_branch_id
      and (h.kind = 'indefinite' or h.unavailable_until > p_at)
  )
$$;

comment on function menu_item_is_available(uuid, uuid, timestamptz) is
  'Whether an item can be sold at a branch at a moment. The only place a hold '
  'is compared to a clock. Returns true for a null branch, which is the state '
  'the storefront is in before a customer has chosen a store.';

-- ---------------------------------------------------------------------------
-- The mid shift control.
-- ---------------------------------------------------------------------------
--
-- p_kind null lifts the hold. Anything else sets one, replacing whatever was
-- there, so a cashier extending "until 6pm" to "until 8pm" is one call.
--
-- Two checks, not one: current_staff_can_access_branch() answers which counter,
-- and it answers nothing at all about permission.
create or replace function staff_set_menu_item_hold(
  p_item_id uuid,
  p_branch_id uuid,
  p_kind text,
  p_unavailable_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_now timestamptz := now();
  v_existing menu_item_branch_holds%rowtype;
  v_item_name text;
begin
  if not current_staff_has_permission('menu:availability') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_item_id is null or p_branch_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if p_kind is not null and p_kind not in ('today', 'until', 'indefinite') then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;
  if not current_staff_can_access_branch(p_branch_id) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;

  select name into v_item_name from menu_items where id = p_item_id;
  if v_item_name is null then
    raise exception 'ITEM_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- A timed hold with no end would be an indefinite one wearing the wrong
  -- label, and one that has already passed is available the instant it is set.
  -- Both are data entry slips, so refuse rather than guess which was meant.
  if p_kind in ('today', 'until') then
    if p_unavailable_until is null then
      raise exception 'HOLD_NEEDS_AN_END' using errcode = 'P0001';
    end if;
    if p_unavailable_until <= v_now then
      raise exception 'HOLD_END_IN_PAST' using errcode = 'P0001';
    end if;
  end if;

  select * into v_existing
  from menu_item_branch_holds
  where item_id = p_item_id and branch_id = p_branch_id
  for update;

  if p_kind is null then
    if not found then
      return;
    end if;
    delete from menu_item_branch_holds
    where item_id = p_item_id and branch_id = p_branch_id;

    insert into audit_logs
      (actor_profile_id, action, target_table, target_id, diff, branch_id)
    values (
      v_actor_id, 'menu.item.released', 'menu_items', p_item_id::text,
      jsonb_build_object(
        'item_name', v_item_name,
        'before', jsonb_build_object(
          'kind', v_existing.kind,
          'unavailable_until', v_existing.unavailable_until
        )
      ),
      p_branch_id
    );
    return;
  end if;

  -- A no-op writes no audit row, matching staff_set_branch_accepting_orders.
  if found
     and v_existing.kind = p_kind
     and v_existing.unavailable_until is not distinct from p_unavailable_until then
    return;
  end if;

  insert into menu_item_branch_holds
    (item_id, branch_id, kind, unavailable_until, created_by)
  values
    (p_item_id, p_branch_id, p_kind, p_unavailable_until, v_actor_id)
  on conflict (item_id, branch_id) do update
    set kind = excluded.kind,
        unavailable_until = excluded.unavailable_until,
        created_by = excluded.created_by;

  insert into audit_logs
    (actor_profile_id, action, target_table, target_id, diff, branch_id)
  values (
    v_actor_id, 'menu.item.held', 'menu_items', p_item_id::text,
    jsonb_build_object(
      'item_name', v_item_name,
      'before', case when v_existing.item_id is null then null else jsonb_build_object(
        'kind', v_existing.kind,
        'unavailable_until', v_existing.unavailable_until
      ) end,
      'after', jsonb_build_object(
        'kind', p_kind,
        'unavailable_until', p_unavailable_until
      )
    ),
    p_branch_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants, in the same migration that creates the functions, per 0010.
-- ---------------------------------------------------------------------------
--
-- The revoke names anon and authenticated and not only public, because
-- Supabase ships a default privilege granting execute to all three. A revoke
-- from public alone removes a privilege nobody held. See 0015.

revoke execute on function menu_item_is_available(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;

-- menu_item_is_available stays internal. get_storefront_menu and place_order
-- are both SECURITY DEFINER, so inside them the effective user is the owner and
-- the call succeeds without the caller holding execute on it.
grant execute on function staff_set_menu_item_hold(uuid, uuid, text, timestamptz)
  to authenticated;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sql/menu-item-holds.test.ts`
Expected: PASS, 10 tests.

If the grant test fails, check that the `revoke` line names `anon` and `authenticated` and not only `public`.

- [ ] **Step 5: Run the full verification set**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`
Expected: all pass. Every pre-existing SQL test still passes, because `0051` adds and changes nothing existing.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0051_menu_item_branch_holds.sql tests/sql/menu-item-holds.test.ts
git commit -m "feat(menu): per branch availability holds with no expiry sweep"
```

---

## Task 2: The two readers gate on holds

**Files:**
- Create: `supabase/migrations/0052_menu_availability_readers.sql`
- Test: `tests/sql/menu-availability-readers.test.ts` (create)
- Reference only, do not edit: `supabase/migrations/0011_storefront_menu.sql`, `supabase/migrations/0013_place_order.sql`

**Interfaces:**
- Consumes: `menu_item_is_available(uuid, uuid, timestamptz)` from Task 1.
- Produces: no new names. `get_storefront_menu(text)` and `place_order(jsonb, uuid)` keep their signatures, so nothing downstream changes.

**Why this is its own migration and its own task.** It is the only part of this feature that touches the customer checkout path. A reviewer should be able to reject it without rejecting the workspace work.

**The rule this task exists to keep.** `place_order` carries this comment at its section 7:

> The `is_active` filters here are the ones `get_storefront_menu` applies, on every level including the category. They have to be identical: a filter this function is missing sells something the menu is hiding, and one the menu is missing refuses something a customer can see.

Gating only the menu breaks that in the first direction: a customer holding a page rendered before the hold could still buy sold out wings, and the counter finds out at the fryer.

**How to write this migration.** Both functions are recreated whole with `create or replace`. Copy each body verbatim out of its original migration and make only the edits below. Do not retype either function from memory, and do not take the chance to tidy anything: a diff that is one line is a diff a reviewer can check.

**Edit 1, `get_storefront_menu`.** Copy lines 107 to 277 of `0011_storefront_menu.sql` (the whole `create or replace function ... $$;`). Add a CTE immediately after the existing `list` CTE:

```sql
with list as (
  select resolve_price_list_id(p_branch_slug) as id
),

-- The branch the customer is ordering from, when they have chosen one. Empty
-- when they have not, which makes the availability call below see a null branch
-- and hide nothing. See the comment on menu_item_is_available.
branch as (
  select b.id
  from branches b
  where p_branch_slug is not null
    and b.slug = p_branch_slug
),
```

Then in the `item_json` CTE, extend the existing `where mi.is_active` to:

```sql
  where mi.is_active
    and menu_item_is_available(mi.id, (select id from branch), now())
```

Nothing else in that function changes. The trailing `and i.items is not null` on the outer query already means a category whose every item is held drops out of the menu, which is correct: a section with nothing in it should not be on the board.

**Edit 2, `place_order`.** Copy lines 50 to 596 of `0013_place_order.sql`. Make one change, in section 7, to the item lookup:

```sql
    select mi.id, mi.name
      into v_item
      from menu_items mi
      join menu_categories mc on mc.id = mi.category_id and mc.is_active
      where mi.slug = v_line->>'item_slug'
        and mi.is_active
        and menu_item_is_available(mi.id, v_branch_id, v_now);
```

`v_branch_id` and `v_now` are both already declared and in scope there, and `v_branch_id` cannot be null because `NO_BRANCH` is raised in section 3. The existing `if not found then raise exception 'ITEM_UNAVAILABLE:%'` below it is reused unchanged, so the checkout screen's error handling needs no new case.

Extend the comment above that block to name the new filter, so the next person to add one knows both functions have to move together.

- [ ] **Step 1: Write the failing test**

Create `tests/sql/menu-availability-readers.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const CASHIER = "79000000-0000-4000-8000-000000000001";

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
    insert into auth.users (id, email) values ('${CASHIER}', 'cashier@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city, is_active)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City', true from price_lists;
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${CASHIER}', 'staff', 'cashier', 'Cashier', id from branches where slug = 'pilot';

    insert into menu_categories (slug, name) values ('wings', 'Wings'), ('sides', 'Sides');
    insert into menu_items (category_id, slug, name)
    select id, 'chicken-wings', 'Chicken Wings' from menu_categories where slug = 'wings';
    insert into menu_items (category_id, slug, name)
    select id, 'fries', 'Fries' from menu_categories where slug = 'sides';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default)
    select id, 'regular', 'Regular', 'REG', 10000, true from menu_items where slug = 'chicken-wings';
    insert into item_variations (item_id, slug, label, short_label, price_cents, is_default)
    select id, 'regular', 'Regular', 'REG', 5000, true from menu_items where slug = 'fries';
  `);
  return db;
}

const itemId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from menu_items where slug = '${slug}'`);
const branchId = (db: PGlite, slug: string) => scalar<string>(db, `select id::text from branches where slug = '${slug}'`);

/** The item slugs the storefront would render for a branch. */
async function menuSlugs(db: PGlite, branchSlug: string | null): Promise<string[]> {
  const arg = branchSlug === null ? "null" : `'${branchSlug}'`;
  const menu = await scalar<Array<{ items: Array<{ slug: string }> }>>(
    db, `select get_storefront_menu(${arg})`,
  );
  return menu.flatMap((category) => category.items.map((item) => item.slug)).sort();
}

describe("hold aware storefront readers", () => {
  let db: PGlite;
  beforeEach(async () => { db = await setup(); }, 120_000);

  it("shows every active item when nothing is held", async () => {
    expect(await menuSlugs(db, "pilot")).toEqual(["chicken-wings", "fries"]);
  });

  it("hides a held item at the held branch and nowhere else", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite')`);

    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);
    expect(await menuSlugs(db, "other")).toEqual(["chicken-wings", "fries"]);
  });

  it("hides nothing when no branch has been chosen", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'indefinite')`);

    expect(await menuSlugs(db, null)).toEqual(["chicken-wings", "fries"]);
  });

  it("drops a category whose every item is held", async () => {
    const fries = await itemId(db, "fries");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${fries}', '${pilot}', 'indefinite')`);

    const menu = await scalar<Array<{ slug: string }>>(db, `select get_storefront_menu('pilot')`);
    expect(menu.map((category) => category.slug)).toEqual(["wings"]);
  });

  it("shows a held item again once its hold has expired", async () => {
    const wings = await itemId(db, "chicken-wings");
    const pilot = await branchId(db, "pilot");
    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', 'until', now() - interval '1 second' + interval '2 seconds')`);
    expect(await menuSlugs(db, "pilot")).toEqual(["fries"]);

    await asUser(db, CASHIER, `select staff_set_menu_item_hold('${wings}', '${pilot}', null)`);
    expect(await menuSlugs(db, "pilot")).toEqual(["chicken-wings", "fries"]);
  });
});
```

**A second test file is extended, not created.** `tests/sql/place-order.test.ts` already exists and already builds a working payload. Add one case to it rather than rebuilding that setup:

```ts
it("refuses a line whose item is held at the ordering branch", async () => {
  // Reuse this file's existing helpers for the branch, the staff caller and the
  // payload. Hold the item, then place the same order that passes above.
  await holdItemAtOrderingBranch();
  await expect(placeValidOrder()).rejects.toThrow(/ITEM_UNAVAILABLE/);
});
```

Read the existing file first and match its helper names; do not invent `holdItemAtOrderingBranch` if a fixture already does that work.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sql/menu-availability-readers.test.ts`
Expected: FAIL. "hides a held item at the held branch" returns both slugs, because `get_storefront_menu` does not filter yet.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0052_menu_availability_readers.sql` with the header below, then the two recreated functions per the edits described above.

```sql
-- 0052_menu_availability_readers.sql
-- The two readers that have to agree about a held item.
--
-- 0013 section 7 says it plainly: the filters in place_order are the ones
-- get_storefront_menu applies, and they have to be identical, because a filter
-- this function is missing sells something the menu is hiding, and one the menu
-- is missing refuses something a customer can see. 0051 added a third filter
-- alongside is_active, so both functions move here, together, in one migration.
--
-- Both are recreated whole because Postgres has no way to patch a function
-- body. The bodies below are copied verbatim from 0011 and 0013. The only
-- changes are the `branch` CTE and the availability call in get_storefront_menu,
-- and the availability call in place_order's item lookup. Nothing else was
-- touched, deliberately, so the diff a reviewer reads is the change.
```

Do not add grants. Both functions keep their existing signature, so the grants from `0011` and `0013` still apply. Adding a `grant` here would be harmless but misleading.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sql/menu-availability-readers.test.ts tests/sql/place-order.test.ts`
Expected: PASS. Every pre-existing `place-order` case still passes, which is the real assertion: the copied body is the same body.

- [ ] **Step 5: Run the full verification set**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`
Expected: all pass. Pay attention to `tests/sql/storefront-menu.test.ts` if it exists: an unchanged menu with no holds must return exactly what it returned before.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0052_menu_availability_readers.sql tests/sql/menu-availability-readers.test.ts tests/sql/place-order.test.ts
git commit -m "feat(menu): storefront and place_order gate on branch holds"
```

---
## Task 3: The read

**Files:**
- Create: `lib/staff/menu-types.ts`
- Create: `lib/staff/menu.ts`
- Test: `tests/unit/staff-menu-read.test.ts` (create)

**Interfaces:**
- Consumes: `createStaffClient()` from `lib/supabase/server`, the tables from `0003` and the holds table from Task 1.
- Produces:
  - `lib/staff/menu-types.ts`: `ManagedCategory`, `ManagedItem`, `ManagedVariation`, `ManagedOptionGroup`, `ManagedOption`, `ManagedHold`, `ManagedMenu`, `MenuActionState`, `HoldKind`, and the pure helpers `formatPesoFromCents` is **not** added here (use the existing `formatPeso` from `lib/format`).
  - `lib/staff/menu.ts`: `getManagedMenu(): Promise<ManagedMenu | null>` and the pure `assembleManagedMenu(rows: ManagedMenuRows): ManagedMenu`.

  Tasks 4, 6, 7, 9, 10 and 11 all import types from `lib/staff/menu-types.ts`. Nothing imports from `lib/staff/menu.ts` except server components.

**Why the split.** `lib/staff/menu.ts` starts with `import "server-only"`, which makes it unimportable from a client component. Every type a client component needs therefore lives in `menu-types.ts`, which imports nothing server-side. `lib/staff/availability.ts` and `lib/staff/availability-types.ts` are the same pair; follow them.

**Why a pure assembler.** The eight selects cannot be unit tested without a database, but the grouping of variations under items, items under categories, options under groups and holds under items is where the bugs live. `assembleManagedMenu` takes the eight already-fetched arrays and returns the tree, so it is testable with plain objects. `toBranchAvailability` in `lib/staff/availability.ts` is the same arrangement.

- [ ] **Step 1: Write the types**

Create `lib/staff/menu-types.ts`:

```ts
/**
 * Every type the menu management screens share.
 *
 * Nothing here imports server-only, because the client components in
 * app/(workspace)/workspace/menu import from this file. The reader lives in
 * lib/staff/menu.ts and is server only. Same split as availability-types.ts.
 */

export type HoldKind = "today" | "until" | "indefinite";

export type ManagedHold = {
  branchId: string;
  branchShortName: string;
  kind: HoldKind;
  /** ISO 8601, or null for an indefinite hold. */
  unavailableUntil: string | null;
};

export type ManagedVariation = {
  id: string;
  slug: string;
  label: string;
  shortLabel: string;
  priceCents: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

export type ManagedOption = {
  id: string;
  groupId: string;
  slug: string;
  name: string;
  description: string | null;
  /**
   * Null means this option has no flat price and is priced per variation
   * through menu_option_variation_prices. It does NOT mean free, and nothing
   * may coalesce it to zero. See the comment on menu_options.price_cents.
   */
  priceCents: number | null;
  heatPercent: number | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type ManagedOptionGroup = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  options: ManagedOption[];
  /** Item ids this group is linked to, for the "used by" line. */
  linkedItemIds: string[];
};

export type ManagedItemOptionLink = {
  groupId: string;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  sortOrder: number;
};

export type ManagedItem = {
  id: string;
  categoryId: string;
  slug: string;
  name: string;
  code: string | null;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  variations: ManagedVariation[];
  optionLinks: ManagedItemOptionLink[];
  /** One per branch that currently holds this item. Empty when nothing holds it. */
  holds: ManagedHold[];
};

export type ManagedCategory = {
  id: string;
  slug: string;
  name: string;
  blurb: string | null;
  isActive: boolean;
  sortOrder: number;
  items: ManagedItem[];
};

export type ManagedBranch = {
  id: string;
  shortName: string;
};

export type ManagedMenu = {
  categories: ManagedCategory[];
  optionGroups: ManagedOptionGroup[];
  /** The branches this caller may act on, for the hold control's branch picker. */
  branches: ManagedBranch[];
};

/** The shape every Server Action in this feature returns. */
export type MenuActionState =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const HOLD_KIND_LABELS: Record<HoldKind, string> = {
  today: "Sold out for today",
  until: "Sold out until a time you pick",
  indefinite: "Sold out until someone puts it back",
};

/** What the row says under an item that is held somewhere. */
export function holdSummary(holds: ManagedHold[]): string | null {
  if (holds.length === 0) return null;
  const names = holds.map((hold) => hold.branchShortName).join(", ");
  return holds.length === 1 ? `Sold out at ${names}` : `Sold out at ${names}`;
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/staff-menu-read.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assembleManagedMenu, type ManagedMenuRows } from "@/lib/staff/menu";
import { holdSummary } from "@/lib/staff/menu-types";

const rows: ManagedMenuRows = {
  categories: [
    { id: "cat-wings", slug: "wings", name: "Wings", blurb: "By the piece.", is_active: true, sort_order: 10 },
    { id: "cat-empty", slug: "sides", name: "Sides", blurb: null, is_active: false, sort_order: 20 },
  ],
  items: [
    { id: "item-wings", category_id: "cat-wings", slug: "chicken-wings", name: "Chicken Wings", code: "BB1", description: null, image_url: null, is_featured: true, is_active: true, sort_order: 10 },
  ],
  variations: [
    { id: "var-full", item_id: "item-wings", slug: "full", label: "Full, 10 pieces", short_label: "FULL", price_cents: 52900, is_default: false, is_active: true, sort_order: 20 },
    { id: "var-half", item_id: "item-wings", slug: "half", label: "Half, 6 pieces", short_label: "HALF", price_cents: 32900, is_default: true, is_active: true, sort_order: 10 },
  ],
  groups: [
    { id: "grp-heat", slug: "level-of-hotness", name: "Level of Hotness", description: null, is_active: true, sort_order: 20 },
  ],
  options: [
    { id: "opt-insane", group_id: "grp-heat", slug: "insane", name: "Insane", description: null, price_cents: null, heat_percent: 100, image_url: null, is_active: true, sort_order: 60 },
    { id: "opt-none", group_id: "grp-heat", slug: "none", name: "No heat", description: null, price_cents: 0, heat_percent: 0, image_url: null, is_active: true, sort_order: 10 },
  ],
  links: [
    { item_id: "item-wings", group_id: "grp-heat", is_required: false, min_select: 0, max_select: 1, sort_order: 20 },
  ],
  holds: [
    { item_id: "item-wings", branch_id: "branch-pilot", kind: "until", unavailable_until: "2026-08-25T18:00:00.000Z" },
  ],
  branches: [{ id: "branch-pilot", short_name: "Central Bloc" }],
  optionPrices: [],
};

describe("assembleManagedMenu", () => {
  it("nests items under their category in sort order", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories.map((category) => category.slug)).toEqual(["wings", "sides"]);
    expect(menu.categories[0]?.items.map((item) => item.slug)).toEqual(["chicken-wings"]);
  });

  it("keeps a category that has no items, because a manager still has to edit it", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories[1]?.items).toEqual([]);
  });

  it("orders variations by sort order, not by the order they arrived", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.categories[0]?.items[0]?.variations.map((variation) => variation.slug)).toEqual(["half", "full"]);
  });

  it("preserves a null option price rather than coalescing it to zero", () => {
    const menu = assembleManagedMenu(rows);
    const heat = menu.optionGroups[0];
    expect(heat?.options.find((option) => option.slug === "insane")?.priceCents).toBeNull();
    expect(heat?.options.find((option) => option.slug === "none")?.priceCents).toBe(0);
  });

  it("attaches a hold to its item and names the branch", () => {
    const menu = assembleManagedMenu(rows);
    const item = menu.categories[0]?.items[0];
    expect(item?.holds).toEqual([
      { branchId: "branch-pilot", branchShortName: "Central Bloc", kind: "until", unavailableUntil: "2026-08-25T18:00:00.000Z" },
    ]);
  });

  it("reports which items an option group is used by", () => {
    const menu = assembleManagedMenu(rows);
    expect(menu.optionGroups[0]?.linkedItemIds).toEqual(["item-wings"]);
  });

  it("leaves holds empty for an item nothing holds", () => {
    const menu = assembleManagedMenu({ ...rows, holds: [] });
    expect(menu.categories[0]?.items[0]?.holds).toEqual([]);
    expect(holdSummary([])).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/staff-menu-read.test.ts`
Expected: FAIL with a module resolution error, because `lib/staff/menu.ts` does not exist.

- [ ] **Step 4: Write the reader**

Create `lib/staff/menu.ts`:

```ts
import "server-only";

import { createStaffClient } from "@/lib/supabase/server";
import type {
  HoldKind,
  ManagedCategory,
  ManagedItem,
  ManagedMenu,
  ManagedOption,
  ManagedOptionGroup,
  ManagedVariation,
} from "./menu-types";

/**
 * The eight rowsets this screen is built from, exactly as PostgREST returns
 * them. Kept snake_case on purpose: this is the boundary, and renaming happens
 * once, in assembleManagedMenu, where it can be tested.
 */
export type ManagedMenuRows = {
  categories: Array<{ id: string; slug: string; name: string; blurb: string | null; is_active: boolean; sort_order: number }>;
  items: Array<{ id: string; category_id: string; slug: string; name: string; code: string | null; description: string | null; image_url: string | null; is_featured: boolean; is_active: boolean; sort_order: number }>;
  variations: Array<{ id: string; item_id: string; slug: string; label: string; short_label: string; price_cents: number; is_default: boolean; is_active: boolean; sort_order: number }>;
  groups: Array<{ id: string; slug: string; name: string; description: string | null; is_active: boolean; sort_order: number }>;
  options: Array<{ id: string; group_id: string; slug: string; name: string; description: string | null; price_cents: number | null; heat_percent: number | null; image_url: string | null; is_active: boolean; sort_order: number }>;
  links: Array<{ item_id: string; group_id: string; is_required: boolean; min_select: number; max_select: number; sort_order: number }>;
  holds: Array<{ item_id: string; branch_id: string; kind: string; unavailable_until: string | null }>;
  branches: Array<{ id: string; short_name: string }>;
  /** Populated in Task 10. Every caller passes [] until then. */
  optionPrices: Array<{ option_id: string; variation_id: string; price_cents: number }>;
};

const bySortOrder = <T extends { sortOrder: number }>(a: T, b: T) => a.sortOrder - b.sortOrder;

/**
 * Rows in, tree out. Pure, so the grouping is unit tested without a database.
 *
 * price_cents arrives from PostgREST as a number for bigint columns within
 * range, but Number() is applied anyway so a string can never reach a form
 * input and become "32900" + 100.
 */
export function assembleManagedMenu(rows: ManagedMenuRows): ManagedMenu {
  const branchNames = new Map(rows.branches.map((branch) => [branch.id, branch.short_name]));

  const variationsByItem = new Map<string, ManagedVariation[]>();
  for (const row of rows.variations) {
    const list = variationsByItem.get(row.item_id) ?? [];
    list.push({
      id: row.id,
      slug: row.slug,
      label: row.label,
      shortLabel: row.short_label,
      priceCents: Number(row.price_cents),
      isDefault: row.is_default,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    });
    variationsByItem.set(row.item_id, list);
  }

  const linksByItem = new Map<string, ManagedItem["optionLinks"]>();
  const itemsByGroup = new Map<string, string[]>();
  for (const row of rows.links) {
    const list = linksByItem.get(row.item_id) ?? [];
    list.push({
      groupId: row.group_id,
      isRequired: row.is_required,
      minSelect: row.min_select,
      maxSelect: row.max_select,
      sortOrder: row.sort_order,
    });
    linksByItem.set(row.item_id, list);

    const groupItems = itemsByGroup.get(row.group_id) ?? [];
    groupItems.push(row.item_id);
    itemsByGroup.set(row.group_id, groupItems);
  }

  const holdsByItem = new Map<string, ManagedItem["holds"]>();
  for (const row of rows.holds) {
    const list = holdsByItem.get(row.item_id) ?? [];
    list.push({
      branchId: row.branch_id,
      branchShortName: branchNames.get(row.branch_id) ?? "Another branch",
      kind: row.kind as HoldKind,
      unavailableUntil: row.unavailable_until,
    });
    holdsByItem.set(row.item_id, list);
  }

  const itemsByCategory = new Map<string, ManagedItem[]>();
  for (const row of rows.items) {
    const list = itemsByCategory.get(row.category_id) ?? [];
    list.push({
      id: row.id,
      categoryId: row.category_id,
      slug: row.slug,
      name: row.name,
      code: row.code,
      description: row.description,
      imageUrl: row.image_url,
      isFeatured: row.is_featured,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      variations: (variationsByItem.get(row.id) ?? []).sort(bySortOrder),
      optionLinks: (linksByItem.get(row.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder),
      holds: holdsByItem.get(row.id) ?? [],
    });
    itemsByCategory.set(row.category_id, list);
  }

  const optionsByGroup = new Map<string, ManagedOption[]>();
  for (const row of rows.options) {
    const list = optionsByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.id,
      groupId: row.group_id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      // Null stays null. A null price means "priced by variation", never free.
      priceCents: row.price_cents === null ? null : Number(row.price_cents),
      heatPercent: row.heat_percent,
      imageUrl: row.image_url,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    });
    optionsByGroup.set(row.group_id, list);
  }

  const categories: ManagedCategory[] = rows.categories
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      blurb: row.blurb,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      // A category with no items still appears. It is a thing a manager has to
      // be able to rename, reorder or delete, and hiding it would strand it.
      items: (itemsByCategory.get(row.id) ?? []).sort(bySortOrder),
    }))
    .sort(bySortOrder);

  const optionGroups: ManagedOptionGroup[] = rows.groups
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isActive: row.is_active,
      sortOrder: row.sort_order,
      options: (optionsByGroup.get(row.id) ?? []).sort(bySortOrder),
      linkedItemIds: itemsByGroup.get(row.id) ?? [],
    }))
    .sort(bySortOrder);

  return {
    categories,
    optionGroups,
    branches: rows.branches.map((branch) => ({ id: branch.id, shortName: branch.short_name })),
  };
}

/**
 * The whole catalog for the workspace, in one round trip's worth of parallel
 * selects.
 *
 * No service role client and no RPC. 0022 revoked only the three write
 * privileges, so an ordinary staff session reads these tables and the RLS
 * policy on each one resolves menu:view. If a caller without that permission
 * reaches here, they get empty arrays from the database rather than an error,
 * which is why the page checks the permission too.
 *
 * Returns null when any select failed, so the page can render its designed
 * unavailable state instead of a half built tree.
 */
export async function getManagedMenu(): Promise<ManagedMenu | null> {
  const supabase = await createStaffClient();
  const [categories, items, variations, groups, options, links, holds, branches] = await Promise.all([
    supabase.from("menu_categories").select("id, slug, name, blurb, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_items").select("id, category_id, slug, name, code, description, image_url, is_featured, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("item_variations").select("id, item_id, slug, label, short_label, price_cents, is_default, is_active, sort_order").order("sort_order"),
    supabase.from("menu_option_groups").select("id, slug, name, description, is_active, sort_order").order("sort_order").order("name"),
    supabase.from("menu_options").select("id, group_id, slug, name, description, price_cents, heat_percent, image_url, is_active, sort_order").order("sort_order"),
    supabase.from("menu_item_option_groups").select("item_id, group_id, is_required, min_select, max_select, sort_order").order("sort_order"),
    supabase.from("menu_item_branch_holds").select("item_id, branch_id, kind, unavailable_until"),
    supabase.from("branches").select("id, short_name").order("sort_order").order("short_name"),
  ]);

  const failed = [categories, items, variations, groups, options, links, holds, branches].find((result) => result.error);
  if (failed?.error) {
    console.error("[workspace] menu read failed:", failed.error.message);
    return null;
  }

  return assembleManagedMenu({
    categories: categories.data ?? [],
    items: items.data ?? [],
    variations: variations.data ?? [],
    groups: groups.data ?? [],
    options: options.data ?? [],
    links: links.data ?? [],
    holds: holds.data ?? [],
    branches: branches.data ?? [],
    optionPrices: [],
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/unit/staff-menu-read.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add lib/staff/menu-types.ts lib/staff/menu.ts tests/unit/staff-menu-read.test.ts
git commit -m "feat(menu): read the managed catalog with a pure assembler"
```

---

## Task 4: The list, the nav entry, and the sold-out control

**Files:**
- Create: `app/(workspace)/workspace/menu/page.tsx`
- Create: `app/(workspace)/workspace/menu/actions.ts`
- Create: `app/(workspace)/workspace/menu/MenuList.tsx`
- Create: `app/(workspace)/workspace/menu/ItemHoldControl.tsx`
- Modify: `app/(workspace)/workspace/layout.tsx` (nav)
- Modify: `app/(workspace)/workspace/availability/page.tsx` (cross link)

**Interfaces:**
- Consumes: `getManagedMenu()` and the types from Task 3, `staff_set_menu_item_hold` from Task 1, `requireStaffPermission` and `hasStaffPermission` from `lib/staff/session`.
- Produces: `setMenuItemHold(previous: MenuActionState, formData: FormData): Promise<MenuActionState>` in `actions.ts`. Tasks 6, 7, 9, 10 and 11 add further actions to the same file.

**This is the first user visible deliverable.** After this task a cashier can mark an item sold out at their counter and the storefront stops offering it. Everything after this is the configure half.

**Permission shape on this page.** `requireStaffPermission("menu:view", "/workspace/menu")` gates the route. `hasStaffPermission(profile, "menu:availability")` decides whether the hold control renders, and `hasStaffPermission(profile, "menu:configure")` decides whether the New item, Categories and Options links render. The RPC repeats both checks, so a link that should not have rendered still cannot write.

**Which branch a hold applies to.** `profile.branchId` when it is set. When it is null the caller is a roving manager or an admin, and the control renders a branch select populated from `menu.branches`. Do not default a roving manager to the first branch: pausing the wrong counter silently is worse than making them choose.

- [ ] **Step 1: Write the action**

Create `app/(workspace)/workspace/menu/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { MenuActionState } from "@/lib/staff/menu-types";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

/**
 * Every menu change invalidates the same four paths.
 *
 * The two dynamic storefront routes are named as page paths, which is what
 * revalidatePath needs for a route with a parameter. Without them a customer
 * sitting on a category page keeps the old prices until the segment expires.
 */
function refreshMenu() {
  revalidatePath("/workspace/menu");
  revalidatePath("/menu");
  revalidatePath("/menu/[category]", "page");
  revalidatePath("/menu/[category]/[item]", "page");
}

/** Database error codes to sentences. Never show a raw Postgres message. */
function friendlyMenuError(message: string | undefined): string {
  if (message?.includes("BRANCH_FORBIDDEN")) return "You do not have access to change this counter.";
  if (message?.includes("FORBIDDEN")) return "You do not have access to make this change.";
  if (message?.includes("HOLD_NEEDS_AN_END")) return "Choose when this item comes back.";
  if (message?.includes("HOLD_END_IN_PAST")) return "Choose a time in the future for this item to come back.";
  if (message?.includes("ITEM_NOT_FOUND")) return "That item no longer exists. Refresh the page.";
  return "The menu change could not be saved. Try again.";
}

const holdSchema = z
  .object({
    itemId: z.uuid(),
    branchId: z.uuid(),
    kind: z.enum(["today", "until", "indefinite", "lift"]),
    unavailableUntil: z.string().trim().default(""),
  })
  .transform((value) => ({
    ...value,
    kind: value.kind === "lift" ? null : value.kind,
  }));

/**
 * Pause or resume one item at one counter.
 *
 * The form sends a local datetime string for a timed hold; it is turned into an
 * instant here, and the RPC refuses one that has already passed.
 */
export async function setMenuItemHold(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = holdSchema.safeParse({
    itemId: formData.get("itemId"),
    branchId: formData.get("branchId"),
    kind: formData.get("kind"),
    unavailableUntil: formData.get("unavailableUntil") ?? "",
  });
  if (!parsed.success) return { status: "error", message: "Check the item and try again." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:availability")) {
    return { status: "error", message: "You do not have access to change item availability." };
  }

  const { itemId, branchId, kind, unavailableUntil } = parsed.data;
  let until: string | null = null;
  if (kind === "today" || kind === "until") {
    if (!unavailableUntil) return { status: "error", message: "Choose when this item comes back." };
    const parsedDate = new Date(unavailableUntil);
    if (Number.isNaN(parsedDate.getTime())) {
      return { status: "error", message: "Choose when this item comes back." };
    }
    until = parsedDate.toISOString();
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_menu_item_hold", {
    p_item_id: itemId,
    p_branch_id: branchId,
    p_kind: kind,
    p_unavailable_until: until,
  });
  if (error) {
    console.error("[workspace] menu item hold failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return {
    status: "success",
    message: kind === null ? "Back on the menu." : "Marked sold out.",
  };
}
```

- [ ] **Step 2: Write the hold control**

Create `app/(workspace)/workspace/menu/ItemHoldControl.tsx`. Requirements, not a full listing, because this component is straightforward React and the repo's existing `AvailabilityManager.tsx` is the model to copy from:

- `"use client"`, `useActionState(setMenuItemHold, { status: "idle" })`.
- When the item has no hold for the acting branch: a select of the three `HOLD_KIND_LABELS` plus a `datetime-local` input that is only enabled for `today` and `until`, and a submit button reading "Mark sold out".
- For `today`, prefill the datetime with the end of the current Manila day. `lib/staff/manila-dates.ts` already has the helpers; do not compute a timezone offset by hand.
- When the item is held: a line saying which branch and until when, and a "Put back on the menu" button that submits `kind="lift"`.
- The status message renders with `role="alert"` on error and `role="status"` on success, matching `StatusMessage` in `AvailabilityManager.tsx`.
- Buttons are `min-h-11`.
- Hidden `branchId` input, whose value is `profile.branchId` when set. When the profile has no branch, render a `WorkspaceSelect` of `menu.branches` with no preselected value and the label "Which counter".

- [ ] **Step 3: Write the list and the page**

Create `app/(workspace)/workspace/menu/MenuList.tsx` (client) and `app/(workspace)/workspace/menu/page.tsx` (server). The page:

```tsx
import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/Button";
import { getManagedMenu } from "@/lib/staff/menu";
import { hasStaffPermission, requireStaffPermission } from "@/lib/staff/session";
import { MenuList } from "./MenuList";

export const metadata: Metadata = { title: "Menu" };

export default async function WorkspaceMenuPage() {
  const { profile } = await requireStaffPermission("menu:view", "/workspace/menu");
  const menu = await getManagedMenu();
  const can = {
    configure: hasStaffPermission(profile, "menu:configure"),
    availability: hasStaffPermission(profile, "menu:availability"),
  };

  if (!menu) {
    return (
      <div role="alert" className="border-nybb-bone/30 mt-7 rounded-md border border-dashed p-5">
        <p className="font-display heading-panel">The menu is unavailable</p>
        <p className="text-nybb-bone/60 mt-2 text-sm">
          Your session is still valid. The workspace could not read the catalog, so try again.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="type-caps text-nybb-yellow">Owner tools</p>
          <h1 className="font-display heading-major mt-2">Menu</h1>
          <p className="text-nybb-bone/60 mt-2 max-w-2xl text-sm">
            {can.configure
              ? "Everything the storefront sells. Changes are saved through audited database controls and reach the site immediately."
              : "Everything the storefront sells. Mark an item sold out at your counter and it stops being offered there straight away."}
          </p>
        </div>
        {can.configure ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/workspace/menu/items/new" tone="dark" variant="primary">New item</ButtonLink>
            <ButtonLink href="/workspace/menu/categories" tone="dark" variant="secondary">Categories</ButtonLink>
            <ButtonLink href="/workspace/menu/options" tone="dark" variant="secondary">Options</ButtonLink>
          </div>
        ) : null}
      </div>
      <MenuList menu={menu} can={can} actingBranchId={profile.branchId} />
    </div>
  );
}
```

`MenuList.tsx` renders one section per category with a heading, and one row per item carrying: name, `code` when present, its size prices formatted with `formatPeso` from `lib/format`, an "Off the menu" chip when `isActive` is false, a "Featured" chip when `isFeatured`, `holdSummary(item.holds)` when it returns a string, the `ItemHoldControl` when `can.availability`, and an Edit link when `can.configure`. A category with no items renders one line saying so rather than an empty block.

- [ ] **Step 4: Add the nav entry**

In `app/(workspace)/workspace/layout.tsx`, add `UtensilsCrossed` to the existing `lucide-react` import and insert this block immediately after the Orders block and before the `store:availability` block, so the nav reads Dashboard, Orders, History, Menu, Availability:

```tsx
{hasStaffPermission(profile, "menu:view") ? (
  <ButtonLink href="/workspace/menu" tone="dark" variant="ghost" className="px-3">
    <UtensilsCrossed aria-hidden className="size-4" />
    Menu
  </ButtonLink>
) : null}
```

In `app/(workspace)/workspace/availability/page.tsx`, add a `ButtonLink` to `/workspace/menu` beside the existing header actions, labelled "Menu availability". The counter status screen is where a cashier already is when the fryer backs up.

- [ ] **Step 5: Verify in the browser**

Start the dev server with the preview tools, not Bash. `preview_start` with the project's launch config, then navigate to `/workspace/menu`.

Check, using `read_page` rather than screenshots where possible:
- the page renders every seeded category and item;
- marking an item sold out changes the row without a full reload, and the message is announced;
- `/menu` on the storefront no longer offers that item for the held branch;
- putting it back restores it;
- `read_console_messages` is clean.

- [ ] **Step 6: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add "app/(workspace)/workspace/menu" "app/(workspace)/workspace/layout.tsx" "app/(workspace)/workspace/availability/page.tsx"
git commit -m "feat(menu): workspace menu list with per counter sold out control"
```

---

## Task 5: The catalog write RPCs

**Files:**
- Create: `supabase/migrations/0053_staff_menu_catalog_writes.sql`
- Test: `tests/sql/menu-catalog-writes.test.ts` (create)

**Interfaces:**
- Consumes: `current_staff_has_permission(text)`, `audit_logs`.
- Produces:
  - `menu_slugify(p_value text) returns text`
  - `menu_unique_slug(p_table text, p_name text) returns text`
  - `staff_save_menu_category(p_id uuid, p_name text, p_blurb text, p_is_active boolean) returns uuid`
  - `staff_save_menu_option_group(p_id uuid, p_name text, p_description text, p_is_active boolean) returns uuid`
  - `staff_save_menu_option(p_id uuid, p_group_id uuid, p_name text, p_description text, p_price_cents bigint, p_heat_percent int, p_is_active boolean) returns uuid`
  - `staff_set_menu_option_image(p_option_id uuid, p_image_url text, p_width int, p_height int, p_blur_data_url text, p_source text) returns void`
  - `staff_reorder_menu(p_entity text, p_ids uuid[]) returns void`
  - `staff_delete_menu_entity(p_entity text, p_id uuid) returns void`

  Task 6 calls the category functions, Task 7 the option ones, Task 9 calls `staff_delete_menu_entity` for items, Task 11 calls `staff_set_menu_option_image`.

**Note the parameter count on the option image function.** `menu_options` carries `image_url`, `image_width`, `image_height`, `image_blur_data_url` and `image_source`, and unlike `menu_items` it has **no `image_treatment` column**. Check `0003_menu.sql` rather than copying the item signature from Task 8, which has seven parameters to this one's six.

**Slugs are generated in SQL, not in TypeScript.** The reference slugifies in the Server Action and sends the result. Here the client never sends a slug at all: a slug is a URL a customer may have open and the thing `place_order` matches lines on, so it is the database's to mint. `menu_unique_slug` tries the clean slug first and only appends a short suffix on collision, because `chicken-wings` is a better storefront URL than `chicken-wings-a1b2c3` and the seeded slugs are all clean.

**A rename does not change a slug.** Renaming "Chicken Wings" to "Buffalo Wings" must not 404 every link to it and must not orphan a cart line. The save functions only mint a slug on insert.

**`p_price_cents` is nullable and null means something.** For `staff_save_menu_option`, null means "priced per variation", not free. The function must accept null and store null. Never coalesce it.

- [ ] **Step 1: Write the failing test**

Create `tests/sql/menu-catalog-writes.test.ts` with the standard `asUser` helper and a setup that inserts a `CASHIER` (staff_role `cashier`) and a `MANAGER` (staff_role `manager`) both assigned to a pilot branch, one category, one item in it, one option group and two options. Then these cases:

```ts
it("grants execute to authenticated and never to anon", async () => {
  for (const signature of [
    "staff_save_menu_category(uuid, text, text, boolean)",
    "staff_save_menu_option_group(uuid, text, text, boolean)",
    "staff_save_menu_option(uuid, uuid, text, text, bigint, int, boolean)",
    "staff_set_menu_option_image(uuid, text, int, int, text, text)",
    "staff_reorder_menu(text, uuid[])",
    "staff_delete_menu_entity(text, uuid)",
  ]) {
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
  }
});

it("refuses a cashier every configure write", async () => {
  await expect(asUser(db, CASHIER, `select staff_save_menu_category(null, 'Drinks', null, true)`)).rejects.toThrow(/FORBIDDEN/);
  await expect(asUser(db, CASHIER, `select staff_delete_menu_entity('category', '${await categoryId(db)}')`)).rejects.toThrow(/FORBIDDEN/);
});

it("mints a clean slug and keeps it through a rename", async () => {
  const id = await scalar<string>(db, "select 1");  // replaced below
  const created = (await asUser<{ staff_save_menu_category: string }>(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', 'Cold and strong.', true)`))[0]!.staff_save_menu_category;
  expect(await scalar<string>(db, `select slug from menu_categories where id = '${created}'`)).toBe("iced-coffee");

  await asUser(db, MANAGER, `select staff_save_menu_category('${created}', 'Cold Brew', 'Cold and strong.', true)`);
  expect(await scalar<string>(db, `select slug from menu_categories where id = '${created}'`)).toBe("iced-coffee");
  expect(await scalar<string>(db, `select name from menu_categories where id = '${created}'`)).toBe("Cold Brew");
});

it("suffixes a slug only when the clean one is taken", async () => {
  await asUser(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', null, true)`);
  await asUser(db, MANAGER, `select staff_save_menu_category(null, 'Iced Coffee', null, true)`);
  const slugs = await asUser<{ slug: string }>(db, MANAGER, `select slug from menu_categories where name = 'Iced Coffee' order by slug`);
  expect(slugs[0]?.slug).toBe("iced-coffee");
  expect(slugs[1]?.slug).toMatch(/^iced-coffee-[a-z0-9]{6}$/);
});

it("stores a null option price as null rather than zero", async () => {
  const group = await groupId(db);
  const created = (await asUser<{ staff_save_menu_option: string }>(db, MANAGER, `select staff_save_menu_option(null, '${group}', 'Insane', null, null, 100, true)`))[0]!.staff_save_menu_option;
  expect(await scalar<number | null>(db, `select price_cents from menu_options where id = '${created}'`)).toBeNull();
});

it("refuses to delete a category that still has items", async () => {
  await expect(
    asUser(db, MANAGER, `select staff_delete_menu_entity('category', '${await categoryId(db)}')`),
  ).rejects.toThrow(/CATEGORY_HAS_ITEMS/);
});

it("refuses to delete an option a past order references", async () => {
  // Insert an order, an order_item and an order_item_options row against the
  // option first, using this file's fixture helpers.
  await expect(
    asUser(db, MANAGER, `select staff_delete_menu_entity('option', '${await optionId(db)}')`),
  ).rejects.toThrow(/OPTION_IN_ORDERS/);
});

it("refuses to delete an option group that is still linked", async () => {
  await expect(
    asUser(db, MANAGER, `select staff_delete_menu_entity('optionGroup', '${await groupId(db)}')`),
  ).rejects.toThrow(/GROUP_STILL_LINKED/);
});

it("reorders by the position of each id in the array", async () => {
  const ids = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_categories order by sort_order");
  const reversed = [...ids].reverse().map((row) => row.id);
  await asUser(db, MANAGER, `select staff_reorder_menu('category', array[${reversed.map((id) => `'${id}'::uuid`).join(",")}])`);
  const after = await asUser<{ id: string }>(db, MANAGER, "select id::text from menu_categories order by sort_order");
  expect(after.map((row) => row.id)).toEqual(reversed);
});

it("writes one audit row per real change and none for a no-op", async () => {
  const category = await categoryId(db);
  await asUser(db, MANAGER, `select staff_save_menu_category('${category}', 'Wings', null, true)`);
  await asUser(db, MANAGER, `select staff_save_menu_category('${category}', 'Wings', null, true)`);
  const rows = await asUser<{ action: string }>(db, MANAGER, "select action from audit_logs order by id");
  expect(rows.map((row) => row.action)).toEqual(["menu.category.updated"]);
});
```

Replace the placeholder first line of the slug test with the real call; it is shown only so the shape of a `returns uuid` call through `asUser` is unambiguous. The fixture helpers `categoryId`, `groupId` and `optionId` are small `scalar` wrappers, written the way `itemId` is in Task 1's test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sql/menu-catalog-writes.test.ts`
Expected: FAIL, every case, with `function staff_save_menu_category(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0053_staff_menu_catalog_writes.sql`. The header:

```sql
-- 0053_staff_menu_catalog_writes.sql
-- Categories, option groups, options, ordering and deletes, as audited RPCs.
--
-- WHY RPCs AND NOT A FORM WRITING TABLES.
--
-- 0010 granted authenticated insert, update and delete on the menu tables on
-- the reasoning that owner tools are CRUD over those rows. 0022 took them all
-- back, because a direct write from a browser session leaves no audit row and
-- answers no permission question the database can see. Every write below
-- resolves current_staff_has_permission('menu:configure') and records what
-- changed. Do not re-grant those table privileges to bring a form back.
--
-- WHY SLUGS ARE MINTED HERE.
--
-- A slug is a URL a customer may have open, and it is what place_order matches
-- a cart line on. The client never sends one. A rename never changes one: the
-- save functions mint a slug on insert only, so renaming Chicken Wings to
-- Buffalo Wings does not 404 every link to it.
```

Then, in order:

**`menu_slugify(p_value text) returns text`**, `immutable`, `language sql`. Lowercase, strip accents with `translate`, replace every run of non `[a-z0-9]` with a single hyphen, trim leading and trailing hyphens, `left(..., 70)`. Return `'item'` when the result is empty, so a name of only punctuation still produces a legal slug.

**`menu_unique_slug(p_table text, p_name text) returns text`**, `language plpgsql`, `volatile`. Compute the base with `menu_slugify`. Loop: check for an existing row with that slug in `p_table` using `execute format('select exists (select 1 from %I where slug = $1)', p_table)`; if free, return it; otherwise try `base || '-' || substr(md5(gen_random_uuid()::text), 1, 6)`. Cap at ten attempts and raise `SLUG_COLLISION` after that. `p_table` is never user input: the three call sites pass a literal.

**`staff_save_menu_category(p_id uuid, p_name text, p_blurb text, p_is_active boolean) returns uuid`**. Check `menu:configure`. Validate: name trimmed, 2 to 80 characters, else `INVALID_INPUT`. Blurb trimmed, at most 200 characters, empty string stored as null. On insert, `sort_order` is the current maximum plus 10, and the slug comes from `menu_unique_slug('menu_categories', p_name)`. On update, take the row `for update`, return early with no audit row when nothing changed, otherwise update and write `menu.category.created` or `menu.category.updated` with a before and after diff. Return the id.

**`staff_save_menu_option_group(p_id uuid, p_name text, p_description text, p_is_active boolean) returns uuid`**. Same shape against `menu_option_groups`, actions `menu.option_group.created` and `menu.option_group.updated`, description at most 300 characters.

**`staff_save_menu_option(p_id uuid, p_group_id uuid, p_name text, p_description text, p_price_cents bigint, p_heat_percent int, p_is_active boolean) returns uuid`**. Same shape against `menu_options`. Extra validation: `p_price_cents` is null or between 0 and 10000000, else `PRICE_RANGE`; `p_heat_percent` is null or between 0 and 100, else `HEAT_RANGE`; the group must exist, else `GROUP_NOT_FOUND`. Slug is unique **within the group**, matching `unique (group_id, slug)` on the table, so this one call site cannot use `menu_unique_slug` as written. Write a small inline loop for it and comment why.

Include this comment above the price parameter:

```sql
  -- p_price_cents null is not a missing price and must never be coalesced to
  -- zero. It means this option is priced by the chosen variation, through
  -- menu_option_variation_prices. Every Level of Hotness row above "No heat"
  -- is null here on purpose. See 0003.
```

**`staff_set_menu_option_image(p_option_id uuid, p_image_url text, p_width int, p_height int, p_blur_data_url text, p_source text) returns void`**. Check `menu:configure`. The option must exist, else `OPTION_NOT_FOUND`. Write all five image columns together, because a URL without dimensions renders a broken tile in the flavour grid the same way it does on a product tile. Audit action `menu.option.image_changed`, diff carrying the option name and the new URL. Six parameters, not seven: this table has no `image_treatment`.

**`staff_reorder_menu(p_entity text, p_ids uuid[]) returns void`**. `p_entity` is one of `'category'`, `'item'`, `'option'`, else `INVALID_INPUT`. Set `sort_order` to `(array position + 1) * 10` for each id, in one `update ... from unnest(p_ids) with ordinality`. One audit row for the whole reorder, action `menu.reordered`, diff carrying the entity and the ordered ids.

**`staff_delete_menu_entity(p_entity text, p_id uuid) returns void`**. `p_entity` is one of `'category'`, `'item'`, `'option'`, `'optionGroup'`. The guards, each raising its own code so the action can say something specific:

| Entity | Guard | Code |
|---|---|---|
| category | any row in `menu_items` with this `category_id` | `CATEGORY_HAS_ITEMS` |
| item | any row in `order_items` with this `item_id` | `ITEM_IN_ORDERS` |
| option | any row in `order_item_options` with this `option_id` | `OPTION_IN_ORDERS` |
| optionGroup | any row in `menu_item_option_groups` with this `group_id` | `GROUP_STILL_LINKED` |
| optionGroup | any of its options in `order_item_options` | `OPTION_IN_ORDERS` |

Before deleting an item, delete its `cart_items` rows: a cart is temporary data and must not block a delete the way an order does. Check the real column names on `cart_items` in `0004_cart.sql` before writing that statement.

Write `menu.category.deleted`, `menu.item.deleted`, `menu.option.deleted`, `menu.option_group.deleted`, each with the deleted row's name in the diff, because after the delete the id resolves to nothing and a trail of bare uuids is unreadable.

Finish with the `revoke` and `grant` block for all seven functions, in the `0025` idiom. `menu_slugify` and `menu_unique_slug` stay internal: revoke from `public, anon, authenticated` and grant to nobody, because every caller is `SECURITY DEFINER`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sql/menu-catalog-writes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add supabase/migrations/0053_staff_menu_catalog_writes.sql tests/sql/menu-catalog-writes.test.ts
git commit -m "feat(menu): audited RPCs for categories, option groups and options"
```

---

## Task 6: The categories screen

**Files:**
- Create: `app/(workspace)/workspace/menu/categories/page.tsx`
- Create: `app/(workspace)/workspace/menu/categories/CategoryEditor.tsx`
- Modify: `app/(workspace)/workspace/menu/actions.ts`

**Interfaces:**
- Consumes: `staff_save_menu_category`, `staff_delete_menu_entity`, `staff_reorder_menu` from Task 5. `getManagedMenu()` from Task 3.
- Produces: `saveMenuCategory(previous: MenuActionState, formData: FormData): Promise<MenuActionState>` and `deleteMenuEntity(previous: MenuActionState, formData: FormData): Promise<MenuActionState>` in `actions.ts`. Tasks 7 and 9 reuse `deleteMenuEntity` unchanged.

**`deleteMenuEntity` is written once, here, for all four entity kinds.** Task 7 and Task 9 must not add a second delete action.

- [ ] **Step 1: Add the two actions**

Append to `app/(workspace)/workspace/menu/actions.ts`. Extend `friendlyMenuError` with the new codes first:

```ts
  if (message?.includes("CATEGORY_HAS_ITEMS")) return "Move or delete this category's items before deleting it.";
  if (message?.includes("ITEM_IN_ORDERS")) return "Past orders reference this item, so it cannot be deleted. Mark it unavailable instead.";
  if (message?.includes("OPTION_IN_ORDERS")) return "Past orders reference this option, so it cannot be deleted. Mark it unavailable instead.";
  if (message?.includes("GROUP_STILL_LINKED")) return "Unlink this option group from its items before deleting it.";
  if (message?.includes("PRICE_RANGE")) return "Check the price.";
  if (message?.includes("HEAT_RANGE")) return "Heat has to be between 0 and 100.";
  if (message?.includes("INVALID_INPUT")) return "Check the details and try again.";
```

Then:

```ts
const categorySchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  name: z.string().trim().min(2).max(80),
  blurb: z.string().trim().max(200).default(""),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function saveMenuCategory(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = categorySchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    blurb: formData.get("blurb") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the category name and blurb." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_category", {
    p_id: parsed.data.id || null,
    p_name: parsed.data.name,
    p_blurb: parsed.data.blurb || null,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] category save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Category saved." : "Category added." };
}

const deleteSchema = z.object({
  entity: z.enum(["category", "item", "option", "optionGroup"]),
  id: z.uuid(),
});

/** The one delete action, for all four entity kinds. Do not write a second. */
export async function deleteMenuEntity(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = deleteSchema.safeParse({
    entity: formData.get("entity"),
    id: formData.get("id"),
  });
  if (!parsed.success) return { status: "error", message: "That record could not be identified." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_delete_menu_entity", {
    p_entity: parsed.data.entity,
    p_id: parsed.data.id,
  });
  if (error) {
    console.error("[workspace] menu delete failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: "Deleted." };
}
```

- [ ] **Step 2: Write the page and the editor**

`categories/page.tsx` calls `requireStaffPermission("menu:configure", "/workspace/menu/categories")`, reads `getManagedMenu()`, and renders `CategoryEditor` with `menu.categories`. Header follows the settings page: caps eyebrow, `heading-major` title, one sentence of explanation, and a "Back to menu" `ButtonLink`.

`CategoryEditor.tsx` is a client component rendering one row per category, each an inline form with `WorkspaceInput` for name and blurb, a checkbox for active, a Save button, and a Delete button guarded by a confirmation. A blank row at the end adds a new category. The item count per category renders beside the name so the delete guard is not a surprise.

Requirements to hold:
- Each form is its own `useActionState`, so a failure on one row does not clear another.
- Delete is `variant="danger"` and asks for confirmation before submitting. A plain `window.confirm` is fine.
- The blurb field's helper text says what `0003` says: one line under the category header, a description rather than marketing copy.
- Inputs are labelled with `WorkspaceFieldLabel` and a real `htmlFor`. Do not rely on placeholder text as a label.

- [ ] **Step 3: Verify in the browser**

`preview_start`, navigate to `/workspace/menu/categories`. Add a category, rename it, check the slug did not move by looking at the storefront URL, and confirm the delete guard fires on a category that has items.

- [ ] **Step 4: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add "app/(workspace)/workspace/menu"
git commit -m "feat(menu): category editor"
```

---

## Task 7: The option groups screen

**Files:**
- Create: `app/(workspace)/workspace/menu/options/page.tsx`
- Create: `app/(workspace)/workspace/menu/options/OptionGroupEditor.tsx`
- Modify: `app/(workspace)/workspace/menu/actions.ts`

**Interfaces:**
- Consumes: `staff_save_menu_option_group`, `staff_save_menu_option` from Task 5, `deleteMenuEntity` from Task 6.
- Produces: `saveMenuOptionGroup` and `saveMenuOption` in `actions.ts`, both `(previous: MenuActionState, formData: FormData) => Promise<MenuActionState>`.

**The price field is the whole difficulty on this screen.** An option has three states and the form must express all three without lying about any:

| State | `price_cents` | What the field shows |
|---|---|---|
| Free | `0` | "Free" selected. |
| Costs a flat amount | a number | "Adds" selected, with the amount. |
| Priced by size | `null` | "Priced by size" selected, amount field hidden, with a note that the amounts are set on each item that uses this group. |

A single number input cannot express this, because an empty input and a zero would both have to mean something and they mean opposite things. Use a three way radio or select that drives whether the amount input is rendered at all.

- [ ] **Step 1: Add the two actions**

```ts
const optionGroupSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(300).default(""),
  isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
});

export async function saveMenuOptionGroup(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = optionGroupSchema.safeParse({
    id: formData.get("id") ?? "",
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the group name and description." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_option_group", {
    p_id: parsed.data.id || null,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] option group save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Group saved." : "Group added." };
}

/**
 * pricing is the three way choice, not a number.
 *
 * "bySize" sends null, which means this option is priced through
 * menu_option_variation_prices on each item that links the group. It does not
 * mean free, and turning it into 0 here would silently make every heat level
 * free on every wing size.
 */
const optionSchema = z
  .object({
    id: z.union([z.uuid(), z.literal("")]).default(""),
    groupId: z.uuid(),
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(300).default(""),
    pricing: z.enum(["free", "flat", "bySize"]),
    priceCents: z.coerce.number().int().min(0).max(10_000_000).default(0),
    heatPercent: z.union([z.coerce.number().int().min(0).max(100), z.literal("")]).default(""),
    isActive: z.enum(["true", "false"]).transform((value) => value === "true"),
  })
  .transform((value) => ({
    ...value,
    resolvedPriceCents:
      value.pricing === "bySize" ? null : value.pricing === "free" ? 0 : value.priceCents,
    resolvedHeatPercent: value.heatPercent === "" ? null : value.heatPercent,
  }));

export async function saveMenuOption(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  const parsed = optionSchema.safeParse({
    id: formData.get("id") ?? "",
    groupId: formData.get("groupId"),
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    pricing: formData.get("pricing"),
    priceCents: formData.get("priceCents") ?? 0,
    heatPercent: formData.get("heatPercent") ?? "",
    isActive: formData.get("isActive") ?? "true",
  });
  if (!parsed.success) return { status: "error", message: "Check the option name and price." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_save_menu_option", {
    p_id: parsed.data.id || null,
    p_group_id: parsed.data.groupId,
    p_name: parsed.data.name,
    p_description: parsed.data.description || null,
    p_price_cents: parsed.data.resolvedPriceCents,
    p_heat_percent: parsed.data.resolvedHeatPercent,
    p_is_active: parsed.data.isActive,
  });
  if (error) {
    console.error("[workspace] option save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  return { status: "success", message: parsed.data.id ? "Option saved." : "Option added." };
}
```

**Note on the amount unit.** The form takes pesos and the database stores centavos. Convert at the boundary in the client component with a single helper, and send `priceCents` already multiplied. Do not ask the owner to type 32900 for a 329 peso item.

- [ ] **Step 2: Write the page and the editor**

`options/page.tsx` gates on `menu:configure` and renders `OptionGroupEditor` with `menu.optionGroups` and `menu.categories` (the second so the "used by" line can name items rather than print ids).

`OptionGroupEditor.tsx` renders one card per group: the group's own name, description and active fields, the "used by" line built from `linkedItemIds`, a delete button, then the group's options as rows with name, the three way pricing control, the amount, heat percent and active. A blank row adds an option, and a blank card adds a group.

The heat field renders only when the group already has at least one option carrying a `heatPercent`, or when the person opens the "Advanced" disclosure. Nine wing flavours have no heat and a heat input on each of them is noise.

- [ ] **Step 3: Verify in the browser, then run the full set and commit**

Check specifically that saving an existing "priced by size" option without touching the pricing control leaves `price_cents` null. That is the regression this screen is most likely to introduce, and it would make every heat level free.

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add "app/(workspace)/workspace/menu"
git commit -m "feat(menu): option group editor with three way option pricing"
```

---
## Task 8: The item write RPCs

**Files:**
- Create: `supabase/migrations/0054_staff_menu_item_writes.sql`
- Test: `tests/sql/menu-item-writes.test.ts` (create)

**Interfaces:**
- Consumes: `menu_unique_slug`, `menu_slugify` from Task 5. `resolve_price_list_id(text)` from `0011`.
- Produces:
  - `staff_save_menu_item(p_id uuid, p_category_id uuid, p_name text, p_code text, p_description text, p_is_featured boolean, p_is_active boolean, p_variations jsonb, p_option_group_ids uuid[]) returns uuid`
  - `staff_set_menu_item_image(p_item_id uuid, p_image_url text, p_width int, p_height int, p_blur_data_url text, p_treatment text, p_source text) returns void`
  - `staff_set_option_variation_prices(p_item_id uuid, p_option_id uuid, p_prices jsonb) returns void`

  Task 9 calls the first, Task 10 the third, Task 11 the second.

**`p_variations` shape.** An array of objects, each `{"id": uuid or null, "label": text, "shortLabel": text, "priceCents": number, "isDefault": boolean, "isActive": boolean}`. Order in the array is the sort order. Validate every element and raise `INVALID_VARIATIONS` on anything malformed rather than letting a jsonb cast error escape.

**One item, one call, one audit row.** The item row, its variations and its option group links are a single editing thought. Three separate saves would leave an item half configured between them, which for a menu means a customer can see a size that has no price.

**Rules the function enforces**, each with its own error code:

| Rule | Code |
|---|---|
| At least one variation, at most 30 | `VARIATIONS_REQUIRED` |
| Exactly one variation is `isDefault` among the active ones | `ONE_DEFAULT_REQUIRED` |
| A variation id that is sent must belong to this item | `VARIATION_NOT_ON_ITEM` |
| The category exists | `CATEGORY_NOT_FOUND` |
| Every option group id exists | `GROUP_NOT_FOUND` |

**Why variations are deactivated rather than deleted.** `order_items` snapshots the variation text but also carries the id. Removing a row a past order points at either breaks the foreign key or silently rewrites history.

**Corrected 2026-08-26, during implementation (Ruling R21).** This section previously also listed a `VARIATION_IN_ORDERS` guard. There is no delete path for a variation, because the payload carries no removal verb and Ruling R4 deactivates anything absent, so that raise could never fire and must not be written. The protection it was meant to provide lives one level up: deleting the item cascades to its variations, and `staff_delete_menu_entity` guards that with `ITEM_IN_ORDERS`.

**`staff_set_option_variation_prices` and the price list.**

**Corrected 2026-08-26, during implementation (Ruling R22).** This section previously claimed `resolve_price_list_id(null)` raises once a second price list exists. It does not. Reading `0011:66-78`, a null slug returns the first active branch's list ordered by `sort_order, slug`, and only falls through to the single-list rule when **no** branch is active. That is true today, with every branch seeded inactive, and stops being true the moment the pilot goes live: with two lists and a live branch it would silently write heat prices to whichever branch sorts first.

So the function counts the lists itself and raises `MULTIPLE_PRICE_LISTS` when there is more than one, before resolving anything. This screen does not edit per list overrides (spec section 3.1), so refusing is the honest behaviour, and checking here makes the stated invariant real rather than assumed.

`p_prices` is an object keyed by variation id with a price in centavos, or null to clear that pairing:

```json
{ "b1f2...": 3000, "c3d4...": 4000 }
```

Every variation named must belong to `p_item_id`, else `VARIATION_NOT_ON_ITEM`. Every price is 0 to 10000000, else `PRICE_RANGE`. A variation omitted from the object has its row deleted, so clearing a price is expressible.

- [ ] **Step 1: Write the failing test**

Create `tests/sql/menu-item-writes.test.ts`. Setup: a `MANAGER` and a `CASHIER`, one category, one option group with a null priced option, one price list. Cases:

```ts
it("grants execute to authenticated and never to anon", async () => {
  for (const signature of [
    "staff_save_menu_item(uuid, uuid, text, text, text, boolean, boolean, jsonb, uuid[])",
    "staff_set_menu_item_image(uuid, text, int, int, text, text, text)",
    "staff_set_option_variation_prices(uuid, uuid, jsonb)",
  ]) {
    expect(await scalar<boolean>(db, `select has_function_privilege('authenticated', '${signature}', 'execute')`)).toBe(true);
    expect(await scalar<boolean>(db, `select has_function_privilege('anon', '${signature}', 'execute')`)).toBe(false);
  }
});

it("refuses a cashier", async () => {
  await expect(
    asUser(db, CASHIER, `select staff_save_menu_item(null, '${await categoryId(db)}', 'Fries', null, null, false, true, '[{"id":null,"label":"Regular","shortLabel":"REG","priceCents":5000,"isDefault":true,"isActive":true}]'::jsonb, array[]::uuid[])`),
  ).rejects.toThrow(/FORBIDDEN/);
});

it("creates an item, its variations and its links in one call", async () => {
  const category = await categoryId(db);
  const group = await groupId(db);
  const created = (await asUser<{ staff_save_menu_item: string }>(
    db, MANAGER,
    `select staff_save_menu_item(null, '${category}', 'Chicken Wings', 'BB1', 'Nine flavours.', true, true,
      '[{"id":null,"label":"Half, 6 pieces","shortLabel":"HALF","priceCents":32900,"isDefault":true,"isActive":true},
        {"id":null,"label":"Full, 10 pieces","shortLabel":"FULL","priceCents":52900,"isDefault":false,"isActive":true}]'::jsonb,
      array['${group}']::uuid[])`,
  ))[0]!.staff_save_menu_item;

  expect(await scalar<string>(db, `select slug from menu_items where id = '${created}'`)).toBe("chicken-wings");
  expect(await scalar<number>(db, `select count(*)::int from item_variations where item_id = '${created}'`)).toBe(2);
  expect(await scalar<number>(db, `select sort_order from item_variations where item_id = '${created}' and slug = 'full'`)).toBe(20);
  expect(await scalar<number>(db, `select count(*)::int from menu_item_option_groups where item_id = '${created}'`)).toBe(1);
  expect(await scalar<number>(db, `select count(*)::int from audit_logs where action = 'menu.item.created'`)).toBe(1);
});

it("refuses an item with no variations", async () => {
  await expect(
    asUser(db, MANAGER, `select staff_save_menu_item(null, '${await categoryId(db)}', 'Fries', null, null, false, true, '[]'::jsonb, array[]::uuid[])`),
  ).rejects.toThrow(/VARIATIONS_REQUIRED/);
});

it("refuses more than one default among the active variations", async () => {
  await expect(
    asUser(db, MANAGER, `select staff_save_menu_item(null, '${await categoryId(db)}', 'Fries', null, null, false, true,
      '[{"id":null,"label":"Small","shortLabel":"SM","priceCents":5000,"isDefault":true,"isActive":true},
        {"id":null,"label":"Large","shortLabel":"LG","priceCents":7000,"isDefault":true,"isActive":true}]'::jsonb, array[]::uuid[])`),
  ).rejects.toThrow(/ONE_DEFAULT_REQUIRED/);
});

it("keeps the slug through a rename and replaces the link set", async () => {
  // create with one group, save again with none, expect zero links and the same slug
});

it("refuses a variation id that belongs to another item", async () => {
  // create two items, send item A's variation id while saving item B
});

it("writes the five image columns together", async () => {
  const item = await someItemId(db);
  await asUser(db, MANAGER, `select staff_set_menu_item_image('${item}', 'https://example.test/a.webp', 900, 900, 'data:image/webp;base64,AA', 'cutout', 'uploaded')`);
  const row = (await asUser<{ image_url: string; image_width: number; image_blur_data_url: string }>(
    db, MANAGER, `select image_url, image_width, image_blur_data_url from menu_items where id = '${item}'`,
  ))[0];
  expect(row?.image_url).toBe("https://example.test/a.webp");
  expect(row?.image_width).toBe(900);
  expect(row?.image_blur_data_url).toBe("data:image/webp;base64,AA");
});

it("writes heat prices against the only price list", async () => {
  const item = await wingsItemId(db);
  const option = await optionId(db);
  const half = await variationId(db, item, "half");
  const full = await variationId(db, item, "full");
  await asUser(db, MANAGER, `select staff_set_option_variation_prices('${item}', '${option}', jsonb_build_object('${half}', 3000, '${full}', 4000))`);

  expect(await scalar<number>(db, `select price_cents from menu_option_variation_prices where option_id = '${option}' and variation_id = '${half}'`)).toBe(3000);
  expect(await scalar<number>(db, `select resolve_option_price_cents('${option}', '${full}', resolve_price_list_id(null))`)).toBe(4000);
});

it("clears a pairing that is left out of the object", async () => {
  // set both, then send only one, expect the other row gone
});

it("refuses a variation that is not on the item", async () => {
  // send another item's variation id
});

it("stops rather than guessing once a second price list exists", async () => {
  await db.exec("insert into price_lists (slug, name) values ('second', 'Second')");
  await expect(
    asUser(db, MANAGER, `select staff_set_option_variation_prices('${await wingsItemId(db)}', '${await optionId(db)}', '{}'::jsonb)`),
  ).rejects.toThrow();
});
```

Fill in the four cases left as comments; they follow the same shape as the ones written out and the plan does not repeat boilerplate you can read two lines above.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sql/menu-item-writes.test.ts`
Expected: FAIL with `function staff_save_menu_item(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0054_staff_menu_item_writes.sql` with this header, then the three functions to the rules above, then the `revoke` and `grant` block in the `0025` idiom.

```sql
-- 0054_staff_menu_item_writes.sql
-- An item, its sizes and its option groups in one audited call, plus its
-- photograph and its per size option prices.
--
-- WHY ONE CALL AND NOT THREE.
--
-- The item row, its variations and its option group links are one editing
-- thought. Saved separately, an interrupted edit leaves a size with no price or
-- a required group with no options, and for a menu that means a customer sees
-- something the kitchen cannot sell. One transaction, one audit row.
--
-- WHY VARIATIONS ARE DEACTIVATED AND NOT DELETED.
--
-- order_items carries the variation id alongside its text snapshot. Removing a
-- row a past order points at either breaks the reference or quietly rewrites
-- what somebody was charged for. is_active = false takes a size off the menu
-- and leaves the receipt intact.
--
-- WHY THE PRICE LIST IS RESOLVED AND NOT PASSED.
--
-- resolve_price_list_id(null) returns the only price list while exactly one
-- exists, and raises the moment a second is created. That is deliberate. This
-- screen does not edit per list overrides (see the design, section 3.1), so
-- the honest behaviour when a second list appears is to stop, not to write
-- heat prices to whichever list sorted first.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/sql/menu-item-writes.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add supabase/migrations/0054_staff_menu_item_writes.sql tests/sql/menu-item-writes.test.ts
git commit -m "feat(menu): audited RPCs for items, sizes, links, images and heat prices"
```

---

## Task 9: The item editor

**Files:**
- Create: `app/(workspace)/workspace/menu/items/ItemEditor.tsx`
- Create: `app/(workspace)/workspace/menu/items/new/page.tsx`
- Create: `app/(workspace)/workspace/menu/items/[id]/page.tsx`
- Modify: `app/(workspace)/workspace/menu/actions.ts`

**Interfaces:**
- Consumes: `staff_save_menu_item` from Task 8, `deleteMenuEntity` from Task 6, `getManagedMenu()` from Task 3.
- Produces: `saveMenuItem(previous: MenuActionState, formData: FormData): Promise<MenuActionState>`. Task 10 renders `HeatPriceGrid` inside `ItemEditor`; Task 11 renders `ImageField` inside it. Both slot into named places this task leaves for them.

**The two pages share one component.** `new/page.tsx` renders `<ItemEditor item={null} ... />` and `[id]/page.tsx` renders `<ItemEditor item={found} ... />`, both reading the same `getManagedMenu()`. `[id]/page.tsx` calls `notFound()` when the id is not in the menu. `ItemEditor.tsx` sits in `items/` rather than in `items/[id]/` so the `new` route is not importing across a dynamic segment.

**The variations sub form is the fiddly part.** It is a list in React state, not a set of independent forms, because the whole item saves in one call. Requirements:

- Add and remove rows client side. Removing a row that has an `id` marks it `isActive: false` and keeps it in the payload rather than dropping it, so the server can tell the difference between "deactivate this size" and "this size was never here".
- A removed existing row renders greyed with an Undo, not vanished. Silently disappearing a size that a past order references, then failing on save, is a worse experience than never offering it.
- Exactly one radio for the default size, across active rows.
- Prices are entered in pesos and converted to centavos once, in a single helper, at submit.
- Labels: "Size name" for `label` and "Short name for the ticket" for `shortLabel`, with helper text naming the example from `0003`: "Half, 6 pieces" and "HALF".

**Serialization.** The form posts one field, `payload`, carrying JSON. Do not spread the variations across indexed form field names: they nest, and reconstructing them from `FormData` keys is where this kind of form usually breaks.

- [ ] **Step 1: Add the action**

```ts
const variationInputSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  label: z.string().trim().min(1).max(60),
  shortLabel: z.string().trim().min(1).max(20),
  priceCents: z.number().int().min(0).max(10_000_000),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

const itemSchema = z.object({
  id: z.union([z.uuid(), z.literal("")]).default(""),
  categoryId: z.uuid(),
  name: z.string().trim().min(2).max(100),
  code: z.string().trim().max(16).default(""),
  description: z.string().trim().max(500).default(""),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  variations: z.array(variationInputSchema).min(1).max(30),
  optionGroupIds: z.array(z.uuid()).max(30),
});

export async function saveMenuItem(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { status: "error", message: "The item form could not be read. Refresh and try again." };
  }
  const parsed = itemSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Check the item details and its sizes." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { data, error } = await supabase.rpc("staff_save_menu_item", {
    p_id: parsed.data.id || null,
    p_category_id: parsed.data.categoryId,
    p_name: parsed.data.name,
    p_code: parsed.data.code || null,
    p_description: parsed.data.description || null,
    p_is_featured: parsed.data.isFeatured,
    p_is_active: parsed.data.isActive,
    p_variations: parsed.data.variations.map((variation) => ({
      id: variation.id || null,
      label: variation.label,
      shortLabel: variation.shortLabel,
      priceCents: variation.priceCents,
      isDefault: variation.isDefault,
      isActive: variation.isActive,
    })),
    p_option_group_ids: parsed.data.optionGroupIds,
  });
  if (error) {
    console.error("[workspace] item save failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  if (typeof data === "string") revalidatePath(`/workspace/menu/items/${data}`);
  return { status: "success", message: parsed.data.id ? "Item saved." : "Item added." };
}
```

Extend `friendlyMenuError` with the item codes:

```ts
  if (message?.includes("VARIATIONS_REQUIRED")) return "An item needs at least one size, even if it only has one price.";
  if (message?.includes("ONE_DEFAULT_REQUIRED")) return "Choose exactly one size as the default.";
  if (message?.includes("VARIATION_IN_ORDERS")) return "Past orders reference this size, so it cannot be removed. Turn it off instead.";
  if (message?.includes("VARIATION_NOT_ON_ITEM")) return "One of those sizes belongs to a different item. Refresh the page.";
  if (message?.includes("CATEGORY_NOT_FOUND")) return "That category no longer exists. Choose another.";
  if (message?.includes("GROUP_NOT_FOUND")) return "One of those option groups no longer exists. Refresh the page.";
```

- [ ] **Step 2: Write the editor and the two pages**

`ItemEditor.tsx` sections, in order:

1. **Details.** Category select, name, code, description, Featured checkbox, Active checkbox. Active's helper text names what it means: off the menu at every branch, indefinitely, and different from marking it sold out for a shift.
2. **Photo.** Leave `{/* Task 11 renders ImageField here. */}` as a placeholder comment and nothing else.
3. **Sizes.** The variations list described above.
4. **Options.** Checkbox list of `menu.optionGroups`, each showing its name and its option count.
5. **Per size option prices.** Leave `{/* Task 10 renders HeatPriceGrid here. */}`.
6. **Save**, plus **Delete** on an existing item using the `deleteMenuEntity` action with `entity="item"`.

`[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getManagedMenu } from "@/lib/staff/menu";
import { requireStaffPermission } from "@/lib/staff/session";
import { ItemEditor } from "../ItemEditor";

export const metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireStaffPermission("menu:configure", `/workspace/menu/items/${id}`);
  const menu = await getManagedMenu();
  if (!menu) notFound();

  const item = menu.categories.flatMap((category) => category.items).find((candidate) => candidate.id === id);
  if (!item) notFound();

  return <ItemEditor item={item} categories={menu.categories} optionGroups={menu.optionGroups} />;
}
```

- [ ] **Step 3: Verify in the browser**

Create an item with two sizes, save, reopen, and confirm every field came back. Turn a size off and confirm it survives a round trip as inactive rather than disappearing. Then check the storefront shows the new item, which will fail until Task 12 flips `dynamicParams`. Note that failure and move on: it is Task 12's job, and finding it here confirms Task 12 is needed.

- [ ] **Step 4: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add "app/(workspace)/workspace/menu"
git commit -m "feat(menu): item editor with sizes and option group links"
```

---

## Task 10: The heat price grid

**Files:**
- Create: `app/(workspace)/workspace/menu/items/HeatPriceGrid.tsx`
- Modify: `app/(workspace)/workspace/menu/items/ItemEditor.tsx` (render it in the slot Task 9 left)
- Modify: `app/(workspace)/workspace/menu/actions.ts`
- Modify: `lib/staff/menu.ts` and `lib/staff/menu-types.ts` (read the existing prices)

**Interfaces:**
- Consumes: `staff_set_option_variation_prices` from Task 8.
- Produces: `setOptionVariationPrices(previous: MenuActionState, formData: FormData): Promise<MenuActionState>`. `ManagedItem` gains `optionVariationPrices: Record<string, Record<string, number>>`, keyed option id then variation id.

**Why this grid exists.** Level of Hotness costs PHP 30 on a half order of wings and PHP 40 on a full one, and INSANE costs PHP 30 and PHP 60. That is a price per (option, size) pair, which no single number on the option row can express. Without this grid the owner can change the price of wings but not the price of making them hot.

**Which options appear.** Only options whose `priceCents` is null, from groups this item links. An option with a flat price, including free at 0, is priced on the options screen and must not appear here: showing it would imply the grid overrides it, which it does not.

**`ManagedMenuRows` already declares `optionPrices`**, added in Task 3 with every caller passing `[]`. This task fills it. Do not redeclare the field.

**Read the existing prices first.** `lib/staff/menu.ts` gains a ninth select:

```ts
supabase
  .from("menu_option_variation_prices")
  .select("option_id, variation_id, price_cents"),
```

and `assembleManagedMenu` nests them onto the item that owns the variation. Add a unit test case to `tests/unit/staff-menu-read.test.ts` covering that nesting before writing the component.

- [ ] **Step 1: Extend the read and its test**

Add to `ManagedItem`:

```ts
  /**
   * What each per size priced option costs on each of this item's sizes,
   * keyed option id then variation id. Absent pairs are genuinely unpriced and
   * resolve to the option's own price_cents, which for these options is null.
   */
  optionVariationPrices: Record<string, Record<string, number>>;
```

In `assembleManagedMenu`, build a `Map<variationId, itemId>` while walking variations, then fold `optionPrices` onto the owning item. Add this test case:

```ts
it("nests an option price under the item that owns the variation", () => {
  const menu = assembleManagedMenu({
    ...rows,
    optionPrices: [{ option_id: "opt-insane", variation_id: "var-half", price_cents: 4000 }],
  });
  expect(menu.categories[0]?.items[0]?.optionVariationPrices).toEqual({
    "opt-insane": { "var-half": 4000 },
  });
});
```

- [ ] **Step 2: Add the action**

```ts
const optionPriceSchema = z.object({
  itemId: z.uuid(),
  optionId: z.uuid(),
  /** variation id to centavos. A variation left out has its price cleared. */
  prices: z.record(z.uuid(), z.number().int().min(0).max(10_000_000)),
});

export async function setOptionVariationPrices(
  _previous: MenuActionState,
  formData: FormData,
): Promise<MenuActionState> {
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { status: "error", message: "The price grid could not be read. Refresh and try again." };
  }
  const parsed = optionPriceSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Check the prices and try again." };

  const profile = await getStaffProfile();
  if (!profile || !hasStaffPermission(profile, "menu:configure")) {
    return { status: "error", message: "You do not have access to change the menu." };
  }

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("staff_set_option_variation_prices", {
    p_item_id: parsed.data.itemId,
    p_option_id: parsed.data.optionId,
    p_prices: parsed.data.prices,
  });
  if (error) {
    console.error("[workspace] option variation prices failed:", error.message);
    return { status: "error", message: friendlyMenuError(error.message) };
  }

  refreshMenu();
  revalidatePath(`/workspace/menu/items/${parsed.data.itemId}`);
  return { status: "success", message: "Prices saved." };
}
```

- [ ] **Step 3: Write the grid**

`HeatPriceGrid.tsx` renders, per qualifying option, a row of peso inputs, one per active size of this item, with the size's short label as the column header. One Save per option row, because one save per grid would make a typo in one row block every other row.

An empty input clears that pairing, and the helper text says so in words: "Leave blank to remove the price for that size." Do not use 0 to mean cleared; 0 is a real price meaning free.

Above the grid, one sentence naming what it is: these options have no single price, so they cost a different amount on each size.

Render nothing at all, not an empty box, when the item has no per size priced options. That is 30 of the 31 seeded items.

- [ ] **Step 4: Verify in the browser, then run the full set and commit**

On the wings item, set Insane to 40 and 60, save, reload, and confirm both came back. Then check the storefront product page shows those amounts, which proves `resolve_option_price_cents` is reading what the grid wrote.

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add "app/(workspace)/workspace/menu" lib/staff/menu.ts lib/staff/menu-types.ts tests/unit/staff-menu-read.test.ts
git commit -m "feat(menu): per size option price grid"
```

---

## Task 11: Photographs

**Files:**
- First step decides: `next.config.ts` or `scripts/ingest-legacy-images.ts`
- Create: `lib/staff/menu-image.ts`
- Create: `app/(workspace)/workspace/menu/items/ImageField.tsx`
- Modify: `app/(workspace)/workspace/menu/items/ItemEditor.tsx` (render it in the slot Task 9 left)
- Modify: `app/(workspace)/workspace/menu/actions.ts`
- Test: `tests/unit/menu-image.test.ts` (create)

**Interfaces:**
- Consumes: `staff_set_menu_item_image` from Task 8, `sharp`, Supabase Storage.
- Produces:
  - `lib/staff/menu-image.ts`: `processMenuImage(file: File, options: { zoom: number; offsetY: number }): Promise<ProcessedMenuImage>` where `ProcessedMenuImage = { data: Buffer; width: number; height: number; blurDataURL: string }`, and `MENU_IMAGE_CONTENT_TYPE`, `MENU_IMAGE_EXTENSION`, `MENU_IMAGE_CACHE_CONTROL`, `MENU_IMAGE_MAX_BYTES`, `isDecodableImageType(type: string): boolean`.
  - `actions.ts`: `uploadMenuItemImage(previous: MenuActionState, formData: FormData)` and `previewMenuItemImage(formData: FormData): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }>`.

- [ ] **Step 1: Settle the bucket name before writing any upload code**

There are two claims in the repo and they disagree:

- `scripts/ingest-legacy-images.ts:36` writes to a bucket named `menu`.
- `next.config.ts:11` permits `/storage/v1/object/public/menu-images/**` and nothing else.

Whichever bucket actually holds the ingested images is the one uploads must use, and `next.config.ts` must permit exactly that path or `next/image` refuses to optimize every uploaded photo.

Find out rather than guess. In order:
1. `grep -rn "menu-images\|from(\"menu\")\|storage/v1/object" --include=*.ts --include=*.tsx .` excluding `node_modules`, to see every claim.
2. Check whether any `menu_items.image_url` value exists in a live database, and read its path. If the environment has no database reachable, say so and fall back to step 3.
3. If nothing is live, the two files are both aspirational and you are choosing. Choose `menu-images`, because `next.config.ts` is the file that is load bearing at runtime for every image on the storefront, and change the script.

Whichever you pick, make both files agree in the same commit, and write one sentence in the commit body saying which was wrong and how you established it. Do not leave them disagreeing.

- [ ] **Step 2: Write the failing test**

Create `tests/unit/menu-image.test.ts`. sharp runs in Node, so these are real image assertions, not mocks:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { isDecodableImageType, MENU_IMAGE_MAX_BYTES, processMenuImage } from "@/lib/staff/menu-image";

/** A solid rectangle, wider than tall, so the square crop has something to do. */
async function sampleFile(width = 1600, height = 900): Promise<File> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 239, g: 98, b: 18 } },
  }).png().toBuffer();
  return new File([png], "sample.png", { type: "image/png" });
}

describe("processMenuImage", () => {
  it("crops to a square at the tile width", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect(processed.width).toBe(processed.height);
    expect(processed.width).toBe(900);
  });

  it("never enlarges a source smaller than the tile width", async () => {
    const processed = await processMenuImage(await sampleFile(400, 400), { zoom: 1, offsetY: 0 });
    expect(processed.width).toBe(400);
  });

  it("produces a webp buffer", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect((await sharp(processed.data).metadata()).format).toBe("webp");
  });

  it("produces a blur placeholder small enough to inline", async () => {
    const processed = await processMenuImage(await sampleFile(), { zoom: 1, offsetY: 0 });
    expect(processed.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
    expect(processed.blurDataURL.length).toBeLessThan(400);
  });

  it("moves the crop window with the offset", async () => {
    const top = await processMenuImage(await sampleFile(900, 1600), { zoom: 1, offsetY: -1 });
    const bottom = await processMenuImage(await sampleFile(900, 1600), { zoom: 1, offsetY: 1 });
    expect(top.data.equals(bottom.data)).toBe(false);
  });

  it("clamps a zoom that would crop outside the source", async () => {
    await expect(processMenuImage(await sampleFile(), { zoom: 0.01, offsetY: 0 })).resolves.toBeTruthy();
    await expect(processMenuImage(await sampleFile(), { zoom: 99, offsetY: 0 })).resolves.toBeTruthy();
  });

  it("names the types it can decode and the size it accepts", () => {
    expect(isDecodableImageType("image/jpeg")).toBe(true);
    expect(isDecodableImageType("image/webp")).toBe(true);
    expect(isDecodableImageType("image/svg+xml")).toBe(false);
    expect(isDecodableImageType("application/pdf")).toBe(false);
    expect(MENU_IMAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
```

- [ ] **Step 3: Write the processor**

Create `lib/staff/menu-image.ts`. Model it on `renderDerivative` in `scripts/lib/image-pipeline.ts`, which is the archive's version of this and already gets the crop, the encode and the placeholder right. Differences:

- Input is an uploaded `File`, not a path under the archive.
- The crop window is the centred square adjusted by `zoom` and `offsetY`, rather than `squareWindow`'s fixed centre. `zoom` is a multiplier on the window's side length, clamped so the window stays inside the source. `offsetY` is -1 to 1, mapping to the window's full travel from top to bottom, clamped the same way.
- Treatment is always the tile square. There is no scene or mark path: those describe archive photography and an owner uploading a product photo is always uploading a tile.
- `flatten` onto the brand background, matching the pipeline, because an uploaded PNG with transparency otherwise renders on whatever is behind it.

Constants:

```ts
export const MENU_IMAGE_CONTENT_TYPE = "image/webp";
export const MENU_IMAGE_EXTENSION = "webp";
/** A year, matching next.config.ts. Safe because every upload gets a fresh path. */
export const MENU_IMAGE_CACHE_CONTROL = "31536000";
export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
```

Do not accept `image/svg+xml`. An SVG is a document that can carry script, and nothing here needs one.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/menu-image.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add the two actions**

`previewMenuItemImage(formData)` takes the file plus zoom and offset, runs `processMenuImage`, and returns a data URL. It writes nothing and touches no storage. It still checks `menu:configure`: image processing is real server work and is not offered to a session that cannot use it.

`uploadMenuItemImage(previous, formData)` checks the permission, validates size and type, processes, uploads to `${bucket}/${new Date().getUTCFullYear()}/${randomUUID()}.webp` with `upsert: false`, then calls `staff_set_menu_item_image` with the public URL and all four pieces of metadata, `treatment: "cutout"` and `source: "uploaded"`.

The path is fresh on every upload and is never overwritten. `next.config.ts` holds optimized menu images for a year, and its comment explains that this is only safe because a replacement always produces a new URL. Upserting in place would break that and leave a stale image cached for a year.

Note that the upload happens through the ordinary staff client. Supabase Storage has its own policies, separate from table RLS. Check whether the `menu` bucket's policies admit an `authenticated` insert; if they do not, this task needs a storage policy in a migration, and that is a finding to report before writing more code, not something to work around with a service role key.

- [ ] **Step 6: Write `ImageField.tsx`**

Current photo, a file input, a zoom range and a vertical offset range, a Preview button that calls `previewMenuItemImage` and swaps the shown image, and an Upload button that commits. Requirements:

- The preview is a real server crop, not a CSS transform. A CSS approximation is the thing that makes an owner upload three times before the photo is right.
- Ranges are labelled with `WorkspaceFieldLabel` and carry `aria-valuetext` in words ("zoomed in 20 percent"), because a bare number on a range tells a screen reader nothing.
- The upload button is disabled while pending and shows the spinner used elsewhere in the workspace.
- File size and type are checked client side for a fast message, and again on the server because a client check is a courtesy and not a boundary.

- [ ] **Step 7: Give options the same upload**

Nine wing flavours carry their own photography. It drives the flavour grid on `/menu` and it is what `previewImage()` in `lib/menu/preview.ts` swaps into the hero when a customer picks a flavour, so a flavour with no photo leaves a hole in both. The owner has to be able to change those without a developer for the same reason they have to be able to change a product photo.

Reuse everything: `processMenuImage` is unchanged, and `ImageField` takes a prop for which action to call rather than being copied.

- Add `uploadMenuOptionImage(previous, formData)` to `actions.ts`. Same permission check, same validation, same processing, same fresh path. It calls `staff_set_menu_option_image` from Task 5 with **six** arguments, not seven: `menu_options` has no `image_treatment` column.
- Give `ImageField` a discriminated prop, `target: { kind: "item"; itemId: string } | { kind: "option"; optionId: string }`, and pick the action from it. Do not fork the component.
- Render it inside each option row in `OptionGroupEditor.tsx`, collapsed behind a "Photo" disclosure. Nine flavours with photos and a dozen heat and dip options without would otherwise make that screen mostly empty image fields.
- The preview action is shared as written; it processes a file and returns a data URL and knows nothing about what the image is for.

- [ ] **Step 8: Verify in the browser, then run the full set and commit**

Upload a wide photograph to an item, confirm the preview crop changes as the offset moves, upload it, and confirm the storefront tile shows the new image with a blur placeholder while it loads. Then change a wing flavour's photo and confirm both the flavour grid and the product page hero pick it up.

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

```bash
git add lib/staff/menu-image.ts "app/(workspace)/workspace/menu" tests/unit/menu-image.test.ts next.config.ts scripts/ingest-legacy-images.ts
git commit -m "feat(menu): upload and crop product and flavour photographs"
```

---

## Task 12: The storefront picks up a new item

**Files:**
- Modify: `app/(marketing)/menu/[category]/page.tsx`
- Modify: `app/(marketing)/menu/[category]/[item]/page.tsx`
- Modify: `app/(workspace)/workspace/menu/actions.ts` (audit only, likely no change)

**Interfaces:** none new.

**The bug this fixes.** Both routes set `dynamicParams = false`, which means a path not returned by `generateStaticParams` is a 404. `generateStaticParams` runs at build. So a category or item created in the Workspace 404s on the storefront until somebody redeploys, which makes the whole feature useless for the thing it exists to do. Task 9's browser check will have already shown this.

**What changes and what does not.** `generateStaticParams` stays, so every seeded page is still prerendered at build and the common paths are as fast as they were. `dynamicParams` becomes `true`, so an unknown slug renders on demand instead of 404ing. `notFound()` inside the page still handles a slug that is genuinely not a category, which is what `dynamicParams = false` was doing for the `[category]` route and what the existing `if (!category) notFound()` already does.

Before editing, read `node_modules/next/dist/docs/` on `generateStaticParams` and `dynamicParams`. Do not write this from memory of Next 13 or 14.

- [ ] **Step 1: Confirm the failure first**

With the dev server running from Task 11, create a category and an item in the Workspace, then navigate to the new item's storefront URL. Record the 404. A fix whose failure you have not seen is a fix you cannot prove.

- [ ] **Step 2: Flip both routes**

In `app/(marketing)/menu/[category]/page.tsx`, replace:

```tsx
/** Nothing outside the catalog is a category, so an unknown slug is a 404. */
export const dynamicParams = false;
```

with:

```tsx
/**
 * An unknown slug renders on demand rather than 404ing at the edge, because the
 * menu is owner editable from the Workspace and a category created there would
 * otherwise be unreachable until the next deploy. generateStaticParams still
 * prerenders every category that exists at build. A slug that is genuinely not
 * a category still 404s, through the notFound() below.
 */
export const dynamicParams = true;
```

Make the same change in `[item]/page.tsx`, adjusting the wording to items. Confirm both pages already call `notFound()` for a slug they cannot resolve; if the item page does not, add it.

- [ ] **Step 3: Confirm the fix and check nothing else moved**

Reload the new item's URL: it renders. Then check that a genuinely invalid slug still 404s, and that a seeded category still serves fast.

- [ ] **Step 4: Audit the revalidation across every action**

Read `app/(workspace)/workspace/menu/actions.ts` end to end and confirm every exported action ends by calling `refreshMenu()`, and that `refreshMenu` names all four paths. This is the step where a missing revalidate is found, because by now every action exists. Fix anything missing here rather than in the task that introduced it.

- [ ] **Step 5: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

Pay attention to the build output: both routes should still report as prerendered with their seeded params, now as dynamic-capable rather than fully static.

```bash
git add "app/(marketing)/menu" "app/(workspace)/workspace/menu/actions.ts"
git commit -m "fix(menu): let the storefront render items created in the workspace"
```

---

## After the last task

**The migrations were applied on 2026-08-27.** Corrected that day: this line used to say `0051` through `0054` had never been run against a live database. `0051` through `0055` were applied to `nybb-staging` on the owner's instruction, which makes them forward-only. Nobody edits them now; a correction is a new file, which is what `0056_menu_management_corrections.sql` is. `0056` is written and deliberately not applied, because applying it is the owner's call the same way applying the first five was.

**Two things this plan deliberately leaves undone**, both recorded in section 12 of the design:

- The per price list override editor. `staff_set_option_variation_prices` raises rather than guessing the moment a second price list exists, which is the trigger.
- Reordering, entirely. Corrected 2026-08-27 by the whole-branch review: this line said "the screens use number fields", and no screen has one. Nothing this plan produced can change a `sort_order`, and nothing in the repository calls `staff_reorder_menu`. Ordering is whatever `sort_order` values the seed carries; a row created from the workspace appends at `max(sort_order) + 10` and stays there. `staff_reorder_menu` and its four SQL tests stay as they are, and `0056` revokes its `execute` grant until a screen calls it. See section 12 of the design.

**One finding to report if it surfaced.** Task 11 step 5 asks whether the storage bucket's policies admit an `authenticated` insert. If they do not, that needs a storage policy in `0055` and it is a separate piece of work, not a reason to reach for a service role key.

---

## Task 13: The storefront reads the branch the customer chose

Added 2026-08-25, during execution, from a Task 2 review finding. Not part of
the original twelve.

**Files:**
- Modify: `lib/menu/storefront.ts`
- Modify: `app/(marketing)/menu/page.tsx`
- Modify: `app/(marketing)/menu/[category]/page.tsx`
- Modify: `app/(marketing)/menu/[category]/[item]/page.tsx`
- Modify: `app/(marketing)/cart/page.tsx`
- Modify: `app/(marketing)/checkout/page.tsx`
- Test: `tests/unit/menu-reader.test.ts` (extend)

**Interfaces:** none new. `getStorefrontMenu(branchSlug?: string)` already takes
the argument; nothing passes it.

**Why this exists.** `place_order` resolves the branch from the slug in the
checkout payload, so it gates on the counter the customer actually chose.
`get_storefront_menu` is called with no argument at all twelve call sites, so
after Task 2 it resolves the active branch with the lowest `sort_order`. While
one branch trades those are the same counter and everything agrees. The day a
second branch goes live they diverge, and a customer who chose the second
branch is shown the first branch's availability and then refused at checkout.

That is the failure `place_order`'s section 7 comment names: a filter the menu
is missing refuses something a customer can see. Task 2 closed the version of
it that was live immediately; this closes the version that arrives with the
second branch.

**Why it was not folded into Task 2.** The menu routes use
`generateStaticParams`, so making the menu depend on a per customer store
selection changes what can be prerendered and what has to be resolved per
request. That is an architectural change to the storefront's caching, not a
line in a migration, and it deserves its own review.

**The selection already exists.** `getStoreSelection()` in
`lib/branches/selection` is already called by `app/(marketing)/menu/page.tsx`
alongside `getStorefrontMenu()`. The slug is sitting right there, unused.

**Before writing anything**, read `node_modules/next/dist/docs/` on caching and
`generateStaticParams`. A per customer value inside a statically generated
route is exactly the case the Next docs are worth reading for, and getting it
wrong caches one customer's branch for everyone.

**The decision this task has to make first**, and record in the spec: whether
the menu becomes per request for everyone, or stays static and resolves
availability on the client, or splits into a static shell plus a dynamic
availability fragment the way the item page already handles its ordering
notice. Present the options and take the smallest one that is correct.

- [ ] **Step 1: Write the failing test**

Extend `tests/unit/menu-reader.test.ts` to assert `getStorefrontMenu` forwards
a slug it is given, and forwards null when it is not, so the plumbing is pinned
before the call sites change.

- [ ] **Step 2: Decide the caching shape and record it**

Write the decision and its reasoning into the spec's section 7.1 residual note,
replacing that note. One short paragraph.

- [ ] **Step 3: Pass the chosen slug at the five buying call sites**

`/menu`, `/menu/[category]`, `/menu/[category]/[item]`, `/cart`, `/checkout`.
Leave `/about` and `/` alone: neither sells anything, and neither should pay
for a per customer read.

`app/actions/reorder.ts:74` also calls it. Reorder builds a cart against the
customer's selected store, so it takes the slug too.

- [ ] **Step 4: Verify in the browser**

Activate a second branch, hold an item at one of them, and confirm the menu
hides it for a customer who chose that branch and shows it for one who chose
the other. This is the assertion the whole task exists for.

- [ ] **Step 5: Run the full verification set and commit**

Run: `npm run typecheck && npm run lint && npx vitest run && npm run build`

Check the build output: whichever caching shape Step 2 chose, confirm the
routes report what that decision predicted.

```bash
git add "app/(marketing)" lib/menu/storefront.ts app/actions/reorder.ts tests/unit/menu-reader.test.ts
git commit -m "feat(menu): resolve storefront availability against the chosen branch"
```
