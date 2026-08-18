# Customer Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify a customer on their own phone when their order becomes ready, is refused, or is cancelled, over Web Push, replacing the Expo path deleted with the mobile app.

**Architecture:** Six of the seven pieces mirror the staff push path that already works. A new `SECURITY DEFINER` RPC authorizes a browser subscription against an order the way `0042` does, a service and route hand it over, a client control on the tracking page mints it, and the dispatch and drain that were deleted come back pointed at `sendWeb` instead of the deleted `sendExpo`.

**Tech Stack:** Next.js 16.2.11, TypeScript, Supabase Postgres, `web-push` (already a dependency), Vitest, PGlite for SQL tests.

**Spec:** `docs/superpowers/specs/2026-08-18-customer-web-push-design.md`. Read it before Task 1.

## Global Constraints

- **No em dashes anywhere.** Not in code comments, commit messages, documentation or UI copy. Use commas, periods or parentheses. (`AGENTS.md` rule 4.)
- **This is Next.js 16.** Middleware is `proxy.ts`. Before writing anything touching routing, caching, Server Actions, `after()` or image handling, read `node_modules/next/dist/docs/`. Do not write Next 13/14/15 idioms from memory. (`AGENTS.md` rule 1.)
- **`npm run build` is part of the test loop**, not just `tsc`. React Server Component boundary errors appear only there. A `"use server"` file may only export `async` functions.
- **The full loop is** `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`. All four must be green before a task is done.
- **`C:\dev\zombeans-web` is read-only.** Never write to it, never run its migrations, never start its dev server.
- **Migrations are forward-only.** Never edit an applied migration. `0045` and `0046` are applied to production; `0047` will not be until somebody says so.
- **A notification must never fail the mutation that triggered it.** Wrap and swallow. (Spec section 15.)
- **Anything sent after the response goes to `after()` as an awaitable promise.** A detached promise is killed mid-flight on Vercel.
- **Never log a tracking token, a push subscription key, or an endpoint.** Log the failure, never the credential.

---

### Task 1: Migration 0047, the customer subscription RPC

**Files:**
- Create: `supabase/migrations/0047_customer_web_push_registration.sql`
- Create: `tests/sql/customer-push-registration.test.ts`
- Modify: `tests/sql/schema.test.ts:63` (add `"0047"` to the contiguous-numbering list)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: SQL function `register_customer_push_subscription(p_short_code text, p_tracking_token text, p_endpoint text, p_p256dh text, p_auth_key text) returns boolean`, granted to `anon` and `authenticated`.

- [ ] **Step 1: Write the failing SQL test**

Create `tests/sql/customer-push-registration.test.ts`. The setup helpers are copied from `tests/sql/push-registration.test.ts` rather than imported, matching how that file stands alone.

```typescript
import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDatabase, scalar } from "./harness";

const STAFF = "76000000-0000-4000-8000-000000000001";
const CUSTOMER = "76000000-0000-4000-8000-000000000002";
const OTHER_CUSTOMER = "76000000-0000-4000-8000-000000000003";

const ENDPOINT = "https://push.example/customer-a";
const P256DH = "p256dh-key";
const AUTH = "auth-key";

async function setup() {
  const db = await freshDatabase();
  await db.exec(`
    insert into auth.users (id, email) values
      ('${STAFF}', 'staff@example.com'),
      ('${CUSTOMER}', 'customer@example.com'),
      ('${OTHER_CUSTOMER}', 'other@example.com');
    insert into price_lists (slug, name) values ('standard', 'Standard');
    insert into branches (slug, name, short_name, format, price_list_id, address_line, city)
    select 'pilot', 'Pilot', 'Pilot', 'street', id, 'Road', 'Cebu City'
    from price_lists where slug = 'standard';
    insert into profiles (id, role, staff_role, display_name, branch_id)
    select '${STAFF}', 'staff', 'manager', 'Manager', b.id
    from branches b where b.slug = 'pilot';
  `);
  return db;
}

let pickupCodeCounter = 2000;

async function addOrder(db: PGlite, code: string, status = "ready", userId: string | null = null) {
  pickupCodeCounter += 1;
  return scalar<string>(db, `
    insert into orders (
      short_code, status, branch_id, price_list_id, pickup_code,
      customer_name, customer_phone, total_cents, user_id
    )
    select '${code}', '${status}', b.id, b.price_list_id, '${pickupCodeCounter}',
           'Customer', '09170000000', 32900, ${userId ? `'${userId}'` : "null"}
    from branches b where b.slug = 'pilot'
    returning id::text
  `);
}

async function tokenFor(db: PGlite, code: string) {
  return scalar<string>(db, `select tracking_token::text from orders where short_code = '${code}'`);
}

async function actAs(db: PGlite, id: string | null) {
  await db.exec(`
    create or replace function auth.uid()
    returns uuid language sql stable as $$ select ${id ? `'${id}'::uuid` : "null::uuid"} $$;
  `);
}

async function register(
  db: PGlite,
  code: string,
  token: string | null,
  endpoint = ENDPOINT,
) {
  return scalar<boolean>(db, `
    select register_customer_push_subscription(
      '${code}', ${token ? `'${token}'` : "null"}, '${endpoint}', '${P256DH}', '${AUTH}'
    )
  `);
}

describe("register_customer_push_subscription", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
    await actAs(db, null);
  });

  it("registers a web subscription against the order the token proves", async () => {
    await addOrder(db, "NY-CWP001");
    expect(await register(db, "NY-CWP001", await tokenFor(db, "NY-CWP001"))).toBe(true);
    expect(await scalar<string>(db, `
      select transport from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("web");
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where order_code = 'NY-CWP001'
    `)).toBe(1);
  });

  it("refuses a wrong tracking token", async () => {
    await addOrder(db, "NY-CWP002");
    const wrong = "11111111-1111-4111-8111-111111111111";
    expect(await register(db, "NY-CWP002", wrong)).toBe(false);
  });

  it("refuses a malformed token without raising", async () => {
    await addOrder(db, "NY-CWP003");
    expect(await register(db, "NY-CWP003", "not-a-uuid")).toBe(false);
  });

  it("registers a signed-in owner carrying no token at all", async () => {
    await addOrder(db, "NY-CWP004", "ready", CUSTOMER);
    await actAs(db, CUSTOMER);
    expect(await register(db, "NY-CWP004", null)).toBe(true);
  });

  it("refuses a signed-in caller who neither owns the order nor holds a token", async () => {
    await addOrder(db, "NY-CWP005", "ready", CUSTOMER);
    await actAs(db, OTHER_CUSTOMER);
    expect(await register(db, "NY-CWP005", null)).toBe(false);
  });

  it("refuses a terminal order, which has nothing left to announce", async () => {
    await addOrder(db, "NY-CWP006", "claimed");
    expect(await register(db, "NY-CWP006", await tokenFor(db, "NY-CWP006"))).toBe(false);
  });

  it("is idempotent for the same device and order", async () => {
    await addOrder(db, "NY-CWP007");
    const token = await tokenFor(db, "NY-CWP007");
    expect(await register(db, "NY-CWP007", token)).toBe(true);
    expect(await register(db, "NY-CWP007", token)).toBe(true);
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(1);
  });

  it("keeps one device row while following a second order", async () => {
    await addOrder(db, "NY-CWP008");
    await addOrder(db, "NY-CWP009");
    await register(db, "NY-CWP008", await tokenFor(db, "NY-CWP008"));
    await register(db, "NY-CWP009", await tokenFor(db, "NY-CWP009"));
    expect(await scalar<number>(db, `select count(*)::int from push_subscriptions`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from push_subscription_orders`)).toBe(2);
  });

  // THE CASE THIS FUNCTION EXISTS TO PREVENT. push_subscriptions is unique on
  // endpoint, and 0038's customer insert upserts blindly, so a staff member
  // opening their own order on the counter tablet would flip that tablet's row
  // to audience = 'customer'. staff_push_targets filters on audience = 'staff',
  // so the tablet would go quiet with nothing anywhere saying why.
  it("refuses an endpoint that already belongs to staff, and leaves that row intact", async () => {
    await db.exec(`
      insert into push_subscriptions (audience, profile_id, transport, endpoint, p256dh, auth_key)
      values ('staff', '${STAFF}', 'web', '${ENDPOINT}', 'staff-key', 'staff-auth')
    `);
    await addOrder(db, "NY-CWP010");

    expect(await register(db, "NY-CWP010", await tokenFor(db, "NY-CWP010"))).toBe(false);

    expect(await scalar<string>(db, `
      select audience from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("staff");
    expect(await scalar<string>(db, `
      select p256dh from push_subscriptions where endpoint = '${ENDPOINT}'
    `)).toBe("staff-key");
    expect(await scalar<number>(db, `
      select count(*)::int from push_subscription_orders where endpoint = '${ENDPOINT}'
    `)).toBe(0);
  });
});

describe("the grant boundary", () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await setup();
  });

  it("is callable by anon and authenticated, and by nobody else", async () => {
    const grantees = await db.query<{ grantee: string }>(`
      select grantee from information_schema.role_routine_grants
      where routine_name = 'register_customer_push_subscription'
      order by grantee
    `);
    const names = grantees.rows.map((row) => row.grantee).filter((n) => n !== "postgres");
    expect(names.sort()).toEqual(["anon", "authenticated"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/sql/customer-push-registration.test.ts`
Expected: FAIL. Postgres reports `function register_customer_push_subscription(...) does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0047_customer_web_push_registration.sql`:

```sql
-- 0047_customer_web_push_registration.sql
-- The customer half of notifications, on Web Push this time.
--
-- 0038 registered a customer device as an Expo push token, because the plan
-- then was a native app. The app was dropped on 2026-08-17 and its route went
-- with it, which left register_customer_push_device applied and unreachable.
-- This is its Web Push sibling: same authorization, different row shape.
--
-- The authorization is copied from 0042 deliberately rather than re-derived.
-- The tracking token authorizes, or the caller being the signed-in owner does,
-- the cast stays on the column so a malformed token is a miss rather than a
-- raise, and a terminal order is refused because it has nothing to announce.
-- Every refusal is the same false: the difference between them is worth
-- something to whoever is probing this.
--
-- WHAT IS NEW HERE, AND WHY IT IS NOT PARANOIA.
-- ===========================================================================
-- push_subscriptions is unique on endpoint and 0038's customer insert ends
-- `on conflict (endpoint) do update`. Until now no browser could call the
-- customer function, so that upsert could never meet a staff row. A browser
-- path makes it reachable: a staff member who opens their own order on the
-- counter tablet would rewrite that tablet's row to audience = 'customer'.
-- staff_push_targets filters on audience = 'staff', so the tablet would stop
-- being told about new orders, silently, on the one device the business cannot
-- afford to have go quiet. This function refuses a foreign endpoint instead.

create or replace function register_customer_push_subscription(
  p_short_code text,
  p_tracking_token text,
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
  v_code text := upper(btrim(coalesce(p_short_code, '')));
  v_token text := lower(btrim(coalesce(p_tracking_token, '')));
  v_endpoint text := btrim(coalesce(p_endpoint, ''));
  v_p256dh text := btrim(coalesce(p_p256dh, ''));
  v_auth text := btrim(coalesce(p_auth_key, ''));
  v_status public.order_status;
begin
  -- An empty token is not refused here. A signed-in owner with no token is a
  -- legitimate caller, and the lookup below gives an empty or malformed token
  -- a plain miss rather than a match. Both keys are required, because 0038's
  -- check constraint requires them for a web row.
  if v_code = '' or v_endpoint = '' or v_p256dh = '' or v_auth = '' then
    return false;
  end if;

  -- Refuse before touching the order: an endpoint already registered to
  -- another audience is not this customer's device to claim.
  if exists (
    select 1 from public.push_subscriptions s
    where s.endpoint = v_endpoint and s.audience <> 'customer'
  ) then
    return false;
  end if;

  select o.status into v_status
  from public.orders o
  where o.short_code = v_code
    and (
      o.tracking_token::text = v_token
      or (auth.uid() is not null and o.user_id = auth.uid())
    );

  if not found then
    return false;
  end if;

  if v_status in (
    'claimed'::public.order_status,
    'rejected'::public.order_status,
    'cancelled'::public.order_status,
    'no_show'::public.order_status
  ) then
    return false;
  end if;

  -- profile_id stays null: push_subscriptions_audience_target (0007) requires
  -- it to be null for a customer row.
  insert into public.push_subscriptions (
    audience, transport, endpoint, p256dh, auth_key, last_seen_at
  )
  values ('customer', 'web', v_endpoint, v_p256dh, v_auth, now())
  on conflict (endpoint) do update
    set p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        last_seen_at = now();

  insert into public.push_subscription_orders (endpoint, order_code, last_seen_at)
  values (v_endpoint, v_code, now())
  on conflict (endpoint, order_code) do update set last_seen_at = now();

  return true;
end;
$$;

comment on function register_customer_push_subscription(text, text, text, text, text) is
  'Registers a browser push subscription against one order for its tracking-token '
  'holder or signed-in owner. Refuses an endpoint owned by another audience. '
  'Refusals are deliberately indistinguishable.';

-- Naming anon and authenticated explicitly is not belt and braces. Supabase
-- ships a default privilege that `revoke from public` does not touch, and 327
-- passing tests once failed to notice every function here was callable by
-- anon. Handoff trap 14.
revoke execute on function
  register_customer_push_subscription(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function
  register_customer_push_subscription(text, text, text, text, text)
  to anon, authenticated;
```

- [ ] **Step 4: Add 0047 to the schema test's migration list**

In `tests/sql/schema.test.ts`, in the `are numbered contiguously from 0001` test, add `"0047",` immediately after `"0046",`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/sql/customer-push-registration.test.ts tests/sql/schema.test.ts`
Expected: PASS, all cases including the staff-endpoint guard.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0047_customer_web_push_registration.sql tests/sql/customer-push-registration.test.ts tests/sql/schema.test.ts
git commit -m "feat: register a customer's browser for one order's alerts"
```

---

### Task 2: The registration service

**Files:**
- Create: `lib/customer/push.ts`
- Create: `tests/unit/customer-push.test.ts`

**Interfaces:**
- Consumes: `register_customer_push_subscription` from Task 1. `CustomerCaller` and `callerClient` from `lib/customer/caller.ts`.
- Produces: `customerSubscriptionSchema`, `registerCustomerSubscription(input: unknown, caller: CustomerCaller): Promise<CustomerSubscriptionResult>` where `CustomerSubscriptionResult = { ok: true } | { ok: false; error: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/customer-push.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The registration service, with a mocked RPC rather than a database.
 *
 * The database decides who may register (tests/sql/customer-push-registration
 * .test.ts covers that). What is worth asserting here is what this file does
 * on its own: that it flattens the browser's nested keys into the shape the
 * function takes, and that neither the subscription keys nor the tracking
 * token reach a log line.
 */

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/public-client", () => ({
  supabaseConfigured: () => true,
  createPublicClient: () => ({ rpc: mocks.rpc }),
}));

import { registerCustomerSubscription } from "@/lib/customer/push";
import { guestCaller } from "@/lib/customer/caller";

const TOKEN = "6f1b4f7c-1f6a-4e37-9f0e-9b0c2b3f5a11";
const ENDPOINT = "https://push.example/abc";
const P256DH = "p256dh-secret-value";
const AUTH = "auth-secret-value";

// The shape a browser actually sends: PushSubscription.toJSON() nests the keys
// and adds an expirationTime nothing here wants.
function browserBody() {
  return {
    shortCode: "NY-ABC234",
    trackingToken: TOKEN,
    subscription: {
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: P256DH, auth: AUTH },
    },
  };
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe("registerCustomerSubscription", () => {
  it("flattens the browser's nested keys into the arguments the function takes", async () => {
    const result = await registerCustomerSubscription(browserBody(), guestCaller());

    expect(result).toEqual({ ok: true });
    expect(mocks.rpc).toHaveBeenCalledWith("register_customer_push_subscription", {
      p_short_code: "NY-ABC234",
      p_tracking_token: TOKEN,
      p_endpoint: ENDPOINT,
      p_p256dh: P256DH,
      p_auth_key: AUTH,
    });
  });

  it("refuses a body whose keys sit at the top level rather than under keys", async () => {
    const flat = {
      shortCode: "NY-ABC234",
      trackingToken: TOKEN,
      subscription: { endpoint: ENDPOINT, p256dh: P256DH, auth: AUTH },
    };
    const result = await registerCustomerSubscription(flat, guestCaller());

    expect(result.ok).toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("treats the function returning false as a refusal", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const result = await registerCustomerSubscription(browserBody(), guestCaller());
    expect(result.ok).toBe(false);
  });

  it("never logs the subscription keys or the tracking token", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    await registerCustomerSubscription(browserBody(), guestCaller());

    const logged = spy.mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
    expect(logged).not.toContain(P256DH);
    expect(logged).not.toContain(AUTH);
    expect(logged).not.toContain(TOKEN);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/customer-push.test.ts`
Expected: FAIL. `Cannot find module '@/lib/customer/push'`.

- [ ] **Step 3: Write the service**

Create `lib/customer/push.ts`:

```typescript
import "server-only";
import { z } from "zod";
import { normalizeShortCode, normalizeTrackingToken } from "@/lib/orders/tracking";
import { createPublicClient, supabaseConfigured } from "@/lib/supabase/public-client";
import { callerClient, type CustomerCaller } from "./caller";

const unavailable = "We could not turn on alerts for this order. Please try again.";

/**
 * The shape a browser actually sends, which is not the shape it is convenient
 * to write down.
 *
 * `PushSubscription.toJSON()` nests the two keys under `keys`, alongside an
 * `expirationTime` nothing here wants. `lib/staff/push.ts` learned this the
 * expensive way: its first schema expected the keys at the top level, which is
 * the shape the DATABASE function takes, and it passed a unit test written to
 * the same assumption while refusing every real subscription with a 409 that
 * named no cause. The browser's serialization is the contract; flattening
 * happens below.
 */
export const customerSubscriptionSchema = z.object({
  shortCode: z.string().max(64),
  trackingToken: z.string().max(128).nullable().optional(),
  subscription: z.object({
    endpoint: z.url().max(512),
    keys: z.object({
      p256dh: z.string().min(1).max(255),
      auth: z.string().min(1).max(255),
    }),
  }),
});

export type CustomerSubscriptionResult = { ok: true } | { ok: false; error: string };

/**
 * A customer's browser asking to be told about the order it is looking at.
 *
 * The input is a reference and a device credential, never order data.
 * `register_customer_push_subscription` (0047) repeats the tracking-token and
 * owner checks `get_order_by_tracking` uses, refuses a terminal order, refuses
 * an endpoint that belongs to another audience, and folds a repeat
 * registration into the same row. So this function decides nothing about who
 * may speak for an order and can be called again safely.
 *
 * Nothing is logged but the failure itself. The tracking token opens somebody
 * else's order and the two keys are what let anyone send to that device.
 */
export async function registerCustomerSubscription(
  input: unknown,
  caller: CustomerCaller,
): Promise<CustomerSubscriptionResult> {
  const parsed = customerSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    // Which fields, never their values. `issues` names paths and constraints,
    // and without this line a shape mismatch is a refusal with no cause
    // anywhere, which is exactly how the staff nested-keys bug reached a
    // browser.
    console.error("[push] customer subscription body rejected", parsed.error.issues);
    return { ok: false, error: unavailable };
  }
  if (!supabaseConfigured()) return { ok: false, error: unavailable };

  const shortCode = normalizeShortCode(parsed.data.shortCode);
  const trackingToken = normalizeTrackingToken(parsed.data.trackingToken ?? null);
  if (!shortCode) return { ok: false, error: unavailable };

  // A tracking token authorizes on its own. Without one, use whichever identity
  // the caller brought, the same rule signalArrival follows.
  const supabase = trackingToken ? createPublicClient() : await callerClient(caller);
  const { data, error } = await supabase.rpc("register_customer_push_subscription", {
    p_short_code: shortCode,
    p_tracking_token: trackingToken,
    p_endpoint: parsed.data.subscription.endpoint,
    p_p256dh: parsed.data.subscription.keys.p256dh,
    p_auth_key: parsed.data.subscription.keys.auth,
  });

  if (error) {
    console.error(`[push] customer subscription failed for ${shortCode}: ${error.message}`);
    return { ok: false, error: unavailable };
  }
  if (data !== true) return { ok: false, error: unavailable };

  return { ok: true };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/customer-push.test.ts && npm run typecheck`
Expected: PASS, and a clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add lib/customer/push.ts tests/unit/customer-push.test.ts
git commit -m "feat: accept a customer browser subscription for one order"
```

---

### Task 3: The subscribe route

**Files:**
- Create: `app/api/push/customer/subscribe/route.ts`
- Create: `tests/unit/customer-push-route.test.ts`

**Interfaces:**
- Consumes: `registerCustomerSubscription` from Task 2. `cookieCaller` from `lib/customer/cookie-caller.ts`.
- Produces: `POST(request: Request): Promise<Response>` at `/api/push/customer/subscribe`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/customer-push-route.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route, with the service mocked. It decides nothing, and that is the
 * property under test: a malformed body is refused before anything else, and
 * every refusal from the service becomes one shape of answer.
 */

const mocks = vi.hoisted(() => ({ register: vi.fn() }));

vi.mock("@/lib/customer/push", () => ({
  registerCustomerSubscription: (input: unknown, caller: unknown) =>
    mocks.register(input, caller),
}));
vi.mock("@/lib/customer/cookie-caller", () => ({
  cookieCaller: async () => ({ address: null, identity: async () => null }),
}));

import { POST } from "@/app/api/push/customer/subscribe/route";

function post(body: string): Request {
  return new Request("https://nybb.test/api/push/customer/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

beforeEach(() => {
  mocks.register.mockReset();
});

describe("POST /api/push/customer/subscribe", () => {
  it("answers 200 when the service accepts", async () => {
    mocks.register.mockResolvedValue({ ok: true });
    const response = await POST(post(JSON.stringify({ any: "shape" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ registered: true });
  });

  it("answers 400 for a body that is not JSON, without calling the service", async () => {
    const response = await POST(post("{not json"));
    expect(response.status).toBe(400);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("answers 409 with the service's sentence when it refuses", async () => {
    mocks.register.mockResolvedValue({ ok: false, error: "Nope." });
    const response = await POST(post(JSON.stringify({ any: "shape" })));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Nope." });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/customer-push-route.test.ts`
Expected: FAIL. `Cannot find module '@/app/api/push/customer/subscribe/route'`.

- [ ] **Step 3: Write the route**

Create `app/api/push/customer/subscribe/route.ts`:

```typescript
import { registerCustomerSubscription } from "@/lib/customer/push";
import { cookieCaller } from "@/lib/customer/cookie-caller";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A customer's browser handing over the subscription it just minted.
 *
 * This route decides nothing. `register_customer_push_subscription` (0047)
 * repeats the tracking-token and owner checks the order page already goes
 * through, so a wrong token, an order that is finished, and an endpoint
 * belonging to the counter tablet are all refused by the database rather than
 * by anything written here.
 *
 * One shape of failure for every cause, deliberately. A browser cannot act on
 * the difference between them, and the difference is worth something to
 * whoever is probing this endpoint.
 *
 * The caller comes from cookies so a signed-in owner works without a tracking
 * token, exactly as the arrival signal does.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "We could not read that." }, { status: 400 });
  }

  const result = await registerCustomerSubscription(body, await cookieCaller());
  return result.ok
    ? Response.json({ registered: true })
    : Response.json({ error: result.error }, { status: 409 });
}
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run tests/unit/customer-push-route.test.ts && npm run build`
Expected: PASS, and the build shows `/api/push/customer/subscribe` in the route table.

- [ ] **Step 5: Commit**

```bash
git add app/api/push/customer/subscribe/route.ts tests/unit/customer-push-route.test.ts
git commit -m "feat: give a customer browser somewhere to hand its subscription"
```

---

### Task 4: The customer payload, and telling the worker who it is for

**Files:**
- Modify: `lib/push/payload.ts`
- Modify: `tests/unit/push-payload.test.ts`

**Interfaces:**
- Consumes: `statusCopy` from `lib/orders/status.ts`, `OrderStatus` and `TrackedOrder` from `lib/orders/types.ts`.
- Produces: `PushPayload` gains `audience: "customer" | "staff"`. New exports `customerPayload(order: CustomerPayloadOrder): PushPayload` and type `CustomerPayloadOrder = { shortCode: string; trackingToken: string; status: OrderStatus; timeline: TrackedOrder["timeline"]; payment: TrackedOrder["payment"] }`. `staffPayload` keeps its signature and gains `audience: "staff"` in its return.

- [ ] **Step 1: Write the failing test**

Replace the contents of `tests/unit/push-payload.test.ts` with:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { customerPayload, staffPayload, type CustomerPayloadOrder } from "@/lib/push/payload";
import * as statusModule from "@/lib/orders/status";
import { statusCopy } from "@/lib/orders/status";

/**
 * The full timeline, not the two fields these assertions read. `statusCopy()`
 * is handed the whole object and is free to read any stamp on it, so a fixture
 * carrying only two of them stops representing a real order the moment
 * somebody uses another stamp to decide what a notification says.
 */
const emptyTimeline: CustomerPayloadOrder["timeline"] = {
  acceptedAt: null,
  preparingAt: null,
  readyAt: null,
  claimedAt: null,
  rejectedAt: null,
  rejectedReason: null,
  cancelledAt: null,
  cancelledReason: null,
  customerArrivedAt: null,
  noShowAt: null,
};

const base = {
  shortCode: "NY-ABC234",
  trackingToken: "11111111-1111-4111-8111-111111111111",
  timeline: emptyTimeline,
  payment: { method: "qrph", status: "paid", amountCents: 45000, paidAt: null },
};

describe("customerPayload", () => {
  it("asks the tracking screen for the words rather than reproducing them", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    const spy = vi.spyOn(statusModule, "statusCopy");
    customerPayload(order);
    expect(spy).toHaveBeenCalledWith(order);
    spy.mockRestore();
  });

  it("says exactly what the tracking screen says, for ready", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    const copy = statusCopy(order);
    const payload = customerPayload(order);
    expect(payload.title).toBe(copy.title);
    expect(payload.body).toBe(copy.body);
  });

  it("links to the order with its tracking token", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).url).toBe(
      "/order/NY-ABC234?t=11111111-1111-4111-8111-111111111111",
    );
  });

  it("tags on the short code so one order cannot stack on a lock screen", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).tag).toBe("NY-ABC234");
  });

  it("makes ready the only one that demands attention", () => {
    const ready = customerPayload({ ...base, status: "ready" } as CustomerPayloadOrder);
    const cancelled = customerPayload({ ...base, status: "cancelled" } as CustomerPayloadOrder);
    expect(ready.requireInteraction).toBe(true);
    expect(ready.vibrate).not.toBeNull();
    expect(cancelled.requireInteraction).toBe(false);
    expect(cancelled.vibrate).toBeNull();
  });

  it("is marked for the customer audience", () => {
    const order = { ...base, status: "ready" } as CustomerPayloadOrder;
    expect(customerPayload(order).audience).toBe("customer");
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

  it("is marked for the staff audience", () => {
    expect(
      staffPayload({
        shortCode: "NY-ABC234",
        branchShortName: "Central Bloc",
        itemCount: 1,
        pickupStartsAt: null,
      }).audience,
    ).toBe("staff");
  });
});

// A tripwire, not a unit test. The value of reusing statusCopy() is that there
// is one voice talking to the customer, and the way that gets lost is somebody
// adding "a quick sentence" here rather than editing the copy file.
describe("the source itself", () => {
  it("contains no customer sentences of its own", () => {
    const source = readFileSync("lib/push/payload.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const sentences = code.match(/"[^"\n]{25,}"/g) ?? [];
    expect(sentences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/push-payload.test.ts`
Expected: FAIL. `customerPayload` is not exported.

- [ ] **Step 3: Restore the payload builder and add the audience field**

In `lib/push/payload.ts`, restore the imports and types at the top of the file:

```typescript
import { statusCopy } from "@/lib/orders/status";
import type { OrderStatus, TrackedOrder } from "@/lib/orders/types";

export type PushAudience = "customer" | "staff";

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  requireInteraction: boolean;
  renotify: boolean;
  vibrate: number[] | null;
  /**
   * Who this is for, so `public/sw.js` can pick the right words when it cannot
   * parse the rest of the payload. One worker serves scope "/" and therefore
   * both audiences, and its fallback used to tell a customer to open the
   * orders board.
   */
  audience: PushAudience;
};

export type CustomerPayloadOrder = {
  shortCode: string;
  trackingToken: string;
  status: OrderStatus;
  timeline: TrackedOrder["timeline"];
  payment: TrackedOrder["payment"];
};
```

Then add `customerPayload` above `staffPayload`:

```typescript
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
    audience: "customer",
  };
}
```

Finally add `audience: "staff",` to the object `staffPayload` returns.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/push-payload.test.ts && npm run typecheck`
Expected: PASS. If the typecheck complains about `staffPayload`'s return missing `audience`, that is the compiler catching step 3's last instruction being skipped.

- [ ] **Step 5: Commit**

```bash
git add lib/push/payload.ts tests/unit/push-payload.test.ts
git commit -m "feat: give the customer their notification's words back"
```

---

### Task 5: notifyCustomer, on the web transport

**Files:**
- Modify: `lib/push/dispatch.ts`
- Modify: `tests/unit/push-dispatch.test.ts`

**Interfaces:**
- Consumes: `customerPayload`, `CustomerPayloadOrder` from Task 4. `sendWeb`, `WebTarget` from `lib/push/web.ts`.
- Produces: `notifyCustomer(orderId: string): Promise<CustomerNotifyResult>`, where `CustomerNotifyResult = { ok: true; delivered: number } | { ok: false; reason: CustomerNotifyFailure }` and `CustomerNotifyFailure = "admin_unconfigured" | "order_lookup_failed" | "order_unreadable" | "subscription_lookup_failed" | "unexpected_error"`.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/push-dispatch.test.ts`, above the existing `describe("notifyStaffOfNewOrder", ...)`:

```typescript
describe("notifyCustomer", () => {
  it("sends to the order's web endpoints and deletes what comes back dead", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");

    const order = {
      short_code: "NY-ABC234",
      tracking_token: "11111111-1111-4111-8111-111111111111",
      status: "ready",
      accepted_at: null, preparing_at: null, ready_at: null, claimed_at: null,
      rejected_at: null, rejected_reason: null, cancelled_at: null,
      cancelled_reason: null, customer_arrived_at: null, no_show_at: null,
      payments: { method: "qrph", status: "paid", amount_cents: 45000, paid_at: null },
    };
    const subscriptions = [
      { endpoint: "https://push.example/live", p256dh: "a", auth_key: "b" },
      { endpoint: "https://push.example/dead", p256dh: "c", auth_key: "d" },
    ];

    const deleted: string[][] = [];
    from.mockImplementation((table: string) => {
      if (table === "orders") return makeSelectBuilder({ data: order, error: null });
      return {
        select: () => ({
          eq: () => ({ eq: () => Promise.resolve({ data: subscriptions, error: null }) }),
        }),
        delete: () => ({
          in: (_column: string, values: string[]) => {
            deleted.push(values);
            return Promise.resolve({ error: null });
          },
        }),
      };
    });
    sendWeb.mockResolvedValue(["https://push.example/dead"]);

    const result = await notifyCustomer(orderId);

    expect(result).toEqual({ ok: true, delivered: 1 });
    expect(sendWeb.mock.calls[0]?.[0]).toHaveLength(2);
    expect(sendWeb.mock.calls[0]?.[1].audience).toBe("customer");
    expect(deleted).toEqual([["https://push.example/dead"]]);
  });

  it("resolves rather than throwing when the lookup fails", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() =>
      makeSelectBuilder({ data: null, error: { message: "boom" } }),
    );

    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "order_lookup_failed",
    });
  });

  it("does not touch the database when the admin client is unavailable", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    adminConfiguredMock.mockReturnValue(false);

    await expect(notifyCustomer(orderId)).resolves.toEqual({
      ok: false,
      reason: "admin_unconfigured",
    });
    expect(from).not.toHaveBeenCalled();
  });

  it("never logs the tracking token when it has to log an unreadable row", async () => {
    const { notifyCustomer } = await import("@/lib/push/dispatch");
    const token = "11111111-1111-4111-8111-111111111111";
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    from.mockImplementation(() =>
      makeSelectBuilder({
        data: { short_code: "NY-ABC234", tracking_token: token, status: "nonsense" },
        error: null,
      }),
    );

    const result = await notifyCustomer(orderId);

    expect(result).toEqual({ ok: false, reason: "order_unreadable" });
    const logged = spy.mock.calls.flat().map((v) => JSON.stringify(v)).join(" ");
    expect(logged).not.toContain(token);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/push-dispatch.test.ts`
Expected: FAIL. `notifyCustomer` is not exported from the dispatch module.

- [ ] **Step 3: Restore notifyCustomer, pointed at sendWeb**

Recover the deleted implementation as a starting point rather than retyping it:

```bash
git show b7a64a1^:lib/push/dispatch.ts > /tmp/old-dispatch.ts
```

In `lib/push/dispatch.ts`, add `customerPayload` and `CustomerPayloadOrder` to the import from `./payload`, then restore from the recovered file, in this order: the `ORDER_TIMELINE_SELECT` constant, `paymentRowSchema`, `customerOrderRowSchema`, the `CustomerNotifyFailure` and `CustomerNotifyResult` types with their doc comment, and `notifyCustomer` itself.

Change exactly two things in the recovered `notifyCustomer`:

The subscription lookup selects the keypair and filters on the web transport:

```typescript
    // The customer side of push_subscriptions is transport = 'web' since 0047.
    // The 'expo' rows 0038 could write are unreachable now, and filtering here
    // is what keeps a stale one from ever being handed to a Web Push sender
    // that cannot use it.
    const { data: subscriptions, error: subscriptionsError } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth_key, push_subscription_orders!inner ( order_code )")
      .eq("transport", "web")
      .eq("push_subscription_orders.order_code", order.shortCode);
```

And the send goes through `sendWeb`:

```typescript
    const targets = ((subscriptions ?? []) as WebTarget[]).map((row) => ({
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth_key: row.auth_key,
    }));
    const dead = await sendWeb(targets, payload);
    await deleteDeadEndpoints(admin, dead);

    // Endpoints the push service did not reject. `sendWeb` resolves to the ones
    // that are gone for good, so this is the count genuinely handed over, not
    // the count attempted.
    return { ok: true, delivered: Math.max(0, targets.length - dead.length) };
```

Update the file's header comment: the "WHY THERE IS NO CUSTOMER HALF" block is now wrong. Replace it with a note that both audiences are Web Push and that `transport` is what separates them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/push-dispatch.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/push/dispatch.ts tests/unit/push-dispatch.test.ts
git commit -m "feat: tell the customer's browser what happened to their order"
```

---

### Task 6: The queue drain

**Files:**
- Create: `lib/push/drain.ts`
- Create: `tests/unit/push-drain.test.ts`
- Modify: `app/api/cron/expire-orders/route.ts`

**Interfaces:**
- Consumes: `notifyCustomer` from Task 5.
- Produces: `drainPushQueue(limit?: number): Promise<{ sent: number; failed: number; delivered: number }>`.

- [ ] **Step 1: Recover the deleted implementation and its test**

Both files existed before the mobile removal and their logic is unchanged by this work. Recover them verbatim:

```bash
git show b7a64a1^:lib/push/drain.ts > lib/push/drain.ts
git show b7a64a1^:tests/unit/push-drain.test.ts > tests/unit/push-drain.test.ts
```

Read `lib/push/drain.ts`'s long comment before changing anything. It records why a `failed` row is not proof nobody was told, and why `sending` is terminal in practice. That reasoning is still correct and must survive.

- [ ] **Step 2: Run the recovered test to verify it passes against Task 5's notifyCustomer**

Run: `npx vitest run tests/unit/push-drain.test.ts`
Expected: PASS. The drain mocks `notifyCustomer`, so it does not care that the transport changed. If it fails on an import, check that Task 5 exported `CustomerNotifyResult`.

- [ ] **Step 3: Wire the drain back into the cron route**

In `app/api/cron/expire-orders/route.ts`, add the import:

```typescript
import { drainPushQueue } from "@/lib/push/drain";
```

Replace the `WHAT THIS ROUTE NO LONGER DOES` block in the doc comment with:

```typescript
/**
 * Releases pickup capacity for online payments that were never completed, then
 * drains whatever push notification that sweep queued.
 *
 * `0039`'s sweep cancels an order from inside a pg_cron job, deliberately,
 * because cancellation cannot depend on Vercel or an HTTP round trip. It cannot
 * send a push itself for the same reason, so it inserts a `notifications` row
 * and this route turns that row into an actual notification. The sweep also
 * still runs on pg_cron every five minutes on its own; this route remains the
 * drain, whether pg_cron triggers it or somebody runs it by hand.
 *
 * The drain was deleted with the mobile app on 2026-08-17, because the only
 * transport it had was Expo. Rows queued between then and now are still there,
 * and the first run of this route after deployment will send them. That is the
 * intended behaviour: a customer whose order was cancelled for non-payment is
 * better told late than never.
 */
```

Restore the call and the response shape:

```typescript
  const drained = await drainPushQueue();
  return Response.json(
    { expired: data, ...drained },
    { headers: { "Cache-Control": "no-store" } },
  );
```

- [ ] **Step 4: Run the tests and the build**

Run: `npx vitest run tests/unit/push-drain.test.ts && npm run build`
Expected: PASS and a clean build.

- [ ] **Step 5: Commit**

```bash
git add lib/push/drain.ts tests/unit/push-drain.test.ts app/api/cron/expire-orders/route.ts
git commit -m "feat: send the queued notices the expiry sweep leaves behind"
```

---

### Task 7: The trigger points

**Files:**
- Modify: `app/(workspace)/workspace/orders/actions.ts`
- Modify: `app/api/paymongo/webhook/route.ts`
- Modify: `tests/unit/push-triggers.test.ts`
- Create: `tests/unit/order-status-notifications.test.ts`

**Interfaces:**
- Consumes: `notifyCustomer` from Task 5.
- Produces: nothing new. Three call sites are restored.

- [ ] **Step 1: Write the failing tests**

Recover the behavioural test that covered these call sites:

```bash
git show b7a64a1^:tests/unit/order-status-notifications.test.ts > tests/unit/order-status-notifications.test.ts
```

Then add the customer trigger back to `tests/unit/push-triggers.test.ts`, as the first case inside the existing `describe`:

```typescript
  it("marks ready and refuses through after()", () => {
    const source = read("app/(workspace)/workspace/orders/actions.ts");
    expect(source).toMatch(/import \{[^}]*after[^}]*\} from "next\/server"/);
    expect(source).toContain("notifyCustomer");
  });
```

Update that file's doc comment: it currently says there is no customer trigger to guard. There is again.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/push-triggers.test.ts tests/unit/order-status-notifications.test.ts`
Expected: FAIL. `actions.ts` contains neither `after` nor `notifyCustomer`.

- [ ] **Step 3: Restore the three call sites**

In `app/(workspace)/workspace/orders/actions.ts`, add both imports back:

```typescript
import { after } from "next/server";
import { notifyCustomer } from "@/lib/push/dispatch";
```

In `setStatus`, replace the comment that explains the absence with the call:

```typescript
  // Only ready is worth a customer's lock screen. Preparing and claimed are
  // both things they either already know or are standing there for.
  if (status === "ready") {
    after(notifyCustomer(parsedId.data));
  }
```

In `rejectOrder`, immediately before the first `revalidatePath`:

```typescript
  after(notifyCustomer(parsedId.data));
```

In `app/api/paymongo/webhook/route.ts`, add `notifyCustomer` to the existing dispatch import, and restore the failed-payment line beneath the paid one:

```typescript
  if (status === "failed" && orderId) after(notifyCustomer(orderId));
```

Remove the paragraph in that comment block saying a failed payment no longer pushes to the customer.

- [ ] **Step 4: Run the full suite and the build**

Run: `npm test && npm run build`
Expected: PASS across all files.

- [ ] **Step 5: Commit**

```bash
git add "app/(workspace)/workspace/orders/actions.ts" app/api/paymongo/webhook/route.ts tests/unit/push-triggers.test.ts tests/unit/order-status-notifications.test.ts
git commit -m "feat: send the alert from the three moments that cause one"
```

---

### Task 8: The service worker, for two audiences

**Files:**
- Modify: `public/sw.js`
- Create: `tests/unit/service-worker.test.ts`

**Interfaces:**
- Consumes: the `audience` field on `PushPayload` from Task 4.
- Produces: nothing importable. `public/sw.js` is served as a static asset and is not part of the module graph.

- [ ] **Step 1: Write the failing test**

There is no service worker test runner in this repository, and adding one for a 120 line file is not worth it. What is worth it is a source tripwire, in the same spirit as `tests/unit/push-triggers.test.ts`, proving the worker no longer speaks to only one audience.

Create `tests/unit/service-worker.test.ts`:

```typescript
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * A source tripwire, not a unit test. One worker serves scope "/" and therefore
 * both audiences. Its fallback used to say "New order / Open the orders board
 * to see it", which is what a CUSTOMER would have been shown for any payload
 * the worker could not parse. This proves the fallback is chosen by audience
 * and that neither audience's words leaked into the other's branch.
 */
const source = readFileSync("public/sw.js", "utf8");

describe("public/sw.js", () => {
  it("reads the audience off the payload", () => {
    expect(source).toContain("payload.audience");
  });

  it("carries a fallback for each audience", () => {
    expect(source).toContain('"/workspace/orders"');
    expect(source).toMatch(/customer/);
  });

  it("never sends a customer to the orders board", () => {
    // The staff fallback URL must not be the default any more. A bare
    // FALLBACK_URL constant pointing at the board is exactly the bug.
    expect(source).not.toMatch(/const FALLBACK_URL = "\/workspace\/orders"/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/service-worker.test.ts`
Expected: FAIL on all three: the file has no `payload.audience` and still declares `const FALLBACK_URL = "/workspace/orders"`.

- [ ] **Step 3: Make the worker audience-aware**

In `public/sw.js`, replace the `FALLBACK_URL` constant with a table:

```javascript
/**
 * What to show when a payload cannot be read, per audience.
 *
 * A push that arrives and shows nothing is worse than a vague one: Chrome
 * shows its own "This site has been updated in the background" notice in that
 * case, which tells nobody anything and looks like a fault. So a payload this
 * worker cannot read still becomes a notification.
 *
 * There are two of these because one worker serves scope "/" and therefore
 * both audiences. Before customers had Web Push there was a single fallback
 * pointing at the orders board, which is what a customer would have been shown.
 */
const FALLBACKS = {
  staff: {
    title: "New order",
    body: "Open the orders board to see it.",
    url: "/workspace/orders",
    tag: "orders-fallback",
    requireInteraction: true,
    renotify: true,
    vibrate: null,
    audience: "staff",
  },
  customer: {
    title: "Your order has an update",
    body: "Open your order to see what changed.",
    url: "/",
    tag: "order-fallback",
    requireInteraction: false,
    renotify: false,
    vibrate: null,
    audience: "customer",
  },
};
```

Update `read()` to pick by audience, keeping its existing shape check:

```javascript
function read(data) {
  let audience = "staff";
  try {
    const payload = data ? data.json() : null;
    if (payload && payload.audience === "customer") audience = "customer";
    if (payload && typeof payload.title === "string" && typeof payload.body === "string") {
      return payload;
    }
  } catch {
    // Falls through to the fallback below.
  }

  return FALLBACKS[audience];
}
```

Replace the two remaining `FALLBACK_URL` references in `show()` and `notificationclick` with `FALLBACKS.staff.url`, and add a short note that a payload always carries its own `url` so this is only reached for an unreadable one.

Update the file's header comment: it says this is "the counter tablet's service worker" and that it is the only code running with the workspace closed. Both halves now apply to a customer's phone as well.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/service-worker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/sw.js tests/unit/service-worker.test.ts
git commit -m "fix: stop the worker telling a customer to open the orders board"
```

---

### Task 9: Split the manifests

**Files:**
- Modify: `app/manifest.ts`
- Create: `public/workspace.webmanifest`
- Modify: `app/(workspace)/workspace/layout.tsx:8-11`

**Interfaces:**
- Consumes: nothing.
- Produces: `/manifest.webmanifest` now describes the customer site. `/workspace.webmanifest` describes the counter tablet.

- [ ] **Step 1: Read the Next 16 docs before writing any of this**

Run: `cat node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md`

Two facts this task depends on: `manifest.ts` must sit at the **root** of `app`, and `metadata.manifest` on a layout emits `<link rel="manifest" href="...">`. What the docs do not state is whether the root file convention ALSO emits a link on those pages, which is what step 5 verifies.

- [ ] **Step 2: Create the workspace manifest**

Create `public/workspace.webmanifest`, carrying what `app/manifest.ts` holds today:

```json
{
  "name": "New York Buffalo Brad's Workspace",
  "short_name": "NYBB Workspace",
  "description": "The orders board, and the alerts that arrive when it is closed.",
  "start_url": "/workspace/orders",
  "display": "standalone",
  "orientation": "landscape",
  "background_color": "#0b0b0c",
  "theme_color": "#ef6212",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" }
  ]
}
```

- [ ] **Step 3: Point the workspace layout at it**

In `app/(workspace)/workspace/layout.tsx`, add `manifest` to the existing `metadata` export:

```typescript
export const metadata: Metadata = {
  title: { default: "Workspace", template: "%s · NYBB Workspace" },
  robots: { index: false, follow: false },
  // The counter tablet's own manifest. The root app/manifest.ts describes the
  // customer site, because a manifest is per origin and iOS delivers Web Push
  // only to a site installed to the Home Screen. Without this split, a customer
  // installing to receive alerts would land on the orders board in landscape.
  manifest: "/workspace.webmanifest",
};
```

- [ ] **Step 4: Rewrite the root manifest for customers**

Replace the whole of `app/manifest.ts`:

```typescript
import type { MetadataRoute } from "next";

/**
 * The customer site's install prompt.
 *
 * WHY THIS EXISTS AT ALL, GIVEN THAT NOBODY INSTALLS A RESTAURANT WEBSITE.
 * ================================================================
 * iOS delivers Web Push only to a site the customer has added to their Home
 * Screen. So on iPhone this file is not a nicety, it is the difference between
 * a customer being told their order is ready and not being told. Android needs
 * no install for push and gains only the icon.
 *
 * This used to describe the counter tablet, back when the customer half of the
 * product was a native app and staff were the only audience left with a reason
 * to install anything. The tablet now has `public/workspace.webmanifest`, named
 * by the workspace layout's metadata, because a manifest is per origin and
 * these two audiences want opposite things from one.
 *
 * No orientation lock, deliberately: the tablet wants landscape and a phone in
 * a car park wants whichever way it is being held.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "New York Buffalo Brad's Hot Wings",
    short_name: "NY Buffalo Brad's",
    description: "Order wings for pickup, and know the moment they are ready.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0b0c",
    theme_color: "#ef6212",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
```

- [ ] **Step 5: Verify against built HTML rather than trusting the docs**

Run:

```bash
npm run build && npx next start -p 3021 &
sleep 6
curl -s http://localhost:3021/ | grep -o 'rel="manifest" href="[^"]*"'
curl -s http://localhost:3021/workspace/login | grep -o 'rel="manifest" href="[^"]*"'
```

Expected: the storefront prints exactly one line naming `/manifest.webmanifest`, and the workspace route prints exactly one line naming `/workspace.webmanifest`.

**If the workspace page prints two links**, the root file convention is emitting one as well. In that case set `manifest: null` in the root layout's metadata and give the marketing route group's layout `manifest: "/manifest.webmanifest"`, so each group names its own and neither inherits. Re-run this step.

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add app/manifest.ts public/workspace.webmanifest "app/(workspace)/workspace/layout.tsx"
git commit -m "feat: give the customer site and the counter tablet a manifest each"
```

---

### Task 10: The opt-in control

**Files:**
- Create: `components/order/CustomerPushOptIn.tsx`
- Modify: `app/(marketing)/order/[code]/page.tsx:75-79`

**Interfaces:**
- Consumes: `POST /api/push/customer/subscribe` from Task 3. `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- Produces: `<CustomerPushOptIn shortCode={string} trackingToken={string | null} />`.

- [ ] **Step 1: Write the component**

There is no DOM test runner configured in this project (`vitest.config.ts` runs in node), and the parts of this component worth testing are `pushManager`, `Notification.permission` and a service worker registration, none of which exist in node. It is verified in a browser at step 3, the same way `StaffPushOptIn.tsx` was.

Create `components/order/CustomerPushOptIn.tsx`, closely mirroring `components/workspace/StaffPushOptIn.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

/**
 * One tap to be told when this order is ready, refused or cancelled.
 *
 * Modelled on `components/workspace/StaffPushOptIn.tsx` and inheriting both of
 * its rules.
 *
 * IT NEVER REMOVES ITSELF ON FAILURE. Every failure here is invisible by
 * nature: a VAPID key of the wrong length, a browser that refused permission
 * months ago, a push service that cannot be reached. The reference project's
 * control deleted itself on error, which turned a fixable configuration
 * problem into a mystery.
 *
 * PERMISSION IS ASKED FOR ON A TAP, NEVER ON LOAD. A prompt on page load is
 * the one a person dismisses without reading, and a browser only offers it
 * once. Spec section 15.
 *
 * WHAT IS HERE AND NOT IN THE STAFF VERSION.
 * ================================================================
 * iOS delivers Web Push only to a site added to the Home Screen, and
 * `pushManager.subscribe` fails outside standalone mode no matter what the
 * customer taps. So an iPhone in Safari is told to install the site rather
 * than offered a button that cannot work.
 */

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type State =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "unconfigured" }
  | { kind: "needs-install" }
  | { kind: "off" }
  | { kind: "working" }
  | { kind: "on" }
  | { kind: "failed"; message: string };

/**
 * `applicationServerKey` takes bytes, and a VAPID key is distributed as
 * base64url text. The browser rejects the string form with a DOMException that
 * names neither the key nor the encoding.
 */
function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = key.padEnd(key.length + ((4 - (key.length % 4)) % 4), "=");
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * An iOS browser that is not running as an installed app.
 *
 * The display-mode query is the reliable half: iOS only exposes PushManager at
 * all in standalone mode, so a browser that has the API is already installed.
 * The platform check keeps this from mislabelling a desktop browser, which
 * needs no install and would be told to do something impossible.
 */
function needsHomeScreenInstall(): boolean {
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari's own, older, non-standard flag.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isApple = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
  return isApple && !isStandalone;
}

export function CustomerPushOptIn({
  shortCode,
  trackingToken,
}: {
  shortCode: string;
  trackingToken: string | null;
}) {
  const [state, setState] = useState<State>({ kind: "checking" });

  useEffect(() => {
    let live = true;

    async function look() {
      if (typeof window === "undefined") return { kind: "checking" } as const;
      if (needsHomeScreenInstall()) return { kind: "needs-install" } as const;
      if (!supported()) return { kind: "unsupported" } as const;
      if (!VAPID_PUBLIC_KEY) return { kind: "unconfigured" } as const;

      // getRegistration rather than register: this runs for every customer who
      // opens their order, and it should not install a worker on behalf of
      // somebody who will never opt in.
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      const granted = Notification.permission === "granted";
      return subscription && granted ? ({ kind: "on" } as const) : ({ kind: "off" } as const);
    }

    look()
      .then((next) => {
        if (live) setState(next);
      })
      .catch(() => {
        if (live) setState({ kind: "off" });
      });

    return () => {
      live = false;
    };
  }, []);

  async function turnOn() {
    setState({ kind: "working" });

    try {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState({
          kind: "failed",
          message:
            "This browser has blocked notifications for the site. Allow them in the browser's settings, then tap again.",
        });
        return;
      }
      if (permission !== "granted") {
        setState({ kind: "failed", message: "Notifications were not allowed, so nothing was turned on." });
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyBytes(VAPID_PUBLIC_KEY),
      });

      const response = await fetch("/api/push/customer/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shortCode, trackingToken, subscription: subscription.toJSON() }),
      });

      if (!response.ok) {
        // The browser now holds a subscription the server does not know about.
        // Dropping it keeps the two in step, so tapping again is a clean retry
        // rather than a resubscribe the browser answers from its own cache.
        await subscription.unsubscribe().catch(() => {});
        const body = await response.json().catch(() => null);
        setState({
          kind: "failed",
          message:
            (body && typeof body.error === "string" && body.error) ||
            "We could not turn on alerts for this order.",
        });
        return;
      }

      setState({ kind: "on" });
    } catch (error) {
      setState({
        kind: "failed",
        message: `Alerts could not be turned on: ${error instanceof Error ? error.message : "unknown error"}.`,
      });
    }
  }

  if (state.kind === "checking") return null;

  if (state.kind === "needs-install") {
    return (
      <Note>
        To get an alert when this order is ready, add this page to your Home
        Screen first: tap Share, then Add to Home Screen, then open it from
        there. iPhones only send alerts from an added site.
      </Note>
    );
  }

  if (state.kind === "unsupported") {
    return <Note>This browser cannot send order alerts. Keep this page open to follow the order.</Note>;
  }

  if (state.kind === "unconfigured") return null;

  if (state.kind === "on") {
    return <Note>We will tell you when this order is ready.</Note>;
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button type="button" tone="light" variant="secondary" onClick={turnOn} disabled={state.kind === "working"}>
        {state.kind === "working" ? "Turning on alerts" : "Tell me when it is ready"}
      </Button>
      {state.kind === "failed" ? (
        <p role="alert" className="text-nybb-ink/75 max-w-md text-sm">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-nybb-ink/60 mt-6 max-w-md text-sm leading-relaxed">
      {children}
    </p>
  );
}
```

Note `unconfigured` returns null rather than a note. The staff version says "not configured on this deployment" because staff can act on that; a customer cannot, and telling them the site is misconfigured helps nobody.

- [ ] **Step 2: Put it on the order page**

In `app/(marketing)/order/[code]/page.tsx`, add the import and render it directly after `<OrderTracker ... />` inside the `lookup.state === "found"` branch:

```tsx
          <CustomerPushOptIn
            shortCode={lookup.order.shortCode}
            trackingToken={typeof token === "string" ? token : null}
          />
```

- [ ] **Step 3: Verify in a browser**

Run `npm run build` first: `next dev` is not a valid environment for a service worker check.

```bash
npm run build && npx next start -p 3021
```

Open an order page. Without a VAPID key set locally the control renders nothing, which is correct and is itself the thing to confirm. With a development VAPID pair in `.env.local` (generate one with `npx web-push generate-vapid-keys --json`, and never reuse the production pair), confirm the button appears, that tapping it prompts once, and that a row lands in `push_subscriptions` with `audience = 'customer'` and `transport = 'web'`.

- [ ] **Step 4: Run the full loop**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add components/order/CustomerPushOptIn.tsx "app/(marketing)/order/[code]/page.tsx"
git commit -m "feat: let a customer ask to be told when their order is ready"
```

---

### Task 11: The documents that now say something false

**Files:**
- Modify: `docs/IMPLEMENTATION-PROMPT.md` (section 15, section 23's phase notes, Appendix A)
- Modify: `docs/HANDOFF.md`
- Modify: `docs/push-device-test-checklist.md`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-13-order-notifications-design.md` (its superseded banner)

**Interfaces:**
- Consumes: everything above.
- Produces: documentation matching the code. `AGENTS.md` rule 3: if reality contradicts the spec, update the spec rather than silently diverging.

- [ ] **Step 1: Correct spec section 15**

It currently opens "Push. Staff only, as of 2026-08-17" and says the customer half was removed. Rewrite it: both audiences are Web Push, `transport` separates them, and the customer half is `0047` rather than `0038`. Keep the two-corrections history (Web Push, then Expo, then Web Push again) because Appendix A refers to it, and keep the iOS Home Screen constraint, which is now a live product limitation rather than a hypothetical.

- [ ] **Step 2: Correct the phase note in section 23 and Appendix A**

Section 23's Phase 3 paragraph says the customer half was removed outright. Add that it returned on 2026-08-18 on Web Push. Add a row to Appendix A's decision table:

```markdown
| 2026-08-18 | Customer notifications return, on Web Push rather than Expo. The manifest splits so an iPhone customer can install the site and receive them. | Owner |
```

- [ ] **Step 3: Correct HANDOFF.md**

The bullet reading "The customer half is gone; the staff half is Web Push" is now wrong, as is the claim that nothing tells a customer their order was cancelled for non-payment. Replace both. Keep the `staff_push_targets` bullet and the retry-hazard bullet unchanged: both are still true.

Add a new trap, because it is the kind of thing that costs an afternoon:

> **A customer endpoint and a staff endpoint are the same column.** `push_subscriptions` is unique on `endpoint`, so `0047` refuses to register a customer subscription against an endpoint that already belongs to staff. Without that guard, a staff member opening their own order on the counter tablet would flip the tablet's row to `audience = 'customer'` and the tablet would stop being told about new orders with nothing anywhere saying why.

- [ ] **Step 4: Give the device checklist its customer half back**

`docs/push-device-test-checklist.md` was cut down to staff only. Add a customer section. It is shorter than the Expo one it replaces, because there is no app build, no project id and no APNs key:

```markdown
## Customer, on a phone

Each of these needs a real order, because `register_customer_push_subscription` refuses a terminal
one and the queue only fills on a real status change.

- [ ] **Locked Android, Chrome.** Place an order, opt in, sleep the phone, mark the order ready from
      the workspace. The notification appears on the lock screen and it vibrates.
- [ ] **The tab closed entirely.** Not backgrounded. This is the whole reason this is Web Push and
      not the Realtime refresh the page already has.
- [ ] **iPhone, added to the Home Screen.** Safari delivers nothing until the site is installed. Before
      installing, confirm the control says so rather than offering a button. After installing, confirm
      the opt-in appears and works.
- [ ] **iPhone, not installed.** Confirm the instruction is what shows, and that no button is offered.
- [ ] **Tapping through opens that order**, with its tracking token, not the home page.
- [ ] **Two devices on one order.** Register a second phone against the same order using the same
      tracking link. Both must be told.
- [ ] **The three events, not just one.** Ready, rejected and cancelled all notify. Force a cancelled
      by leaving an online payment to time out. That path runs through the cron drain rather than
      `after()`, so a pass on ready proves nothing about it, and it is the one nobody remembers to
      test.
- [ ] **The counter tablet still works afterwards.** Sign in as staff on the same device that just
      registered as a customer, and confirm the tablet still receives new-order alerts. `0047` is
      supposed to make this impossible to break; this is the check that it does.
```

- [ ] **Step 5: Correct README.md**

The status section says only the staff half survives and that customers are not pushed to at all. Rewrite it, and remove the "Adding customer web push means a browser opt-in..." paragraph, which is now describing something that exists. Keep the note that the expiry sweep queues rows, changing it to say the drain empties them again.

- [ ] **Step 6: Update the 2026-08-13 design's banner**

Its banner says the customer half describes deleted code. Half of that is still true (Expo, `apps/customer`, `/api/mobile/v1`) and half is not (the customer audience exists again). Amend it to point at `docs/superpowers/specs/2026-08-18-customer-web-push-design.md` for what replaced it.

- [ ] **Step 7: Verify no document still claims the customer is not notified**

Run:

```bash
grep -rn "customer half is gone\|not pushed to at all\|Nothing tells a customer\|nothing tells a customer" README.md docs/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 8: Commit**

```bash
git add README.md docs/
git commit -m "docs: the customer is told again, and how to prove it on a phone"
```

---

## Final verification

- [ ] Run the whole loop one last time: `npm test && npm run lint && npm run typecheck && npm run build`
- [ ] Confirm the build's route table lists `/api/push/customer/subscribe`
- [ ] Confirm `npx supabase migration list` shows `0047` as local-only. **It must not be pushed to production as part of this work.** Migrations `0045` and `0046` are applied; `0047` is applied when somebody decides to, not as a side effect.
- [ ] Confirm nothing in the diff touches `lib/staff/push.ts`, `app/api/push/staff/subscribe/route.ts`, or `staff_push_targets`. Staff push was out of scope and must be byte-identical.
