# Handoff: the sales analytics report

Written 2026-09-04. Branch at the time: `main`, at `03cd214`, clean.

Paste the prompt below into a fresh Claude Code session in `C:\dev\nybb-order`.

The occasion for it: PR #20 shipped the per-member permission panel, and the
audit that came with it found `analytics:view` granted by default while
guarding nothing anywhere, in the app or the database. The choice was to build
the report or drop the permission. This is the build.

---

## The prompt

Build the sales analytics report for NYBB Order, at `C:\dev\nybb-order`.

Read first, in this order: `AGENTS.md` (standing rules), `README.md` (live
status), `DESIGN.md` (the design system, before any visual work), `PRODUCT.md`
(who a screen is for), then section 20 of `docs/IMPLEMENTATION-PROMPT.md`, which
is the spec for this feature, and section 21 for the responsive rules. Read them
from disk, do not paste them into chat. `docs/HANDOFF.md` carries the running
project record; add to it when you are done.

### Where this starts

`main` is at `03cd214`, clean, and carries migrations `0001` to `0061`, all
applied to the live database. The per-member permission panel shipped on
2026-09-03.

`analytics:view` already exists as a permission. It is in the union in
`lib/staff/roles.ts`, the Manager role grants it by default, the Staff role does
not, and the Super Admin panel on `/workspace/team` can switch it per person.
What does not exist is anything that reads it. That is the whole job: the
permission is waiting for its screen.

Three things will fight you if you do not deal with them deliberately:

1. `lib/staff/permission-catalog.ts` lists `analytics:view` in
   `UNBUILT_PERMISSIONS` and describes it as "Nothing reads this yet."
   `tests/unit/permission-catalog.test.ts` scans `app/` and goes red the moment
   a permission on that list appears in a permission check. That is the drift
   guard doing its job, not a bug. Remove `analytics:view` from
   `UNBUILT_PERMISSIONS` and rewrite its description to say what the report
   actually opens, in the same commit that gates the page.
2. The same file also feeds `/workspace/profile`, where a member reads back what
   they hold. One copy of the words, two screens.
3. Section 1046 of the spec describes the label as it stands today. Update that
   line rather than letting the document go stale.

### What to build

`/workspace/analytics`, gated by `requireStaffPermission("analytics:view")`,
with the nav entry added in `app/(workspace)/workspace/layout.tsx` next to
Audit. Model the page on `app/(workspace)/workspace/audit/page.tsx`: it is the
closest existing screen in shape, a permission-gated read-only report with
filters.

The metrics are the table in spec section 20. Orders and revenue by hour of day
is the one that earns the page, so build it first and make it the best thing on
the screen.

`C:\dev\zombeans-web` is a READ-ONLY reference. Its
`supabase/migrations/0074_order_analytics.sql` and
`0102_order_analytics_discounts.sql` are the pattern to port: aggregate in SQL
and return json, do not pull rows into Node and reduce them there. Inherit the
shape, not the zombie theming, the service-mode breakdown, the delivery fees or
the rider metrics. Read it, never write to it, never run anything in it.

Rules the reference already learned, which apply here:

- Guard the function with `current_role_kind() in ('staff','admin')`, the helper
  from `0007`.
- Exclude `is_test` orders from every money figure. The column is on `orders`,
  from `0005`.
- Collapse to one representative paid payment per order, so an order with
  several payment rows cannot double-count revenue.
- Prep time is `preparing_at` to `ready_at`, and wait time is `ready_at` to
  `claimed_at`, both on `orders` from `0005`. Report median and p90, not the
  mean.
- Keep the discount-check card from the reference. It catches vouchers being
  applied at a rate that suggests a leak.

Wide tables scroll inside their own `overflow-x: auto` container. The page body
must never scroll horizontally, and the Workspace is landscape-first, with key
layout rules on viewport height rather than orientation.

### Things to decide before writing SQL, and to ask about rather than invent

- **Branch scoping.** `0059` made staff branch-scoped, and a branch-assigned
  manager can hold `analytics:view`. Does that person see their own counter's
  numbers or the whole business? Read `lib/staff/permission-panel.ts` and the
  business-wide permission list in `lib/staff/roles.ts` before deciding, and say
  what you chose and why.
- **The date range the page opens on, and the timezone the hour-of-day buckets
  are cut in.** The branches are in Cebu, so this is almost certainly
  `Asia/Manila` rather than UTC, and getting it wrong moves every bar on the
  most important chart.
- **New versus returning customers** needs a definition of returning that
  somebody agreed to. Section 28 of the spec lists what only the business owner
  can answer, and this smells like one of them. Ask, do not invent.

### Constraints

- This is Next.js 16. Middleware is `proxy.ts`. Before writing anything that
  touches routing, caching, Server Actions, `after()` or images, read the guide
  in `node_modules/next/dist/docs/`. A `"use server"` file may only export async
  functions, so keep schemas in `lib/` where they can be unit tested.
- Read `AGENTS.md` section 6 before writing a Zod schema for any number that may
  legitimately be absent. Empty is not zero, and coercion is greedy.
- No em dashes anywhere: not in code, comments, commits, docs or UI copy.
- New migration is `0062`. Apply it with the Supabase CLI, not the MCP
  `apply_migration`, which stamps a timestamp instead of the file number and
  needs repairing afterwards. Reach the database through the MCP with the
  explicit project ref for reads and checks.

### Verification loop

`npm test`, `npm run build`, `npm run lint`, `npm run typecheck`, and
`npm run test:e2e` for the specs you touch. The build is part of the loop, not
an afterthought: React Server Component boundary errors appear only there. Cover
the new SQL function in `tests/sql/` the way
`tests/sql/staff-permission-overrides.test.ts` covers its RPC, against real
Postgres.

Do not change the test personas. `tests/e2e/README.md` says which account a test
may write to, and an earlier session broke the menu specs by giving the owner
persona a branch.

Work on a branch off `main`, commit in coherent steps, and open a PR when it is
green. Do not push or merge without being asked.
