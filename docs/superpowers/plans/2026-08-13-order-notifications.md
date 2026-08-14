# Order Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify a customer in the Expo app when their order is ready, refused or cancelled, and notify staff on the counter tablet when a paid order lands.

**Architecture:** Reuse the three tables migration `0007` already created for this feature (`push_subscriptions`, `push_subscription_orders`, `notifications`) rather than adding any. Sends happen inline from the request that caused them, handed to `after()`, except the `pg_cron` expiry sweep, which has no request and therefore queues a `notifications` row that a cron route drains. Message text comes from the existing `statusCopy()` so the notification and the tracking screen cannot disagree.

**Tech Stack:** Next.js 16.2.11, TypeScript, Supabase Postgres, `web-push` (already a dependency), Expo push HTTP API, Vitest, PGlite for SQL tests.

**Spec:** `docs/superpowers/specs/2026-08-13-order-notifications-design.md`. Read it before Task 1.

## Global Constraints

- **No em dashes anywhere.** Not in code comments, commit messages, documentation or shipped UI copy. Use commas, periods or parentheses. This is `AGENTS.md` rule 4.
- **This is Next.js 16.** Middleware is `proxy.ts`, `params` is a Promise. Read `node_modules/next/dist/docs/` before touching routing or `after()`. Do not write Next 13/14/15 idioms from memory.
- **`npm run build` is part of the test loop, not just `npm test`.** A `"use server"` file may only export `async` functions. Exporting a constant or a type from an actions file passes type-checking and unit tests, then fails the build.
- **Migrations are forward-only.** Never edit an applied migration. `create or replace function` cannot amend a body in place, so a changed function is restated whole.
- **Revokes must name grantees explicitly.** `revoke ... from public` does nothing about Supabase's default privilege. Always `revoke ... from public, anon, authenticated;` then grant back by name. This is handoff trap 14 and it was invisible to 327 passing tests once already.
- **Never use `createAdminClient()` where a customer's identity matters.** It bypasses RLS and has no `auth.uid()`. Its legitimate callers here are the send side and the queue drain, neither of which acts on behalf of a customer.
- **Nothing ever logs a tracking token.** Not in an error path, not in a debug line.
- **A notification send must never fail the mutation that triggered it.** Catch and swallow, always.
- **Test count before starting: 564 passing in 46 files.** Every task must leave `npm test`, `npm run lint` and `npm run build` green.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/0037_staff_branch_access_shared.sql` | Extract `staff_can_access_branch(profile, branch)`; rewrite `current_staff_can_access_branch` to call it |
| `supabase/migrations/0038_push_registration.sql` | `transport` column, key constraint, two registration RPCs, `staff_push_targets`, grants |
| `supabase/migrations/0039_expiry_queues_notification.sql` | Expiry sweep also inserts a `notifications` row |
| `supabase/migrations/0040_payment_reconciliation_returns_order.sql` | `apply_paymongo_payment` returns the order id it reconciled |
| `supabase/migrations/0041_claim_queued_push_notifications.sql` | Atomic `for update skip locked` claim of queued rows, added during Task 8 |
| `supabase/migrations/0042_push_registration_owner_fallback.sql` | `register_customer_push_device` matches on `auth.uid()` as well as the token, added during Task 9 |
| `lib/push/payload.ts` | Order plus event to title, body, url, tag. Reads `statusCopy()` |
| `lib/push/vapid.ts` | 87-character key assertion |
| `lib/push/expo.ts` | Expo HTTP send, dead-token cleanup |
| `lib/push/web.ts` | `web-push` send, 404/410 cleanup |
| `lib/push/dispatch.ts` | Resolve recipients, pick transport, never throw. The only import for call sites |
| `lib/push/drain.ts` | Claim, send and mark `notifications` rows |
| `lib/customer/push.ts` | Framework-neutral customer registration service |
| `app/api/mobile/v1/orders/[shortCode]/push/route.ts` | Customer registration endpoint |
| `app/api/push/staff/subscribe/route.ts` | Staff registration endpoint |
| `instrumentation.ts` | Startup VAPID assertion |
| `public/sw.js` | Staff service worker |
| `app/manifest.ts` | Landscape-first installable workspace |
| `components/workspace/StaffPushOptIn.tsx` | Counter tablet opt-in button |
| `apps/customer/src/push/register.ts` | Expo permission and token registration |
| `apps/customer/src/push/deep-link.ts` | The `data.url` parser, split out so the test runner can load it |
| `lib/staff/push.ts` | Framework-neutral staff registration service, mirroring `lib/customer/push.ts` |
| `docs/push-device-test-checklist.md` | The cases only a real handset can answer |

### Defects in this plan, found while implementing it

Recorded here rather than silently corrected, per `AGENTS.md` rule 3. The plan governed and was
followed except where it was wrong, and each of these is a place it was wrong.

1. **Two migrations this table did not list.** `0041` and `0042` above were both written during
   implementation. `0041` because the drain needed an atomic claim the plan had not thought about;
   `0042` because of defect 4 below.
2. **Task 4's brief carried a stale copy of `statusCopy()`'s input type**, so the payload builder's
   type did not compile as written. Corrected during Task 4.
3. **Task 7's brief cited `0030` as the source of `apply_paymongo_payment`.** `0032` is its latest
   ancestor. Copying `0030` would have silently reverted immediate cancellation on payment failure.
   The implementer caught it and copied `0032`.
4. **Task 2's brief gave `register_customer_push_device` no `auth.uid()` fallback**, although both
   its siblings (`get_order_by_tracking` in `0014`, `customer_mark_order_arrived` in `0029`) have
   one. That made `lib/customer/push.ts`'s signed-in branch unreachable and would have failed
   silently the day account order history landed. Fixed by `0042` rather than by downgrading the
   documentation: the docs were describing the right behaviour and the database was wrong.
5. **Task 9's brief showed `readMobileBody` returning `error`** when the real shape returns
   `response`, and used a `bad_request` code that is not a `MobileErrorCode`. The implementer
   followed the real payment route instead.
6. **Task 7's brief said to return the order id on every path.** That makes a no-op reconciliation
   indistinguishable from a real one, so a redelivered webhook rings the counter twice. See the
   correction recorded against `0040` in the consolidated fix wave.
7. **Task 11's brief said to generate the icons from "the brand mark in `public/brand/`".** That
   directory holds one file, a script tagline lockup, and no mark. The icons come from the archive
   logo at `C:\dev\nybb-assets` instead, per `AGENTS.md` rule 5.
8. **Task 10's brief asked for a test that a notification tap opens the right order**, which was
   impossible as the module was structured: it imports two native modules the repository's test
   runner cannot load. Splitting `deep-link.ts` out made the test possible.

---

### Task 1: Shared branch access

The send side runs as `service_role` with no `auth.uid()`, so it cannot call `current_staff_can_access_branch()`. Extract the shared half rather than writing a second branch-access expression, which is exactly the divergence `0024` exists to prevent.

**Files:**
- Create: `supabase/migrations/0037_staff_branch_access_shared.sql`
- Test: `tests/sql/branch-access.test.ts`

**Interfaces:**
- Consumes: `profiles(id, role, is_active, branch_id)` from `0007`, `current_staff_can_access_branch(uuid)` from `0022`
- Produces: `staff_can_access_branch(p_profile_id uuid, p_branch_id uuid) returns boolean`, `security definer`, granted to `service_role` and `authenticated`

- [ ] **Step 1: Write the failing test**

Create `tests/sql/branch-access.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sql/branch-access.test.ts`
Expected: FAIL with `function staff_can_access_branch(unknown, unknown) does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0037_staff_branch_access_shared.sql`:

```sql
-- 0037_staff_branch_access_shared.sql
-- One definition of branch access, two callers.
--
-- 0022 wrote current_staff_can_access_branch() against auth.uid(). That is
-- correct for a policy, which always runs as somebody. It is unusable from the
-- notification sender, which runs as service_role on a pg_cron schedule with no
-- session at all. Writing a second branch check there would put the same
-- question in two places, which is the exact disagreement 0024 was written to
-- end: the rows a staff member can see and the alerts they receive must not be
-- able to part company.
--
-- So the shared half moves into staff_can_access_branch(profile, branch) and
-- the session function becomes a one-line caller.
--
-- current_staff_can_access_branch is restated whole because
-- `create or replace function` cannot amend a body in place. Diff it against
-- 0022 rather than reading it fresh, or a transcription slip reads as intent.

create or replace function staff_can_access_branch(
  p_profile_id uuid,
  p_branch_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and p.is_active
      and p.role in ('admin'::public.user_role, 'staff'::public.user_role)
      -- A null branch_id is business wide, not unknown. Same reading 0023
      -- established for audit_logs.
      and (p.branch_id is null or p.branch_id = p_branch_id)
  )
$$;

create or replace function current_staff_can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select public.staff_can_access_branch(auth.uid(), p_branch_id)
$$;

revoke execute on function staff_can_access_branch(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function current_staff_can_access_branch(uuid)
  from public, anon, authenticated;

-- authenticated needs the profile-scoped one too: a policy expression is
-- evaluated as the querying role, so the session wrapper calling it would fail
-- on the function rather than on the table. That is handoff gotcha 8.
grant execute on function staff_can_access_branch(uuid, uuid)
  to authenticated, service_role;
grant execute on function current_staff_can_access_branch(uuid) to authenticated;

comment on function staff_can_access_branch(uuid, uuid) is
  'Branch access for a named profile. The session wrapper and the notification '
  'sender both read this, so neither can drift from the other.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sql/branch-access.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Run the full suite, so a rewritten policy dependency cannot pass unnoticed**

Run: `npm test`
Expected: PASS. `tests/sql/audit-log.test.ts` and `tests/sql/staff-refunds.test.ts` both lean on branch scope, so a regression shows up there.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0037_staff_branch_access_shared.sql tests/sql/branch-access.test.ts
git commit -m "feat: give branch access one definition and two callers"
```

---

### Task 2: Push registration schema and functions

**Files:**
- Create: `supabase/migrations/0038_push_registration.sql`
- Test: `tests/sql/push-registration.test.ts`

**Interfaces:**
- Consumes: `push_subscriptions`, `push_subscription_orders` from `0007`; `current_staff_has_permission(text)` from `0022`; `staff_can_access_branch(uuid, uuid)` from Task 1
- Produces:
  - `register_customer_push_device(p_short_code text, p_tracking_token text, p_expo_token text, p_platform text) returns boolean`, granted to `anon`
  - `register_staff_push_subscription(p_endpoint text, p_p256dh text, p_auth_key text) returns boolean`, granted to `authenticated`
  - `staff_push_targets(p_branch_id uuid) returns table (endpoint text, p256dh text, auth_key text)`, granted to `service_role`
  - `push_subscriptions.transport` column, values `'web'` or `'expo'`

- [ ] **Step 1: Write the failing test**

Create `tests/sql/push-registration.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const MANAGER = "75000000-0000-4000-8000-000000000001";
const OTHER_BRANCH_STAFF = "75000000-0000-4000-8000-000000000002";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${MANAGER}', 'manager@example.com'),
      ('${OTHER_BRANCH_STAFF}', 'other@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'other', 'Other', 'Other', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${MANAGER}', 'staff', 'manager', 'Manager', b.id
    from branches b where b.slug = 'pilot';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${OTHER_BRANCH_STAFF}', 'staff', 'manager', 'Other', b.id
    from branches b where b.slug = 'other';
  `);
  return db;
}

async function addOrder(db: PGlite, code: string, branch = "pilot", status = "ready") {
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents
    )
    select '${code}', '${status}', b.id, b.price_list_id, '1357',
           'Customer', '09170000000', 32900
    from branches b where b.slug = '${branch}'
    returning id::text
  `);
}

async function tokenFor(db: PGlite, code: string) {
  return scalar<string>(db, `select tracking_token::text from orders where short_code = '${code}'`);
}

async function actAs(db: PGlite, id: string) {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select '${id}'::uuid $$;
  `);
}

describe("push_subscriptions transport", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("accepts a web row carrying both keys", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values ('staff', '${MANAGER}', 'web', 'https://push.example/a', 'key', 'auth')
    `);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });

  it("accepts an expo row carrying neither key", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, transport, endpoint)
      values ('customer', 'expo', 'ExponentPushToken[aaa]')
    `);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });

  it("rejects a web row missing its keys", async () => {
    await expect(db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint)
      values ('staff', '${MANAGER}', 'web', 'https://push.example/b')
    `)).rejects.toThrow();
  });

  it("rejects an expo row carrying keys it cannot have", async () => {
    await expect(db.exec(`
      insert into push_subscriptions (audience, transport, endpoint, p256dh, auth_key)
      values ('customer', 'expo', 'ExponentPushToken[bbb]', 'key', 'auth')
    `)).rejects.toThrow();
  });
});

describe("register_customer_push_device", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("registers a device against the order the token proves", async () => {
    await addOrder(db, "NY-AAA111");
    const token = await tokenFor(db, "NY-AAA111");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-AAA111', '${token}', 'ExponentPushToken[one]', 'ios'
      )
    `);
    expect(ok).toBe(true);
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where order_code = 'NY-AAA111'
    `)).toBe(1);
  });

  it("refuses a wrong tracking token", async () => {
    await addOrder(db, "NY-BBB222");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-BBB222', '00000000-0000-4000-8000-000000000000',
        'ExponentPushToken[two]', 'android'
      )
    `);
    expect(ok).toBe(false);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(0);
  });

  it("refuses a malformed token without raising", async () => {
    await addOrder(db, "NY-CCC333");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-CCC333', 'not-a-uuid', 'ExponentPushToken[three]', 'ios'
      )
    `);
    expect(ok).toBe(false);
  });

  it("refuses a terminal order, which has nothing left to announce", async () => {
    await addOrder(db, "NY-DDD444", "pilot", "claimed");
    const token = await tokenFor(db, "NY-DDD444");
    const ok = await scalar<boolean>(db, `
      select register_customer_push_device(
        'NY-DDD444', '${token}', 'ExponentPushToken[four]', 'ios'
      )
    `);
    expect(ok).toBe(false);
  });

  // The reference project's real bug: a returning customer had no live
  // registration for the new order, so background alerts never arrived.
  it("keeps one device row while following a second order", async () => {
    await addOrder(db, "NY-EEE555");
    await addOrder(db, "NY-FFF666");
    for (const code of ["NY-EEE555", "NY-FFF666"]) {
      const token = await tokenFor(db, code);
      await db.exec(`
        select register_customer_push_device(
          '${code}', '${token}', 'ExponentPushToken[same]', 'android'
        )
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(2);
  });

  it("is idempotent for the same device and order", async () => {
    await addOrder(db, "NY-GGG777");
    const token = await tokenFor(db, "NY-GGG777");
    for (let i = 0; i < 3; i += 1) {
      await db.exec(`
        select register_customer_push_device(
          'NY-GGG777', '${token}', 'ExponentPushToken[dup]', 'ios'
        )
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(1);
  });
});

describe("register_staff_push_subscription", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("registers a signed-in staff tablet", async () => {
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t1', 'key', 'auth')
    `);
    expect(ok).toBe(true);
    expect(await scalar<string>(db, `
      select profile_id::text from push_subscriptions where endpoint = 'https://push.example/t1'
    `)).toBe(MANAGER);
  });

  it("refuses a deactivated profile", async () => {
    await db.exec(`update profiles set is_active = false where id = '${MANAGER}'`);
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t2', 'key', 'auth')
    `);
    expect(ok).toBe(false);
  });

  it("refuses a staff member denied orders:view", async () => {
    await db.exec(`
      insert into staff_permission_overrides (profile_id, permission, granted)
      values ('${MANAGER}', 'orders:view', false)
    `);
    await actAs(db, MANAGER);
    const ok = await scalar<boolean>(db, `
      select register_staff_push_subscription('https://push.example/t3', 'key', 'auth')
    `);
    expect(ok).toBe(false);
  });

  it("updates rather than duplicating on re-registration", async () => {
    await actAs(db, MANAGER);
    for (let i = 0; i < 3; i += 1) {
      await db.exec(`
        select register_staff_push_subscription('https://push.example/t4', 'key', 'auth')
      `);
    }
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
  });
});

describe("staff_push_targets", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values
        ('staff', '${MANAGER}', 'web', 'https://push.example/pilot', 'k1', 'a1'),
        ('staff', '${OTHER_BRANCH_STAFF}', 'web', 'https://push.example/other', 'k2', 'a2')
    `);
  });

  it("returns the branch's staff and excludes another branch's", async () => {
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows.map((r) => r.endpoint)).toEqual(["https://push.example/pilot"]);
  });

  it("includes an unassigned profile, which is business wide", async () => {
    await db.exec(`update profiles set branch_id = null where id = '${OTHER_BRANCH_STAFF}'`);
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows.map((r) => r.endpoint).sort()).toEqual([
      "https://push.example/other",
      "https://push.example/pilot",
    ]);
  });

  it("drops a deactivated staff member immediately", async () => {
    await db.exec(`update profiles set is_active = false where id = '${MANAGER}'`);
    const rows = await db.query<{ endpoint: string }>(`
      select endpoint from staff_push_targets(
        (select id from branches where slug = 'pilot')
      )
    `);
    expect(rows.rows).toHaveLength(0);
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("exposes registration to the roles that need it and no others", async () => {
    const check = async (role: string, signature: string) =>
      scalar<boolean>(db, `select has_function_privilege('${role}', '${signature}', 'execute')`);

    expect(await check("anon", "register_customer_push_device(text, text, text, text)")).toBe(true);
    expect(await check("anon", "register_staff_push_subscription(text, text, text)")).toBe(false);
    expect(await check("anon", "staff_push_targets(uuid)")).toBe(false);
    expect(await check("authenticated", "staff_push_targets(uuid)")).toBe(false);
    expect(await check("service_role", "staff_push_targets(uuid)")).toBe(true);
  });

  it("leaves the three tables unreadable by anon and authenticated", async () => {
    for (const table of ["push_subscriptions", "push_subscription_orders", "notifications"]) {
      for (const role of ["anon", "authenticated"]) {
        expect(
          await scalar<boolean>(db, `select has_table_privilege('${role}', '${table}', 'select')`),
        ).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sql/push-registration.test.ts`
Expected: FAIL with `column "transport" of relation "push_subscriptions" does not exist`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0038_push_registration.sql`:

```sql
-- 0038_push_registration.sql
-- Registration for the two notification audiences.
--
-- No new tables. 0007 already created push_subscriptions and
-- push_subscription_orders for exactly this feature and nothing has written to
-- them since. The join table is the part worth keeping: it separates a device
-- from the orders that device is following, so a customer ordering twice in an
-- evening registers once and gains a row rather than registering again.
--
-- What 0007 could not know is that the customer half would stop being Web Push.
-- There is no customer web storefront now, so customers are notified in the
-- Expo app instead. An Expo push token is one string with no encryption keypair
-- of its own, so `transport` says which shape a row is and a check constraint
-- keeps the two from being mixed.

alter table push_subscriptions
  add column transport text not null default 'web'
    check (transport in ('web', 'expo'));

alter table push_subscriptions alter column p256dh drop not null;
alter table push_subscriptions alter column auth_key drop not null;

alter table push_subscriptions
  add constraint push_subscriptions_transport_keys check (
    (transport = 'web' and p256dh is not null and auth_key is not null)
    or (transport = 'expo' and p256dh is null and auth_key is null)
  );

comment on column push_subscriptions.transport is
  'web is a browser subscription with a keypair. expo is a native push token in '
  'endpoint, with no keypair, because Expo encrypts on its own leg.';

-- ---------------------------------------------------------------------------
-- Customer registration.
-- ---------------------------------------------------------------------------
--
-- The tracking token is checked here rather than in a route handler, for the
-- same reason get_order_by_tracking checks it here: one place decides who may
-- speak for an order. The cast is on the column so a malformed token is a miss
-- rather than a raise, which is the distinction 0014 refuses to blur.
create or replace function register_customer_push_device(
  p_short_code text,
  p_tracking_token text,
  p_expo_token text,
  p_platform text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_expo text := btrim(coalesce(p_expo_token, ''));
  v_status public.order_status;
begin
  if v_code = '' or v_token = '' or v_expo = '' then
    return false;
  end if;
  if p_platform not in ('ios', 'android') then
    return false;
  end if;

  select o.status into v_status
  from public.orders o
  where o.short_code = v_code
    and o.tracking_token::text = v_token;

  if not found then
    return false;
  end if;

  -- A collected, refused or cancelled order has nothing left to announce, and
  -- registering against one would leave a row that only ever gets swept.
  if v_status in (
    'claimed'::public.order_status,
    'rejected'::public.order_status,
    'cancelled'::public.order_status,
    'no_show'::public.order_status
  ) then
    return false;
  end if;

  insert into public.push_subscriptions (audience, transport, endpoint, last_seen_at)
  values ('customer', 'expo', v_expo, now())
  on conflict (endpoint) do update set last_seen_at = now();

  insert into public.push_subscription_orders (endpoint, order_code, last_seen_at)
  values (v_expo, v_code, now())
  on conflict (endpoint, order_code) do update set last_seen_at = now();

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff registration.
-- ---------------------------------------------------------------------------
create or replace function register_staff_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_key text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile uuid := auth.uid();
begin
  if v_profile is null then
    return false;
  end if;
  if coalesce(btrim(p_endpoint), '') = ''
     or coalesce(btrim(p_p256dh), '') = ''
     or coalesce(btrim(p_auth_key), '') = '' then
    return false;
  end if;

  -- orders:view is the right gate: being told an order exists is the same
  -- privilege as being allowed to see it. current_staff_has_permission is the
  -- resolver every policy reads, so this cannot drift from them.
  if not public.current_staff_has_permission('orders:view') then
    return false;
  end if;

  insert into public.push_subscriptions (
    audience, profile_id, transport, endpoint, p256dh, auth_key, last_seen_at
  )
  values ('staff', v_profile, 'web', p_endpoint, p_p256dh, p_auth_key, now())
  on conflict (endpoint) do update
    set profile_id = excluded.profile_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        last_seen_at = now();

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who to tell about a new order at a branch.
-- ---------------------------------------------------------------------------
create or replace function staff_push_targets(p_branch_id uuid)
returns table (endpoint text, p256dh text, auth_key text)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select s.endpoint, s.p256dh, s.auth_key
  from public.push_subscriptions s
  where s.audience = 'staff'
    and s.transport = 'web'
    and s.profile_id is not null
    and public.staff_can_access_branch(s.profile_id, p_branch_id)
$$;

-- ---------------------------------------------------------------------------
-- Grants. Naming anon and authenticated explicitly is not belt and braces:
-- Supabase ships a default privilege that `revoke from public` does not touch,
-- and 327 passing tests once failed to notice that every function in this
-- schema was callable by anon. Handoff trap 14.
-- ---------------------------------------------------------------------------
revoke execute on function
  register_customer_push_device(text, text, text, text) from public, anon, authenticated;
revoke execute on function
  register_staff_push_subscription(text, text, text) from public, anon, authenticated;
revoke execute on function
  staff_push_targets(uuid) from public, anon, authenticated;

grant execute on function
  register_customer_push_device(text, text, text, text) to anon, authenticated;
grant execute on function
  register_staff_push_subscription(text, text, text) to authenticated;
grant execute on function staff_push_targets(uuid) to service_role;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sql/push-registration.test.ts`
Expected: PASS, 18 tests

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS. `tests/sql/schema.test.ts` asserts the exposed function count, so update that expectation if it fails: three functions were added and only one is reachable by `anon`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0038_push_registration.sql tests/sql/push-registration.test.ts
git commit -m "feat: register a phone and a counter tablet for order alerts"
```

---

### Task 3: The expiry sweep queues a notification

**Files:**
- Create: `supabase/migrations/0039_expiry_queues_notification.sql`
- Test: `tests/sql/paymongo-payment-lifecycle.test.ts` (add a describe block)

**Interfaces:**
- Consumes: `expire_unpaid_online_orders()` from `0030`, `notifications` from `0007`
- Produces: a `notifications` row per expired order, `channel = 'push'`, `template = 'order_cancelled_expired'`, `target` the short code, `payload` carrying `order_id`

- [ ] **Step 1: Write the failing test**

Append to `tests/sql/paymongo-payment-lifecycle.test.ts`:

```typescript
describe("the expiry sweep queues a customer notification", () => {
  it("queues exactly one row per order it cancels", async () => {
    const db = await setupExpiredOrder();
    await db.exec(`select expire_unpaid_online_orders()`);

    const rows = await db.query<{ template: string; target: string; status: string }>(`
      select template, target, status from notifications
    `);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].template).toBe("order_cancelled_expired");
    expect(rows.rows[0].status).toBe("queued");
  });

  it("queues nothing when it cancels nothing", async () => {
    const db = await setupUnexpiredOrder();
    await db.exec(`select expire_unpaid_online_orders()`);
    expect(await scalar<number>(db, `select count(*)::int from notifications`)).toBe(0);
  });

  it("queues inside the cancelling transaction, so neither can happen alone", async () => {
    const db = await setupExpiredOrder();
    await db.exec(`select expire_unpaid_online_orders()`);
    const cancelled = await scalar<number>(
      db, `select count(*)::int from orders where status = 'cancelled'`,
    );
    const queued = await scalar<number>(db, `select count(*)::int from notifications`);
    expect(queued).toBe(cancelled);
  });
});
```

Reuse the file's existing helpers for building an expired and an unexpired order. If the file names them differently, use its names rather than introducing `setupExpiredOrder`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sql/paymongo-payment-lifecycle.test.ts`
Expected: FAIL, `expected length 1, received 0`

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0039_expiry_queues_notification.sql`. Copy the body of `expire_unpaid_online_orders()` from `0030` verbatim and add the insert immediately after the `update orders ... set status = 'cancelled'` statement, inside the loop:

```sql
-- 0039_expiry_queues_notification.sql
-- The one notification with nobody waiting for it.
--
-- Three of the four notification events happen because somebody made a request,
-- so the send can be attached to that request with after(). This one does not:
-- 0031 schedules the sweep inside Postgres on pg_cron, on purpose, so that
-- expiry does not depend on Vercel's cron limits or an HTTP round trip. That
-- decision is about whether orders get cancelled correctly, which outranks
-- whether a notification is convenient to send, so it stands and the send moves
-- instead.
--
-- So the sweep queues. `notifications` from 0007 is already the right table: it
-- carries status, attempts, sending_started_at and last_error, which is a more
-- complete queue than anything worth writing now.
--
-- The whole function body is restated because `create or replace function`
-- cannot amend one in place. Diff this against 0030 rather than reading it
-- fresh, or a transcription slip in the slot release or the paid-race guard
-- reads as intentional.

create or replace function expire_unpaid_online_orders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
-- [Copy the declare block and the entire body from 0030 lines 156 onward,
--  unchanged, then add the insert below immediately after the
--  `update orders set status = 'cancelled' ...` statement inside the loop.]
--
--    insert into notifications (channel, target, template, payload)
--    select 'push', o.short_code, 'order_cancelled_expired',
--           jsonb_build_object('order_id', o.id)
--    from orders o where o.id = v_order_id;
$$;
```

The implementer must open `supabase/migrations/0030_paymongo_payment_lifecycle.sql` at line 151 and copy the real body. Do not paraphrase it.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sql/paymongo-payment-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Diff the two function bodies by eye**

Run: `git show HEAD:supabase/migrations/0030_paymongo_payment_lifecycle.sql | sed -n '151,215p'` and read it beside the new file. Confirm the only difference is the added insert. A slip in the slot release or the paid-race guard would silently break refunds, and it would read as intentional to whoever finds it next.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0039_expiry_queues_notification.sql tests/sql/paymongo-payment-lifecycle.test.ts
git commit -m "feat: queue a notice when an unpaid order runs out of time"
```

---

### Task 4: The message builder

**Files:**
- Create: `lib/push/payload.ts`
- Test: `tests/unit/push-payload.test.ts`

**Interfaces:**
- Consumes: `statusCopy()` and `OrderStatus` from `lib/orders/status.ts` and `lib/orders/types.ts`
- Produces:
  ```typescript
  export type PushEvent = "ready" | "rejected" | "cancelled" | "staff_new_order";
  export type PushPayload = {
    title: string;
    body: string;
    url: string;
    tag: string;
    requireInteraction: boolean;
    renotify: boolean;
    vibrate: number[] | null;
  };
  export function customerPayload(order: CustomerPayloadOrder): PushPayload;
  export function staffPayload(order: StaffPayloadOrder): PushPayload;
  export type CustomerPayloadOrder = {
    shortCode: string;
    trackingToken: string;
    status: OrderStatus;
    timeline: { rejectedReason: string | null; cancelledReason: string | null };
    payment: { method: string; status: string } | null;
  };
  export type StaffPayloadOrder = {
    shortCode: string;
    branchShortName: string;
    itemCount: number;
    pickupStartsAt: string | null;
  };
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-payload.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { customerPayload, staffPayload } from "@/lib/push/payload";
import { statusCopy } from "@/lib/orders/status";

const base = {
  shortCode: "NY-ABC234",
  trackingToken: "11111111-1111-4111-8111-111111111111",
  timeline: { rejectedReason: null, cancelledReason: null },
  payment: { method: "qrph", status: "paid" },
};

describe("customerPayload", () => {
  it("says exactly what the tracking screen says, for ready", () => {
    const order = { ...base, status: "ready" as const };
    const payload = customerPayload(order);
    const copy = statusCopy(order);
    expect(payload.title).toBe(copy.title);
    expect(payload.body).toBe(copy.body);
  });

  it("carries the branch's own refusal reason rather than a generic line", () => {
    const order = {
      ...base,
      status: "rejected" as const,
      timeline: { rejectedReason: "out_of_stock", cancelledReason: null },
    };
    const payload = customerPayload(order);
    expect(payload.body).toBe(statusCopy(order).body);
    expect(payload.body).not.toContain("something went wrong");
  });

  it("distinguishes a timed-out payment from a failed one", () => {
    const timedOut = {
      ...base,
      status: "cancelled" as const,
      timeline: { rejectedReason: null, cancelledReason: "payment_timeout" },
      payment: { method: "qrph", status: "pending" },
    };
    const failed = {
      ...base,
      status: "cancelled" as const,
      timeline: { rejectedReason: null, cancelledReason: "payment_failed" },
      payment: { method: "qrph", status: "failed" },
    };
    expect(customerPayload(timedOut).body).not.toBe(customerPayload(failed).body);
  });

  it("links to the order with its tracking token", () => {
    const payload = customerPayload({ ...base, status: "ready" as const });
    expect(payload.url).toBe("/order/NY-ABC234?t=11111111-1111-4111-8111-111111111111");
  });

  it("tags on the short code so one order cannot stack on a lock screen", () => {
    expect(customerPayload({ ...base, status: "ready" as const }).tag).toBe("NY-ABC234");
  });

  it("makes ready the only one that demands attention", () => {
    const ready = customerPayload({ ...base, status: "ready" as const });
    const rejected = customerPayload({
      ...base,
      status: "rejected" as const,
      timeline: { rejectedReason: "out_of_stock", cancelledReason: null },
    });
    expect(ready.requireInteraction).toBe(true);
    expect(ready.renotify).toBe(true);
    expect(ready.vibrate).not.toBeNull();
    expect(rejected.requireInteraction).toBe(false);
  });
});

describe("staffPayload", () => {
  it("names the branch and the pickup window, because a counter reads it in a rush", () => {
    const payload = staffPayload({
      shortCode: "NY-ABC234",
      branchShortName: "Central Bloc",
      itemCount: 3,
      pickupStartsAt: "2026-08-13T12:30:00+08:00",
    });
    expect(payload.title).toContain("NY-ABC234");
    expect(payload.body).toContain("3");
    expect(payload.url).toBe("/workspace/orders");
    expect(payload.tag).toBe("NY-ABC234");
  });
});

// A tripwire, not a unit test. The value of reusing statusCopy() is that there
// is one voice talking to the customer, and the way that gets lost is somebody
// adding "a quick sentence" here rather than editing the copy file.
describe("the source itself", () => {
  it("contains no customer sentences of its own", () => {
    const source = readFileSync("lib/push/payload.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const sentences = code.match(/"[^"]{25,}"/g) ?? [];
    expect(sentences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-payload.test.ts`
Expected: FAIL, cannot resolve `@/lib/push/payload`

- [ ] **Step 3: Write the implementation**

Create `lib/push/payload.ts`:

```typescript
import { statusCopy } from "@/lib/orders/status";
import type { OrderStatus } from "@/lib/orders/types";

export type PushEvent = "ready" | "rejected" | "cancelled" | "staff_new_order";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[] | null;
};

export type CustomerPayloadOrder = {
  shortCode: string;
  trackingToken: string;
  status: OrderStatus;
  timeline: { rejectedReason: string | null; cancelledReason: string | null };
  payment: { method: string; status: string } | null;
};

export type StaffPayloadOrder = {
  shortCode: string;
  branchShortName: string;
  itemCount: number;
  pickupStartsAt: string | null;
};

/**
 * The customer's notification, in the tracking screen's own words.
 *
 * `statusCopy()` already decides what every status says, including the branch's
 * chosen refusal reason and the three different ways an order can be cancelled.
 * Writing a second sentence here would put two voices in front of one customer,
 * and they would drift the first time somebody edited one of them. This project
 * already refuses that for money; the same argument applies to a message that
 * lands on a stranger's lock screen.
 */
export function customerPayload(order: CustomerPayloadOrder): PushPayload {
  const copy = statusCopy(order);
  const isReady = order.status === "ready";

  return {
    title: copy.title,
    body: copy.body,
    url: `/order/${order.shortCode}?t=${order.trackingToken}`,
    // The short code, so a second notification about one order replaces the
    // first rather than stacking under it.
    tag: order.shortCode,
    // Ready is the only one the customer has to act on. Everything else is
    // information, and information that survives a swipe is a nuisance.
    requireInteraction: isReady,
    renotify: isReady,
    vibrate: isReady ? [120, 60, 120] : null,
  };
}

/**
 * The counter's notification.
 *
 * Deliberately not routed through `statusCopy()`: that writes to a customer
 * standing in a car park, and this is read by somebody behind a counter who
 * needs the code, the size and the window rather than reassurance.
 */
export function staffPayload(order: StaffPayloadOrder): PushPayload {
  const items = order.itemCount === 1 ? "1 item" : `${order.itemCount} items`;
  const window = order.pickupStartsAt
    ? new Date(order.pickupStartsAt).toLocaleTimeString("en-PH", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "Asia/Manila",
      })
    : null;

  return {
    title: `New order ${order.shortCode}`,
    body: window
      ? `${items}, pickup ${window}, ${order.branchShortName}`
      : `${items}, ${order.branchShortName}`,
    url: "/workspace/orders",
    tag: order.shortCode,
    requireInteraction: true,
    renotify: true,
    vibrate: [200, 100, 200],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/push-payload.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add lib/push/payload.ts tests/unit/push-payload.test.ts
git commit -m "feat: build alert text from the words the order screen already uses"
```

---

### Task 5: The two transports and the startup key check

**Files:**
- Create: `lib/push/vapid.ts`, `lib/push/expo.ts`, `lib/push/web.ts`
- Create: `instrumentation.ts`
- Test: `tests/unit/push-transports.test.ts`

**Interfaces:**
- Consumes: `PushPayload` from Task 4
- Produces:
  ```typescript
  // vapid.ts
  export function vapidConfigured(): boolean;
  export function assertVapidKey(key: string | undefined): void;
  // expo.ts
  export type ExpoTarget = { endpoint: string };
  export async function sendExpo(targets: ExpoTarget[], payload: PushPayload): Promise<string[]>;
  // web.ts
  export type WebTarget = { endpoint: string; p256dh: string; auth_key: string };
  export async function sendWeb(targets: WebTarget[], payload: PushPayload): Promise<string[]>;
  ```
  Both `send*` resolve to the endpoints that are dead and should be deleted. Neither ever rejects.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-transports.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertVapidKey } from "@/lib/push/vapid";
import { sendExpo } from "@/lib/push/expo";

const payload = {
  title: "Ready for collection",
  body: "It is up and waiting at the counter.",
  url: "/order/NY-ABC234?t=token",
  tag: "NY-ABC234",
  requireInteraction: true,
  renotify: true,
  vibrate: [120, 60, 120],
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("assertVapidKey", () => {
  // A wrong key makes the opt-in button vanish with no error anywhere, which is
  // why spec section 15 makes this a hard rule rather than a nicety.
  it("accepts an 87 character key", () => {
    expect(() => assertVapidKey("k".repeat(87))).not.toThrow();
  });

  it("throws loudly on any other length", () => {
    expect(() => assertVapidKey("k".repeat(86))).toThrow(/87/);
    expect(() => assertVapidKey("")).toThrow(/87/);
  });

  it("says nothing when the key is absent, because that is a feature being off", () => {
    expect(() => assertVapidKey(undefined)).not.toThrow();
  });
});

describe("sendExpo", () => {
  it("reports a dead token so its row can be deleted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ status: "error", details: { error: "DeviceNotRegistered" } }],
    }), { status: 200 })));

    const dead = await sendExpo([{ endpoint: "ExponentPushToken[gone]" }], payload);
    expect(dead).toEqual(["ExponentPushToken[gone]"]);
  });

  it("reports nothing dead on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      data: [{ status: "ok", id: "receipt-1" }],
    }), { status: 200 })));

    expect(await sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).toEqual([]);
  });

  it("reports nothing dead on a server error, because a 500 is not a verdict", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    expect(await sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).toEqual([]);
  });

  it("never rejects when the network is gone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("ECONNRESET");
    }));
    await expect(sendExpo([{ endpoint: "ExponentPushToken[live]" }], payload)).resolves.toEqual([]);
  });

  it("sends nothing and calls nothing for an empty target list", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendExpo([], payload)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-transports.test.ts`
Expected: FAIL, cannot resolve `@/lib/push/vapid`

- [ ] **Step 3: Write `lib/push/vapid.ts`**

```typescript
/**
 * The 87 character assertion, which spec section 15 makes a hard rule.
 *
 * A VAPID public key that is the wrong length does not produce an error. The
 * browser's `PushManager.subscribe()` rejects, the opt-in button catches it and
 * disappears, and there is nothing in any log to say why. So this shouts at
 * startup instead, where somebody is looking.
 *
 * An absent key is not an error: it means push is not configured in this
 * environment, which is the correct state for a test run.
 */
const VAPID_PUBLIC_KEY_LENGTH = 87;

export function assertVapidKey(key: string | undefined): void {
  if (key === undefined || key === "") return;
  if (key.length !== VAPID_PUBLIC_KEY_LENGTH) {
    throw new Error(
      `NEXT_PUBLIC_VAPID_PUBLIC_KEY must be ${VAPID_PUBLIC_KEY_LENGTH} characters, ` +
        `got ${key.length}. Staff push opt-in will fail silently until this is fixed.`,
    );
  }
}

export function vapidConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}
```

- [ ] **Step 4: Write `instrumentation.ts` at the repository root**

```typescript
import { assertVapidKey } from "@/lib/push/vapid";

/**
 * Runs once per server start. The VAPID length check lives here because the
 * failure it catches is invisible everywhere else.
 */
export function register() {
  try {
    assertVapidKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  } catch (error) {
    console.error("[push]", error instanceof Error ? error.message : error);
  }
}
```

- [ ] **Step 5: Write `lib/push/expo.ts`**

```typescript
import "server-only";
import type { PushPayload } from "./payload";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export type ExpoTarget = { endpoint: string };

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

/**
 * Expo's push relay, which forwards to FCM on Android and APNs on iOS.
 *
 * Resolves to the tokens Expo says are dead, for the caller to delete. It never
 * rejects: a notification failing must not fail the order that triggered it, and
 * this is the last place that could still throw into a mutation.
 *
 * A 500 from Expo is deliberately not a verdict on any token. Treating it as one
 * would delete live registrations during an outage and silently stop notifying
 * customers who did nothing wrong.
 */
export async function sendExpo(
  targets: ExpoTarget[],
  payload: PushPayload,
): Promise<string[]> {
  if (targets.length === 0) return [];

  const dead: string[] = [];

  for (let i = 0; i < targets.length; i += EXPO_BATCH_SIZE) {
    const batch = targets.slice(i, i + EXPO_BATCH_SIZE);
    const messages = batch.map((target) => ({
      to: target.endpoint,
      title: payload.title,
      body: payload.body,
      data: { url: payload.url },
      sound: "default",
      priority: "high",
      channelId: "orders",
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(messages),
      });
      if (!response.ok) continue;

      const parsed = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = parsed.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") {
          const target = batch[index];
          if (target) dead.push(target.endpoint);
        }
      });
    } catch (error) {
      // Logged without the payload, which carries a tracking token.
      console.error(
        "[push] expo send failed",
        error instanceof Error ? error.message : "unknown",
      );
    }
  }

  return dead;
}
```

- [ ] **Step 6: Write `lib/push/web.ts`**

```typescript
import "server-only";
import webpush from "web-push";
import type { PushPayload } from "./payload";
import { vapidConfigured } from "./vapid";

export type WebTarget = { endpoint: string; p256dh: string; auth_key: string };

let configured = false;

function configure(): boolean {
  if (!vapidConfigured()) return false;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    );
    configured = true;
  }
  return true;
}

/**
 * Web Push to the counter tablet.
 *
 * Resolves to the endpoints that are gone for good, for the caller to delete.
 * 404 and 410 are the push service saying a subscription no longer exists;
 * everything else, including a 500, is a transient failure and deletes nothing.
 *
 * `urgency: high` and a short TTL matter here. Mobile push services throttle
 * anything they read as background traffic, and a new order alert that arrives
 * ten minutes late has told the counter nothing it did not already know.
 */
export async function sendWeb(
  targets: WebTarget[],
  payload: PushPayload,
): Promise<string[]> {
  if (targets.length === 0 || !configure()) return [];

  const dead: string[] = [];
  const body = JSON.stringify(payload);

  await Promise.all(
    targets.map(async (target) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: target.endpoint,
            keys: { p256dh: target.p256dh, auth: target.auth_key },
          },
          body,
          { urgency: "high", TTL: 600 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(target.endpoint);
          return;
        }
        console.error("[push] web send failed", status ?? "unknown");
      }
    }),
  );

  return dead;
}
```

- [ ] **Step 7: Run tests and the build**

Run: `npx vitest run tests/unit/push-transports.test.ts && npm run build`
Expected: PASS. The build matters: `instrumentation.ts` is a new root file and a bad import path there fails only here.

- [ ] **Step 8: Commit**

```bash
git add lib/push/vapid.ts lib/push/expo.ts lib/push/web.ts instrumentation.ts tests/unit/push-transports.test.ts
git commit -m "feat: add the two notification transports and a startup key check"
```

---

### Task 6: The dispatcher

**Files:**
- Create: `lib/push/dispatch.ts`
- Test: `tests/unit/push-dispatch.test.ts`

**Interfaces:**
- Consumes: `customerPayload`, `staffPayload` from Task 4; `sendExpo`, `sendWeb` from Task 5; `createAdminClient`, `adminConfigured` from `lib/supabase/admin-client`; `staff_push_targets` from Task 2
- Produces:
  ```typescript
  export async function notifyCustomer(orderId: string): Promise<void>;
  export async function notifyStaffOfNewOrder(orderId: string): Promise<void>;
  ```
  Both always resolve. Neither ever rejects.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-dispatch.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";

const sendExpo = vi.fn(async () => [] as string[]);
const sendWeb = vi.fn(async () => [] as string[]);
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/push/expo", () => ({ sendExpo }));
vi.mock("@/lib/push/web", () => ({ sendWeb }));
vi.mock("@/lib/supabase/admin-client", () => ({
  adminConfigured: () => true,
  createAdminClient: () => ({ rpc, from }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("notifyCustomer", () => {
  it("resolves rather than throwing when the lookup fails", async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: new Error("down") }) }) }),
    });
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    await expect(notifyCustomer("11111111-1111-4111-8111-111111111111")).resolves.toBeUndefined();
    expect(sendExpo).not.toHaveBeenCalled();
  });

  it("resolves rather than throwing when the transport throws", async () => {
    sendExpo.mockRejectedValueOnce(new Error("boom"));
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    await expect(notifyCustomer("11111111-1111-4111-8111-111111111111")).resolves.toBeUndefined();
  });
});

describe("notifyStaffOfNewOrder", () => {
  it("resolves rather than throwing when staff_push_targets fails", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("denied") });
    const { notifyStaffOfNewOrder } = await import("@/lib/push/dispatch");
    await expect(
      notifyStaffOfNewOrder("11111111-1111-4111-8111-111111111111"),
    ).resolves.toBeUndefined();
    expect(sendWeb).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-dispatch.test.ts`
Expected: FAIL, cannot resolve `@/lib/push/dispatch`

- [ ] **Step 3: Write the implementation**

Create `lib/push/dispatch.ts`. It reads the order, builds the payload, resolves targets, sends, and deletes what came back dead. Both exported functions wrap their whole body in a try/catch that logs and returns.

Key requirements the implementer must satisfy:
- `notifyCustomer` selects `short_code, tracking_token, status, rejected_reason, cancelled_reason` from `orders` plus the payment method and status, joins `push_subscription_orders` on the short code for `transport = 'expo'` endpoints, and calls `sendExpo`.
- `notifyStaffOfNewOrder` selects `short_code, branch_id` and the item count, calls `rpc("staff_push_targets", { p_branch_id })`, and calls `sendWeb`.
- Dead endpoints are deleted from `push_subscriptions` by endpoint. The cascade on `push_subscription_orders` removes the follow rows.
- **Never log the payload or the url.** Both carry a tracking token.
- Use `createAdminClient()`. This is one of its legitimate callers: it acts for the system, not on behalf of a customer.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/push-dispatch.test.ts`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add lib/push/dispatch.ts tests/unit/push-dispatch.test.ts
git commit -m "feat: resolve who to notify and send it, without ever throwing"
```

---

### Task 7: Wire the four live trigger points

**Files:**
- Create: `supabase/migrations/0040_payment_reconciliation_returns_order.sql`
- Modify: `app/(workspace)/workspace/orders/actions.ts` (in `setStatus`, and in `rejectOrder`)
- Modify: `app/api/paymongo/webhook/route.ts`
- Modify: `lib/customer/payment.ts` (in `settleMockPayment`)
- Test: `tests/unit/push-triggers.test.ts`, `tests/sql/paymongo-payment-lifecycle.test.ts`

**Interfaces:**
- Consumes: `notifyCustomer`, `notifyStaffOfNewOrder` from Task 6
- Produces: `apply_paymongo_payment(text, text, text, jsonb) returns uuid`, the reconciled order id, or null when the intent matched nothing

**Why the migration is here rather than in Task 3.** `apply_paymongo_payment` currently `returns void` (`0030` line 102). The webhook therefore knows an order was paid for and does not know which one. Reading it back with a second query would be a second lookup keyed on data the first call already had in hand, and it would race the very transaction that just committed. Returning the id is one word in the signature and one `return` in the body.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-triggers.test.ts` asserting, by reading the source files, that each trigger site imports `after` from `next/server` and calls it with a notify function. This is a source-level tripwire in the same spirit as `tests/unit/content-security-policy.test.ts`, because the failure it catches is invisible until a customer is not told their food is ready.

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("the notification trigger points", () => {
  it("marks ready and refuses through after()", () => {
    const source = read("app/(workspace)/workspace/orders/actions.ts");
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
    expect(source).toContain("notifyCustomer");
  });

  it("tells the counter from the paid webhook", () => {
    const source = read("app/api/paymongo/webhook/route.ts");
    expect(source).toContain("notifyStaffOfNewOrder");
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
  });

  it("tells the counter from the mock payment rail too", () => {
    const source = read("lib/customer/payment.ts");
    expect(source).toContain("notifyStaffOfNewOrder");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-triggers.test.ts`
Expected: FAIL on all three

- [ ] **Step 3: Wire `setStatus` and `rejectOrder`**

In `app/(workspace)/workspace/orders/actions.ts`, add `import { after } from "next/server";` and `import { notifyCustomer } from "@/lib/push/dispatch";`. In `setStatus`, after the successful RPC and before `revalidatePath`, add:

```typescript
  // Only ready is worth a customer's lock screen. Preparing and claimed are
  // both things they either already know or are standing there for.
  if (status === "ready") {
    after(notifyCustomer(parsedId.data));
  }
```

In `rejectOrder`, after the successful RPC:

```typescript
  after(notifyCustomer(parsedId.data));
```

- [ ] **Step 4: Make the reconciliation say which order it reconciled**

Create `supabase/migrations/0040_payment_reconciliation_returns_order.sql`. Copy the body of `apply_paymongo_payment` from `0030` line 96 verbatim, change `returns void` to `returns uuid`, and return the order id on every path (null where the intent matched nothing). The whole body is restated because `create or replace function` cannot amend one in place, so diff it against `0030` rather than reading it fresh.

Add to `tests/sql/paymongo-payment-lifecycle.test.ts`:

```typescript
it("says which order it reconciled, so the counter can be told about it", async () => {
  const db = await setupPendingOnlineOrder();
  const orderId = await scalar<string>(db, `select id::text from orders limit 1`);
  const returned = await scalar<string>(db, `
    select apply_paymongo_payment('pi_test', 'paid', 'pay_test', '{}'::jsonb)::text
  `);
  expect(returned).toBe(orderId);
});

it("returns null when the intent matches nothing", async () => {
  const db = await freshDatabase();
  const returned = await scalar<string | null>(db, `
    select apply_paymongo_payment('pi_missing', 'paid', 'pay_x', '{}'::jsonb)::text
  `);
  expect(returned).toBeNull();
});
```

Run: `npx vitest run tests/sql/paymongo-payment-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Wire the webhook**

In `app/api/paymongo/webhook/route.ts`, add `import { after } from "next/server";` and `import { notifyCustomer, notifyStaffOfNewOrder } from "@/lib/push/dispatch";`. Capture the returned order id from the `apply_paymongo_payment` call, which now comes back in `data`.

After a successful reconciliation:

```typescript
  // The counter hears about an order when it is paid for, not when it is
  // placed. Under payment first an unpaid order is not on the board at all, so
  // pinging at place_order would ring the tablet for orders that never arrive.
  if (status === "paid" && orderId) after(notifyStaffOfNewOrder(orderId));
  if (status === "failed" && orderId) after(notifyCustomer(orderId));
```

- [ ] **Step 6: Wire the mock rail**

In `lib/customer/payment.ts`, in `settleMockPayment`, capture the order id the RPC now returns and call `notifyStaffOfNewOrder(orderId)`. The mock rail is reached from a Server Action and from `app/api/mobile/v1/orders/[shortCode]/payment/mock/route.ts`, both of which have a request in flight, so hand the promise to `after()` at those two call sites rather than awaiting it inside the service. The service returning the id keeps it framework-neutral, which is the whole point of `lib/customer/`.

- [ ] **Step 7: Run the tests and the build**

Run: `npm test && npm run lint && npm run build`
Expected: PASS. The build is not optional here: `actions.ts` is a `"use server"` file and may only export async functions.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0040_payment_reconciliation_returns_order.sql "app/(workspace)/workspace/orders/actions.ts" app/api/paymongo/webhook/route.ts lib/customer/payment.ts "app/api/mobile/v1/orders/[shortCode]/payment/mock/route.ts" tests/unit/push-triggers.test.ts tests/sql/paymongo-payment-lifecycle.test.ts
git commit -m "feat: send the alert from the four moments that cause one"
```

---

### Task 8: Drain the queue

**Files:**
- Create: `lib/push/drain.ts`
- Modify: `app/api/cron/expire-orders/route.ts`
- Test: `tests/unit/push-drain.test.ts`

**Interfaces:**
- Consumes: `notifications` table, `notifyCustomer` from Task 6
- Produces: `export async function drainPushQueue(limit?: number): Promise<{ sent: number; failed: number }>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-drain.test.ts` covering: a queued row is marked `sent`, a row whose send fails is marked `failed` with `last_error` set and `attempts` incremented, a row already `sending` is not claimed, and the function resolves when the database is unreachable. Mock `@/lib/supabase/admin-client` as in Task 6.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-drain.test.ts`
Expected: FAIL, cannot resolve `@/lib/push/drain`

- [ ] **Step 3: Write `lib/push/drain.ts`**

Claim rows by updating `status` from `queued` to `sending` with `sending_started_at = now()` and returning them, so two concurrent drains cannot send the same row twice. For each claimed row, look up `payload->>'order_id'` and call `notifyCustomer`. Mark `sent` with `sent_at`, or `failed` with `last_error` and `attempts = attempts + 1`. Default `limit` to 50.

- [ ] **Step 4: Call it from the cron route**

In `app/api/cron/expire-orders/route.ts`, after the sweep returns, drain the queue and include the counts in the response:

```typescript
  const drained = await drainPushQueue();
  return Response.json(
    { expired: data, ...drained },
    { headers: { "Cache-Control": "no-store" } },
  );
```

The sweep itself still runs on `pg_cron` every five minutes. This route stays the drain, and the response now says what it drained so a manual run is legible.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/push/drain.ts app/api/cron/expire-orders/route.ts tests/unit/push-drain.test.ts
git commit -m "feat: drain the queued notices the expiry sweep leaves behind"
```

---

### Task 9: Customer registration endpoint

**Files:**
- Create: `lib/customer/push.ts`
- Create: `app/api/mobile/v1/orders/[shortCode]/push/route.ts`
- Modify: `docs/mobile-api-contract.md`
- Test: `tests/unit/push-registration-route.test.ts`

**Interfaces:**
- Consumes: `register_customer_push_device` from Task 2; `mobileCaller`, `mobileOk`, `mobileError`, `trackingToken`, `readMobileBody` from `lib/mobile/http`
- Produces: `export async function registerPushDevice(input: unknown, caller: CustomerCaller): Promise<{ ok: true } | { ok: false; error: string }>`

Follow `lib/customer/arrival.ts` exactly as the shape to copy: `import "server-only"`, a zod schema, `supabaseConfigured()` guard, a public client when a tracking token is present, one RPC call, one friendly failure string, and no logging of the token.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/push-registration-route.test.ts` covering: a valid body and token returns ok, a missing tracking token is refused, a platform other than `ios` or `android` is refused, a body over `MAX_MOBILE_BODY_BYTES` is refused, and the tracking token never appears in a `console.error` call. Mock the Supabase client as the other mobile tests in `tests/unit/mobile-api.test.ts` do.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/push-registration-route.test.ts`
Expected: FAIL

- [ ] **Step 3: Write the service and the route**

`lib/customer/push.ts` mirrors `lib/customer/arrival.ts`. The route mirrors `app/api/mobile/v1/orders/[shortCode]/arrival/route.ts`:

```typescript
import { registerPushDevice } from "@/lib/customer/push";
import { mobileCaller, mobileError, mobileOk, readMobileBody, trackingToken } from "@/lib/mobile/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Registering a phone to be told about one order.
 *
 * The token is checked in the database, by the same rule get_order_by_tracking
 * uses, so this route decides nothing about who may speak for an order.
 */
export async function POST(request: Request, context: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await context.params;
  const body = await readMobileBody(request);
  if (!body.ok) return mobileError("bad_request", body.error);

  const result = await registerPushDevice(
    { shortCode, trackingToken: trackingToken(request.headers), ...(body.data as object) },
    mobileCaller(request),
  );

  return result.ok ? mobileOk({ registered: true }) : mobileError("conflict", result.error);
}
```

Check `readMobileBody`'s actual return shape in `lib/mobile/http.ts:133` and match it rather than copying the above blind.

- [ ] **Step 4: Document the endpoint**

Add it to `docs/mobile-api-contract.md` next to the `arrival` and `payment` entries, with the request body, the headers and the failure codes. The document is the contract the app is written against, so an undocumented endpoint is a divergence.

- [ ] **Step 5: Run tests and build**

Run: `npm test && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/customer/push.ts "app/api/mobile/v1/orders/[shortCode]/push/route.ts" docs/mobile-api-contract.md tests/unit/push-registration-route.test.ts
git commit -m "feat: let a phone register itself for one order's alerts"
```

---

### Task 10: Register the device in the app

**Files:**
- Create: `apps/customer/src/push/register.ts`
- Modify: `apps/customer/src/screens/OrderScreen.tsx`
- Modify: `apps/customer/src/api/client.ts`
- Modify: `apps/customer/package.json`, `apps/customer/app.json`

**Interfaces:**
- Consumes: the endpoint from Task 9
- Produces: `export async function registerForOrder(shortCode: string, trackingToken: string): Promise<void>`

- [ ] **Step 1: Add the dependency**

```bash
cd apps/customer && npx expo install expo-notifications expo-device
```

Add `"expo-notifications"` to the `plugins` array in `apps/customer/app.json` alongside `expo-secure-store`.

- [ ] **Step 2: Write `apps/customer/src/push/register.ts`**

It must:
- Return early on a simulator (`expo-device`'s `isDevice` is false), because there is no token to get.
- Request permission only when the order screen is showing a live order, never on launch. Spec section 15.
- When permission is already granted, register silently on every mount for the **current** order, with no prompt. This is the reference project's real bug: a customer who opted in last week has no live registration for this week's order, so background alerts never arrive.
- Create the Android notification channel named `orders` with high importance, matching the `channelId` in `lib/push/expo.ts`. Without it Android delivers silently.
- Swallow every error. A phone that cannot register still has a working order screen.

- [ ] **Step 3: Call it from `OrderScreen`**

On mount and whenever the order's short code changes, call `registerForOrder(shortCode, trackingToken)`. Do not block the render on it and do not show a spinner for it.

- [ ] **Step 4: Handle a tapped notification**

Add a response listener that reads `data.url` and navigates to that order. Test that tapping a notification for a different order than the one on screen moves to the right one.

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/customer && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/customer
git commit -m "feat: ask for notification permission once the order is real"
```

---

### Task 11: The counter tablet opt-in

**Files:**
- Create: `public/sw.js`, `public/icon-192.png`, `public/badge.png`
- Create: `app/manifest.ts`
- Create: `components/workspace/StaffPushOptIn.tsx`
- Create: `app/api/push/staff/subscribe/route.ts`
- Modify: `app/(workspace)/workspace/orders/page.tsx`
- Modify: `next.config.ts` (no-cache headers for `/sw.js`)

- [ ] **Step 1: Generate the icons**

The notification icon must **not** be `/icon.png`. `app/icon.png` owns that route and is cropped tight for a browser tab. Generate `public/icon-192.png` (192x192) and `public/badge.png` (96x96, monochrome) from the brand mark in `public/brand/`.

- [ ] **Step 2: Write `public/sw.js`**

Handle `push` by calling `showNotification` with the payload's title, body, tag, `requireInteraction`, `renotify`, `vibrate`, `icon: "/icon-192.png"` and `badge: "/badge.png"`. Handle `notificationclick` by focusing an existing workspace tab if one is open and opening `data.url` otherwise.

- [ ] **Step 3: Serve the worker uncached**

In `next.config.ts`, add a headers entry for `/sw.js` with `Cache-Control: no-cache, no-store, must-revalidate`. A cached worker outlives a deploy and keeps running old code.

- [ ] **Step 4: Write `app/manifest.ts`**

`display: "standalone"`, `orientation: "landscape"`, `start_url: "/workspace/orders"`, the brand colours already in `app/globals.css`, and the icons from step 1. Spec section 8.3 asks for the landscape-first manifest and Android is the platform that can honour the orientation lock.

- [ ] **Step 5: Write the subscribe route and the component**

The route calls `register_staff_push_subscription` through `createStaffClient()`, not the admin client: this is a staff member acting as themselves and the database check reads `auth.uid()`.

The component registers `/sw.js` with `scope: "/"` and `updateViaCache: "none"`, requests permission on tap only, subscribes with the VAPID public key, POSTs the result, and shows the error rather than disappearing when subscription fails. A button that vanishes is the exact failure the 87-character assertion exists to make legible, so do not reintroduce it in the UI.

Use `components/ui/Button.tsx`. Do not hand-roll a control.

- [ ] **Step 6: Mount it on the orders board**

Add the component to `app/(workspace)/workspace/orders/page.tsx`, visible only to a staff member holding `orders:view`.

- [ ] **Step 7: Run the full loop**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 8: Verify in a browser against the production build**

Do not judge this from `next dev`. Start the production build on port 3001 per handoff trap 16, open `/workspace/orders` in Chromium, sign in inside the pane (trap 18), tap the opt-in, and confirm the subscription row appears. Check the console for CSP violations: `worker-src 'self' blob:` and `manifest-src 'self'` are already in the policy, so a violation means something else is wrong.

- [ ] **Step 9: Commit**

```bash
git add public/sw.js public/icon-192.png public/badge.png app/manifest.ts components/workspace/StaffPushOptIn.tsx app/api/push/staff/subscribe/route.ts "app/(workspace)/workspace/orders/page.tsx" next.config.ts
git commit -m "feat: let the counter tablet ask to be told about new orders"
```

---

### Task 12: Documents and the device checklist

**Files:**
- Modify: `docs/mobile-app-transition.md`
- Modify: `docs/IMPLEMENTATION-PROMPT.md` (sections 15 and 27)
- Modify: `README.md`, `docs/HANDOFF.md`
- Create: `docs/push-device-test-checklist.md`

- [ ] **Step 1: Correct the transition document**

It currently says the web storefront is retained through the pilot with removal to be approved later. That approval happened on 2026-08-13. Say so, and say what follows: the storefront pages, the browser cart, the browser checkout and the customer tracking page are destined for deletion rather than maintenance.

- [ ] **Step 2: Correct spec sections 15 and 27**

Section 15 says Web Push for both audiences. Record that the customer half is now native, why, and that the staff half stays Web Push until a native staff app exists. Section 15 also lists only `ready` for customers; add `rejected` and `cancelled` with the reason (both events postdate that sentence).

Per `AGENTS.md` rule 3, this is a correction to the spec rather than a silent divergence, so write what changed and why, not just the new state.

- [ ] **Step 3: Write the device checklist**

`docs/push-device-test-checklist.md` covers what no test run can: locked Android, locked iPhone, app killed rather than backgrounded, tapping through to the correct order, two devices on one order, permission revoked mid-order, and the counter tablet with the workspace closed. Record the four external prerequisites (Expo project id, FCM key, APNs key, a real build) and note that the Apple Developer membership is on the critical path for iPhone customers ordering at all, not only for notifying them.

- [ ] **Step 4: Update the status documents**

`README.md` and `docs/HANDOFF.md` both carry a live status and a test count. Update the count, note that migrations now run to `0042` (the plan said `0040`, before `0041` and `0042` were written), and add what a future session needs: that `push_subscriptions` predates this work by thirty-one migrations, that the send side is the only caller of `staff_can_access_branch` outside a policy, and that the expiry sweep is the one event that queues.

- [ ] **Step 5: Run the full loop one last time**

Run: `npm test && npm run lint && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add docs README.md
git commit -m "docs: record the notification design and correct the transition plan"
```

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task: the schema reuse and the three migrations to Tasks 1 to 3, the send side to Tasks 4 to 6, the trigger table to Task 7, the queue drain to Task 8, customer registration to Tasks 9 and 10, staff registration to Task 11, and the external dependencies plus the "what this does not build" list to Task 12. The four items the spec deliberately excludes (customer Web Push, email, no-show, retry) have no task, which is correct.

**One thing the plan discovered that the spec did not settle.** `apply_paymongo_payment` `returns void` (`0030` line 102), so the webhook knows an order was paid for without knowing which one. The spec assumed the trigger point was reachable as written. It is not, and Task 7 now opens with migration `0040` to fix it. This is the kind of gap that only shows up when the plan has to name a variable.

**Type consistency.** `PushPayload` is defined once in Task 4 and consumed unchanged by Tasks 5, 6 and 11. `sendExpo` and `sendWeb` both resolve to `string[]` of dead endpoints. `notifyCustomer` and `notifyStaffOfNewOrder` both return `Promise<void>` and are the only imports Task 7 uses. The `channelId: "orders"` in `lib/push/expo.ts` matches the Android channel name Task 10 creates, which is a real coupling: get it wrong and Android delivers silently.
