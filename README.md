# NYBB Order

Pickup ordering for **New York Buffalo Brad's Hot Wings** (Cebu, Philippines), plus the
brand and franchise website that sits alongside it.

Built by inheriting the architecture of the ZOMBEANS ordering platform
(`C:\dev\zombeans-web`, read-only reference) on Next.js 16, Supabase, and Tailwind v4.

## Two surfaces, one backend

| Surface | Directory | What it does |
|---|---|---|
| Public website | `app/(marketing)` | Brand, **franchise lead generation**, and customer ordering. |
| Staff workspace | `app/(workspace)` | Counter tablet, in the browser. |

They share `supabase/` and `lib/`.

**This is a web app. There is no mobile app.** An Expo phone app and a versioned
`/api/mobile/v1` contract were built and then removed on 2026-08-17, along with the Expo
push transport and the customer notification path that only that app could receive. The
browser cart, checkout, tracking, account and login pages had been marked frozen and
awaiting deletion under that direction; they are neither. They are the customer channel.

Read `docs/IMPLEMENTATION-PROMPT.md`, section "Current direction", before starting work.
Appendix A of that file records how the direction got here and back.

## Status

**Phase 0 and Phase 1 are complete, and Phase 2 has started.** The menu reads
through one source-agnostic reader, the wings configurator is built, and the
cart, pickup slot picker, checkout, order tracking and customer email OTP are
implemented and smoke-tested against Supabase. Central Bloc's 24/7 schedule is now owner-confirmed;
its kitchen capacity remains pending. Once that capacity is confirmed, a customer can place a real
pickup order, get a pickup code back, and open the order again from its
tracking link or signed-in order history. `npm run
build`, `npm run lint`, `npm run typecheck` and `npm test` (701 tests in 64 files)
are all green, every page has been rendered and reviewed in a browser at 320px,
375px and 1280px, and migrations `0001` to `0048` apply cleanly against a real
Postgres in the test suite.

**Phase 3's notifications are built and merged to `main`, and both audiences are
told, both on Web Push.** The counter tablet is told because its browser is
closed at the moment a new order lands. Customers are told on `ready`,
`rejected`, and a `cancelled` for non-payment, through the same opt-in pattern
on `/order/[code]` (`components/order/CustomerPushOptIn.tsx`). The customer
half was Expo-only, then gone with the app, then rebuilt on Web Push on
2026-08-18: `register_customer_push_subscription` (`0047`) is the RPC,
`lib/customer/push.ts` and `app/api/push/customer/subscribe/route.ts` are the
service and the route. The tracking page still updates itself over Realtime for
whoever is looking at it; Web Push is for whoever has closed the tab, on either
side of the counter.

**The counter tablet could not be told about a single order until 2026-08-19, and no test in this
repository could see it.** `notifyStaffOfNewOrder` had two callers, the PayMongo webhook and the
development mock rail, and both fire when money settles. Every order this system can currently take
is paid at the counter (`paymongo_enabled` is off, so checkout offers `counter` alone, and
`place_order` writes the payment row `due`), so no webhook was ever coming and the tablet rang for
nothing. The unit tests passed because they test the dispatcher, which was correct; the gap was that
nothing called it. It was read as blocked on PayMongo merchant approval, which has a lead time in
weeks. `app/actions/checkout.ts` now announces a counter order at placement, which is what spec
section 15 said all along, and **the tablet test in `docs/push-device-test-checklist.md` needs no
PayMongo, no merchant account and no card rail.** An online order is still announced from the
webhook on `paid`, deliberately: it is placed unpaid and the expiry sweep may yet cancel it.

Migration `0048` is what makes that telling exactly once.
`claim_staff_new_order_notice` hands the right to send to whichever caller asks first and refuses
every later one. It exists because all three callers retry: a replayed Server Action reaches the
trigger with `place_order`'s stored result, byte for byte identical to the first, and PayMongo
redelivers webhooks. A counter cannot tell a duplicate alert from a second order.

Three things a future session will otherwise rediscover:

- `push_subscriptions` is not new. It predates this work by thirty-one
  migrations (`0007`), which is why the transport split lives in a column rather
  than in a second table. The `expo` half of that column, `register_customer_push_device`
  (`0038`), is now permanently unreachable rather than dropped.
- `staff_push_targets` is the only caller of `staff_can_access_branch(profile,
  branch)` other than the wrapper every RLS policy goes through, so a change to
  that function changes who gets told about an order, not only who can read one.
- The expiry sweep (`0039`) still queues a `notifications` row, and `drainPushQueue`
  empties that queue again: the cron route calls it once more, the same as before
  the app was dropped. The rows that piled up as `queued` while the drain was
  gone go out on the first run after this ships. The cancellation itself, which
  is the part money depends on, happens in the sweep regardless and was never
  affected.

**The Supabase project now exists, and `0001` to `0047` plus the seed are
applied to it, and `0048` went in on 2026-08-19.** `0001` to `0044` went in on
2026-08-14, `0045` and `0046` on 2026-08-17, and `0047` on 2026-08-18. **`0047`
and `0048` are therefore both frozen**: section 25 makes migrations
forward-only, and each has now run against a real database, so correcting
either means a later file, never an edit.

`0048` was verified against the real database rather than only in the suite:
`claim_staff_new_order_notice` answered `true` once and `false` twice for the
same order, stamped `staff_notified_at` a single time, and is refused to an
anonymous caller. `0022` and `0033` had both been applied through
the dashboard SQL editor, which does not record them in the CLI's migration
history, so the history was repaired in each case before the following
migrations were pushed. See handoff trap 15. A green migration suite proves the
files apply, not that anyone applied them: check
`npx supabase migration list` before believing the schema matches the branch. The storefront reads the real database over PostgREST, proved
by writing a string into a category blurb that exists nowhere in `lib/catalog/`,
finding it in the server-rendered HTML of the production build, and restoring it
by re-running the seed. The static fallback renders an identical page, so seeing
a menu proves nothing on its own.

**Applying it immediately found a hole that 327 passing tests could not see, and
that is the whole argument for doing it before building on top.** Supabase ships
a default privilege granting `EXECUTE` on functions to `anon`, so every function
these migrations create arrived carrying an explicit `anon=X` grant. `0010`
revokes `from public`, which is the grantee Postgres uses by default but not the
one Supabase had used, so the revoke removed a privilege nobody held. Every
function in `public` was callable by `anon`, including `rate_limit_hit`, which
turns the rate limiter into a way to lock a chosen phone number out of ordering.

Migration `0015` fixes it and `tests/sql/harness.ts` now reproduces the default
privilege, so the assertions that were already written fail without it. The
tests were right the whole time; the database they ran against was the thing
that was wrong. See handoff trap 14.

That grant correction did not change customer behavior at the time. Central Bloc
now has owner-confirmed 24/7 hours, represented by migration `0026`, while the
generated seed still fails closed with empty hours and inactive branches.

**The storefront renders dynamically, and that is deliberate.** A nonce-based
CSP and static generation are mutually exclusive in Next: the nonce is minted
per request, and a prerendered page carries none, so `strict-dynamic` discards
the `'self'` allowlist and the browser blocks every script. Both were
specified, and for one release the production build hydrated nothing at all
while `next dev` looked perfectly healthy. Spec section 22 makes the CSP Tier 1
and non-negotiable, so `app/layout.tsx` calls `await connection()` and every
route is server-rendered on demand. Section 23 carries the correction, handoff
trap 11 has the detail, and a test fails if that call ever goes missing.

Done:

- Next 16.2.9 + TypeScript + Tailwind v4 + Base UI scaffold
- Brand token system in `app/globals.css`, including the five-stop heat ramp
- Nonce-based CSP (`lib/content-security-policy.ts` + `proxy.ts`), security
  headers and image config in `next.config.ts`, with unit tests
- Static catalog in `lib/catalog/`: the full Hot Wings menu, the nine wing
  flavours, the Level of Hotness scale with its variation-dependent pricing,
  and the nine branches. Shaped to match the Phase 1 tables so swapping to
  `get_storefront_menu()` changes the source, not the shape.
- Image pipeline (`npm run build:static-images`) over the legacy archive, with
  automatic corner-badge detection, alpha handling and blur placeholders
- Landing, menu, per-category, about and branches pages, plus header, footer,
  heat meter, product tile, flavour grid and the no-photo tile
- Video hero cut and re-encoded from the brand food film
  (`scripts/build-hero-video.sh`), with poster, reduced-motion and no-JS
  fallbacks all verified, a pause control for WCAG 2.2.2, and the wordmark
  that is burnt into the film's top left corner cropped off at the encoder.
  **The committed clips predate that crop and still carry the mark**: re-run
  the script against the master to clear it. See the note in the script

- Migrations `0001` to `0010` under `supabase/migrations`: types, branches and
  price lists, menu with both price-override tables, carts, orders and pickup
  slots, payments and POS sync, staff and audit, settings and vouchers, then
  RLS and explicit GRANTs. See spec section 6, and 6.6 for where the schema
  departs from it
- `supabase/seed.sql`, generated from `lib/catalog/` by `npm run build:seed`,
  so the storefront and the database cannot drift
- `scripts/ingest-legacy-images.ts`, the Supabase Storage ingest. It and
  `build-static-images.ts` share `scripts/lib/image-pipeline.ts`, so they
  differ in destination and nothing else
- 621 tests, including focused coverage for the store availability and customer
  arrival RPCs, 242
  of which run the migrations and the seed against Postgres
  compiled to WebAssembly, so the schema is verifiable with no project to
  point at

Phase 1 so far:

- Migration `0011`: `get_storefront_menu()`, the whole priced menu as one
  jsonb document, plus `resolve_price_list_id()`. Granted to `anon`, which
  takes the public read surface from three functions to four
- `lib/menu/`: one reader (`getStorefrontMenu()`) that serves the database
  when Supabase is configured and the static catalog when it is not, behind a
  single runtime shape. Every page and every menu component now takes that
  shape, so nothing in the UI knows which source it got
- The pages pass the menu down rather than importing it. `CategoryNav` and
  `FlavourGrid` used to reach into `lib/catalog` directly, which quietly made
  them the two components that could not follow the menu to the database
- `/menu/[category]/[item]` and `components/menu/ItemConfigurator.tsx`: size,
  then flavour from the visual grid, then heat on the meter with the
  variation-correct upcharge repricing live. Product tiles and flavour tiles
  link into it, and a flavour tile opens the configurator on that flavour
- The product photograph tracks the selection: choosing a flavour swaps the
  hero to that flavour's own shot, with the alt text following it. Only groups
  that carry photography can take the frame, so a heat level never blanks it
- `lib/menu/line-pricing.ts`: the only place the UI adds money up, mirroring
  what `place_order` will do in Postgres
- `lib/cart/` and `components/cart/`: the cart, in localStorage, storing slugs
  and quantities and no product data at all. It is matched back to the live
  menu on every visit by `resolveCart()`, which reprices the lines and drops
  the ones the menu no longer sells, saying which and why rather than shrinking
  in silence. Every peso comes from `line-pricing.ts`; the cart adds nothing up
  itself. `customer_carts` is the sync target and waits for customer sign-in
- `/cart`, a header count and a bottom-sticky bar on small screens, all reading
  one module store through `useSyncExternalStore` so the storefront stays a
  server tree with client islands in it
- Migration `0012`: `get_pickup_slots()`, the pickup windows for the next
  `slot_horizon_hours`, generated on read from `store_hours` and
  `pickup_slot_minutes` and never materialized. It asks `branch_is_open_at()`
  rather than re-reading hours, so there is still one definition of open, and
  it anchors the grid to the branch's local midnight so two customers a minute
  apart compute the same boundaries
- `lib/slots/` and `/checkout`: the picker, first field on the screen because
  it is the constraint that can invalidate the order. A full window is shown
  and disabled rather than hidden, and when there is nothing to choose the
  screen names the reason. Today that reason is that no branch has been
  switched on, which is the honest answer while the pilot is unchosen
- Migration `0013`: `place_order()`, the one place an order comes into
  existence and the only place a peso is decided. It is idempotent on a
  browser-minted attempt id through `checkout_attempts`, rate limited through
  `rate_limit_hit()` on an identity the database can see for itself, and it
  books the pickup window in the same transaction as the insert, so a full
  window is genuinely unbookable rather than merely counted. It calls the
  existing price resolvers, `branch_accepts_orders()` and `get_pickup_slots()`
  rather than restating any of them
- `lib/checkout/` and `app/actions/checkout.ts`: the Server Action, the zod
  gate at the boundary, and the table that turns a refusal into a sentence with
  something to do next. The request carries item, variation and option slugs, a
  quantity, a pickup minute, a name and a number. Not one price, and there is a
  test that proves a price cannot survive the parse
- The rest of `/checkout`: name, phone, optional email and note, payment stated
  rather than chosen, and a confirmation carrying the four-digit pickup code,
  the order number, the window and what to pay at the counter
- Migration `0014`: `get_order_by_tracking()`, one order for the customer
  holding its tracking token or signed in as its owner. A wrong token and a
  code that never existed get the same answer, because a short code drawn to be
  read aloud is by construction guessable and the difference would make the
  code space worth scraping
- `lib/orders/` and `/order/[code]`: the tracking page, carrying the pickup
  code, the window, where to collect and what was ordered, read from the order's
  own snapshots rather than from a menu that has moved on. The link is a bearer
  credential, so the page is `noindex`, the referrer policy keeps the token off
  other hosts, and nothing logs it
- `lib/rate-limit/` and `lib/supabase/admin-client.ts`: the address dimension
  of rate limiting, which is the piece Postgres cannot supply because it is
  talking to PostgREST rather than to the customer. This closes spec section 22
  item 6. It is **defence in depth and not a security boundary**, since the
  headers it reads are only worth what the proxy in front of them is worth, and
  the real control remains the database limit on an identity Postgres verifies
  for itself. It validates every candidate with `node:net`'s `isIP` before
  counting it, because `rate_limits` is keyed on a primary key that nothing
  prunes and an unvalidated header lets a caller grow that table forever. IPv6
  counts by /64, the key is a hash rather than the address, and the limit is set
  generously because office and carrier NAT put many unrelated customers behind
  one address. It fails open in every direction, per the spec and per 0008
- **The landing hero and mural pass.** The hero now carries one full-strength
  crop of the store's hand-drawn New York wall rather than repeating the heat
  scale before the visitor reaches the decision. The Level of Hotness ramp is
  drawn once, in the priced band where somebody chooses, and it keeps the
  site's one authored animation. The hero's second button is "Call a branch",
  which makes the disclosure's remedy reachable from where it is read.

Phase 2 so far:

- `/login` is the one six-digit OTP entry point for customers and staff. After
  verification, an active staff profile or the configured Super Admin is sent
  to `/workspace`; everyone else stays on the customer side. `/workspace/login`
  only redirects to the regular login page.
- Customer and Workspace sessions still use separate cookie families. The
  storefront recognizes either family as the same signed-in account, while the
  Workspace accepts only its staff cookie and re-checks database access on
  every request. Tokens are not copied between the families.
- Staff and admins see a Workspace link in the storefront header instead of a
  customer Account link. `/workspace/profile` shows their own email, role,
  branch access, and resolved permissions inside the protected Workspace.
- Workspace landing and navigation follow resolved permissions. Anyone whose
  permissions do not reach the Dashboard lands on Orders instead of entering a
  redirect loop, and links to unavailable sections are not rendered.
- `lib/staff/roles.ts` defines cashier and manager defaults plus per-person
  permission overrides. Admin permission checks remain absolute. There is no
  kitchen role: that station works from the POS system's own monitor.
- Every workspace render validates the Auth user, then re-reads the active
  `profiles` row and permission overrides through RLS. Deactivating a profile
  therefore takes effect without waiting for a token to expire.
- `/workspace` is a landscape-friendly operations shell with live counts for
  New, Preparing, Ready and Claimed. The workspace has no storefront mural,
  footer, cart or customer navigation.
- Migration `0017` adds the exact email lookup needed before a staff code is
  sent. It joins `profiles` to the private Auth directory and is executable by
  `service_role` only. The Super Admin is provisioned from
  `SUPER_ADMIN_EMAIL`, with no in-app path to create a second admin.
- The staff login was browser-checked at 375 by 812 and 1024 by 768. The
  protected redirect, controls, CSP hydration, overflow and console are clean.
- Staging staff OTP is verified end to end. `stevenvillacampa@gmail.com` signs
  in as the configured Super Admin, reaches `/workspace`, and has matching
  active `admin` profile and `staff.super_admin_bootstrapped` audit rows.
- `/workspace/orders` is the four-column operations board. Realtime order
  changes refresh it immediately, with a 20-second polling fallback.
- `/workspace/orders/history` lists up to 250 branch-scoped closed orders,
  including today. Staff can filter by status and placed date or search by
  code and customer details. Paid counts and sales exclude test orders. The
  search runs in the database rather than over the page that came back, so the
  250-row cap applies to matches: an order older than the newest 250 is still
  findable by its own code.
- Migration `0018` adds the locked Start, Ready, and Claim transitions. Claim
  verifies the four-digit pickup code and captures a due counter payment in the
  same transaction. Every change writes status events and an audit row.
- Staging order `NY-VFY248` completed the real browser flow from New to Claimed.
  All lifecycle stamps, five status events, three attributed staff audits and
  counter payment capture were verified directly. Test orders carry a visible
  badge on the board.
- Migration `0019` adds Super Admin-only list, grant, role-change, revoke and
  restore RPCs for Workspace access. Every change is audited, direct profile
  writes from browser sessions are revoked, and a Super Admin cannot demote
  themselves or change another admin.
- `/workspace/team` exposes those controls only to the configured Super Admin.
  Staff access is re-read from the database on every Workspace request, so a
  revocation takes effect without waiting for the Auth token to expire.
- Migration `0020` casts Supabase Auth's `varchar` email to the `text` promised
  by the access-list RPC. The local Auth shim now uses Supabase's real email
  type so this mismatch cannot hide behind the test harness again.
- Migration `0021` broadcasts a data-free status signal on the guest order's
  unguessable tracking-token topic. The tracking page refreshes its authorized
  server payload immediately, with a 20-second fallback for dropped sockets.
  Signed-in account links retain their RLS-protected Postgres Changes path.
- Staging test order `NY-RTM234` moved from New to Cooking, Ready and Collected
  through the Workspace controls. The already-open customer page followed all
  three transitions in about two seconds without a manual refresh or browser
  warning.
- The unified regular login, Super Admin redirect, Team page and customer-cookie
  isolation are verified in the staging-backed browser flow.
- Migration `0022` makes the database enforce resolved staff permissions and
  branch scope on direct Data API reads. It revokes unaudited catalog and owner
  writes, makes future Data API grants opt-in, hardens the tracking trigger
  search path, and rotates the configured Super Admin with its audit trail in
  one transaction. It passes role-switched RLS tests locally and is applied to
  staging. Its focused staging smoke test is still pending.
- Migration `0023` gives `audit_logs` a branch dimension and scopes reading it.
  `0022` had opened the trail from "admin only" to "anyone holding
  `audit:view`", which by role default is every manager, without scoping it by
  branch: a manager assigned to one site could read every site's staff activity
  through the Data API, while the orders those entries describe were scoped one
  policy above. The scope is now a stored column rather than a value derived at
  read time, filled by a trigger so any future writer inherits it, and a null
  branch means business wide (workspace access changes, Super Admin
  provisioning) and is visible only to a profile that is not tied to a site.
  The same widening had also opened `profiles`, so a branch manager could read
  another site's staff and their phone numbers; that policy now carries the
  identical branch test.
- Migration `0024` makes the order transition RPC resolve permissions the way
  every RLS policy does. `0018` predates `0022`, so it asked whether the staff
  member had been explicitly denied `orders:manage` rather than whether they
  have it. Those agree only while all three job roles carry the permission by
  default, which they do, so nothing was reachable through it. The first role
  added without `orders:manage` would have been refused by the application and
  allowed by the database. It now calls `current_staff_has_permission()`.
- `/workspace/audit` is the protected trail, gated on `audit:view` and scoped
  again by RLS underneath. It filters by action, target id and recorded date,
  pages by keyset, names the actor and the branch, and redacts sensitive diff
  fields before the page sees them. Two kinds. No credential is written into a
  diff today; that half of the rule exists because `diff` is open-ended `jsonb`
  and the next RPC to log a row it changed will carry whatever columns that row
  has. A staff phone number was written, because the access-change RPCs record
  the whole profile row, and the owner chose on 2026-08-11 to mask it. The
  entry still says the change happened, who made it, and to whom.
- Migration `0025` and the new `/workspace/availability` and
  `/workspace/settings` screens finish Phase 2's store availability and hours
  controls. A cashier can pause or resume only their own counter. A settings
  manager can set the branch's live flag, prep minutes, pickup-slot width and
  capacity, and its full weekly schedule. An unassigned manager can also pause
  order intake for the whole business. Every mutation is a permission-checked,
  branch-scoped `SECURITY DEFINER` RPC with an audit row. The screens preserve
  the honest starting state: no hours or capacity was invented, and no branch
  is made live by the migration.
- `/workspace/analytics` and migration `0062` are the sales report, gated on
  `analytics:view`, which until 2026-09-04 was a permission nothing read. It
  aggregates in SQL and returns one json document rather than pulling rows into
  Node: orders and revenue by hour, slot utilization, median and p90 prep and
  wait times, no-shows against what they cost in settled refunds, the flavour
  and heat mix, top items and pairings, new against returning customers, and
  the discount check for reconciling against the POS. Hours are cut in
  `Asia/Manila`, a branch-assigned manager is pinned to their own counter by the
  function rather than by the page, and returning means the same phone number
  has ordered before at any point. See spec section 20.

**Online payment is switched on in the database, and that is now gated by what
each deployment can actually service.** `paymongo_enabled` and
`paymongo_methods.qrph` are true in `app_settings`, which every environment
shares, so production began offering QR Ph at checkout while holding no
PayMongo keys and unable to run the simulator (it is hard-disabled whenever
`NODE_ENV` is production). Orders were placed on a rail that could not be paid,
and the pay button answered "We could not start that payment. Please try again
in a moment." on every press while logging nothing. `onlinePaymentsServiceable()`
is the missing question, asked now by both checkout's offer and the order page's
button: the database decides whether the business takes a rail, the deployment
decides whether it can carry one. With no keys, checkout falls back to paying at
the counter, so ordering keeps working. See handoff trap 21.

Next:

1. **Run the staff half of `docs/push-device-test-checklist.md` on the tablet.** Everything it
   needs is now in place: `0048` is applied, the VAPID pair is set, and the counter is told when
   an order is placed. It was believed to be waiting on PayMongo and was not.
2. Re-run the wider Workspace smoke test. The audit page is verified against
   staging; the order board and Team page have not been re-checked since `0024`
   replaced the transition function.
3. Kitchen capacity for Central Bloc, which is spec section 28 item 4 and a conversation with the
   manager rather than a build. Its 24/7 schedule is owner-confirmed and configured.
4. PayMongo merchant approval, which is the actual blocker for taking money and therefore for the
   payment-first ruling in spec section 17. It has a lead time measured in weeks and nothing in this
   repository shortens it. The code around it is ported and waiting on keys.
5. Add a second Supabase project for production, per spec section 25. The
   current one should be treated as staging.

## Start here

`npm run dev` first links a missing, ignored `.env.local` from the primary Git
worktree. This keeps Supabase sign-in configured in Codex worktrees without
printing, tracking, or duplicating credentials. If the primary worktree has no
`.env.local`, development still starts and reports that sign-in is unavailable.

1. `AGENTS.md` for the standing rules.
2. `docs/HANDOFF.md` for where things stand, the twelve traps earlier sessions
   hit, and the Supabase procedure that is next.
3. `docs/IMPLEMENTATION-PROMPT.md` for the full specification: architecture, data model, feature
   classification from ZOMBEANS, build phases, and open questions.

## Design system

`DESIGN.md` is the design system and `PRODUCT.md` is the product record. Both
are tracked, and **`DESIGN.md` is required reading before any visual work**. It
was derived from what shipped rather than from what was intended, which is why
its named rules read as corrections: the header is in the fold, short viewports
key on height rather than width, the same form appears once per page, and the
one authored animation belongs to the surface where a decision is made.

`.impeccable/design.json` is the same system in machine form, and
`.impeccable/live/config.json` goes with it. Everything else under
`.impeccable/` is a generated run artifact, so `.gitignore` denies that
directory and re-allows those two files by name. A new artifact type is
therefore ignored by default, which is the only arrangement that stays correct
without anyone maintaining it.

## What this replaces

`nybuffalobrads.com.ph` is a four-page WordPress brochure whose "Order Here" page links out to
Tablevibe and Foodpanda. The business currently owns no order data, no customer relationship, and
pays aggregator commission on every ticket. This platform makes the pickup channel first-party.

## Scope

- **Pickup only.** No delivery, no dine-in.
- **Single branch at launch**, multi-branch-ready schema (`branch_id` from migration one).
- **ZenPOS** integration via an adapter, with a working manual re-key fallback from day one.
- **Payment first** (owner ruling, 2026-08-11). Pickup orders are paid online before they are
  processed. There is no pay at counter and no pay later. PayMongo online prepay is therefore a
  launch blocker (Phase 1b), not the optional second rail it was planned as, and it is not built
  yet: what ships today is a counter checkout that the ruling disallows. See section 17 of
  `docs/IMPLEMENTATION-PROMPT.md`.

## Assets

The 357 MB source archive stays outside this repository. Two build steps turn it
into what the app ships, and both are re-runnable:

```bash
npm run build:static-images
```

```bash
bash scripts/build-hero-video.sh /path/to/nybb-vid.mp4
```

`public/img` (3.1 MB of WebP derivatives) and `public/video` (1.4 MB) are
committed because Phase 0 has no Storage bucket to serve them from. Once a
Supabase project exists, the third step moves the menu photography into it:

```bash
npm run ingest:images -- --dry-run    # prints what it would upload
npm run ingest:images
```

That uploads each derivative under a `randomUUID()` path, writes `image_url`
onto `menu_items`, `menu_options` and `branches`, and deletes the object the
row previously pointed at. After it has run, `public/img` is dead weight for
that environment.

The two jobs share `scripts/lib/image-pipeline.ts`, which holds the crop, the
corner-badge measurement and the alpha handling. They differ in destination and
in nothing else, which is the only way that claim stays true: a correction to
the badge scan cannot fix one and leave the other shipping a watermark.

## Database

```bash
npm run build:seed    # regenerate supabase/seed.sql from lib/catalog/
npm test              # applies 0001 to 0029 and the seed to a real Postgres
```

The migration tests run PGlite, which is Postgres compiled to WebAssembly, so
a CHECK that does not compile, a policy naming a missing function or a GRANT on
the wrong signature fails in `npm test` rather than on the day a project is
finally created. What it cannot prove is what a live PostgREST request returns:
`auth.uid()` and the three Supabase roles are shims. Read a green run as "the
schema is coherent", not as "RLS is proven".

`supabase/seed.sql` is generated. Edit `lib/catalog/`, then regenerate. It is
an upsert throughout, so it is safe to re-run: it reasserts the published
prices, which is the point of it, and leaves availability and branch operating
settings alone, because those belong to whoever is running the shop.

### What the audit of the archive changed

Three findings from working with the actual pixels, recorded because they
contradict or sharpen what spec section 5.6 assumed:

- **The flattened cutouts are not on `#EF6212`.** Sampling their backgrounds
  gives seven different oranges between `#d16828` and `#e67d39`, all duller
  than the brand value. Painting the brand orange behind them would show a
  seam, so product photographs are bled to all four tile edges and the tile
  colour only shows where there is no photograph at all.
- **The corner badge is much larger than an inset can handle.** On a 5184px
  original the orange triangle spans 1801px. A fixed percentage crop either
  left it showing or ate a third of the frame, so the pipeline measures the run
  of badge-coloured pixels along the top edge and crops downward rather than
  rightward, since these shots have headroom but no width to spare.
- **`2024/06/Untitled-design-47.png` is the Sports Lounge frontage.** The spec
  warned that one of the six location photographs was the closed venue without
  saying which. It is that one, it is excluded, and a unit test asserts on its
  provenance so it cannot come back in through a rename.

## External resources

| What | Where |
|---|---|
| Reference implementation | `C:\dev\zombeans-web` (read-only) |
| Verified image archive | `C:\dev\nybb-assets` (100 files, 357 MB, see `inventory.csv`) |
| Live site being replaced | `https://nybuffalobrads.com.ph` (TLS cert does not cover the apex domain) |

## Open questions

Section 28 of the implementation prompt holds the questions that only the owner can
answer. Central Bloc, IT Park, Lahug is now the selected pilot branch. Phase 1 remains blocked on
its real weekday hours and the kitchen's genuine throughput per fifteen minutes at peak. The
branch remains inactive until both are known, and `/contact` says plainly that hours are not
published rather than guessing them.

Phase 0 added four smaller ones, all marked in the code where they arise:

1. **Pasta pricing.** The live menu prints "156/159" with no labels. Read here
   as solo and meal, matching how the sides list labels its own two-price
   items. See `pricingNote` on those rows.
2. **Smokey BBQ chicken burger.** Listed as 309 with a separate "Meal 350".
   Read as one item with two sizes.
3. **One image identification.** `side-mozzarella-sticks` is identified by
   sight, not by filename. It is breaded sticks in a branded basket, and it is
   flagged `tentative` in the manifest.
4. **The favicon is illegible at 16px.** It is the business's own icon, the
   full wordmark cropped square, which turns to mush in a browser tab. A
   simplified single-letter or wing mark would fix it and is worth adding to
   the re-shoot ask.

The re-shoot ask from spec section 28 item 6 is now specific: **Cheezy, Salted
Egg and Smokey Barbecue** are the three flavours with no full-resolution
photograph. They currently ship from 300x300 thumbnails, which the badge crop
reduces to around 210px, and they are visibly softer than the other six in the
flavour grid.

## Not built yet, and deliberately

`/terms`, `/privacy` and `/refund` do not exist, so nothing links to them. They
are required before PayMongo will approve card payments (spec section 17) and
land with that work. The landing page carries an honest line saying online
ordering opens soon and pointing at the branch phone numbers, rather than a
button that does nothing.
