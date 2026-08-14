# Handoff, 2026-08-10 (Phase 2 Workspace RBAC and order operations)

Continuation prompt for a fresh session on `C:\dev\nybb-order`.

---

You are continuing work on **NYBB Order**, the pickup-only ordering platform for New York Buffalo
Brad's Hot Wings in Cebu. The project lives at `C:\dev\nybb-order`.

**Read first, in this order:** `AGENTS.md` (standing rules), `README.md` (live status), then the
relevant section of `docs/IMPLEMENTATION-PROMPT.md` (the full specification). Do not paste the spec
into chat, it is ~1,600 lines. Read it from disk.

**`DESIGN.md` before any visual work, and `PRODUCT.md` before any decision about who a screen is
for.** They are tracked now. `DESIGN.md` is the design system, derived from what shipped rather than
from what was intended, and it carries the named rules that were each learned expensively.
`PRODUCT.md` is the product record, and its load-bearing claim is that the three audiences are
co-equally primary, so a surface decides locally which one it serves rather than inheriting a
ranking.

## Where things stand

**Phase 0 and Phase 1a are complete, including the live customer OTP smoke test. Phase 2a has
started.** `npm run build`, `npm run lint`, `npm run typecheck` and `npm test` (672 tests in 58
files, 242 of them against a real Postgres, and migrations now run to `0044`) are green. The
customer OTP template uses `{{ .Token }}`, sign-in and sign-out work, and account/profile rows were
verified against staging. Central Bloc, IT Park, Lahug is the owner-selected pilot branch.

**`npm run typecheck` is new, and it is the only thing that reads `tests/`.** `next build`
typechecks the application and nothing else, so fourteen type errors accumulated in the test suite
over a fortnight without one red run, and two of them were mocks whose call signatures no longer
matched the functions they stood in for. That is the shape of error a test file can hold while
still passing every assertion. Run it alongside the other three.

**The payment-first ruling of 2026-08-11 replanned section 27, and Phase 1 is no longer complete.**
Pickup orders must be paid online before processing, so the shipped counter checkout is disallowed,
online prepay became Phase 1b (a launch blocker, not a Phase 5 option), and refunds became Phase 2b
(also a launch blocker, because the business now holds money before the food is made). Nothing
shipped needs unwinding, but do not read "Phase 1 complete" anywhere in this file as meaning
customers can order. They cannot, until 1b lands. Read section 17 before touching checkout or
payments.

Owner blockers now: the pilot branch's kitchen capacity, the no-show and refund policy under
payment first, PayMongo merchant approval (start this early, it is the long pole), and a ZenPOS
technical contact for `docs/zenpos-questions.md`.

**Phase 3's notifications are built on `feat/order-notifications`, and nothing has reached a real
handset.** Five things a session picking this up will otherwise spend an afternoon rediscovering:

- **`push_subscriptions` is not new.** It arrived in `0007`, thirty-one migrations before this
  work, along with `push_subscription_orders` and `notifications`. That is why the customer/staff
  transport split lives in a `transport` column ('web' or 'expo') rather than in a second table,
  and why the queue table was already the right shape when the expiry sweep needed one.
- **The customer half is Expo, the staff half is Web Push.** Not a hedge: the web storefront is
  being retired (`docs/mobile-app-transition.md`), so there is no customer browser left to hold a
  subscription, while the staff workspace stays in the browser until a native staff app exists.
- **`staff_push_targets` (`0038`) is the only caller of `staff_can_access_branch(profile, branch)`
  other than `current_staff_can_access_branch`, the wrapper every RLS policy goes through.**
  So a change to that function's rules changes who is told about an order, not only who can read
  one, and the notification path is the half nobody thinks of.
- **The expiry sweep is the one event that queues.** `0039` is the only thing in the schema that
  inserts into `notifications`. Every other notification is sent inline under `after()` on the
  request that caused it. The queue exists because a `pg_cron` sweep has no request to hang work
  off, not because sending is generally asynchronous here.
- **There is no retry, deliberately, and a `failed` row is not proof nobody was told.** A send that
  fails is not tried again. `0007`'s `sending_started_at` column exists so a later sweep can tell
  "in flight" from "stuck", that sweep does not exist yet, and `lib/push/drain.ts` says at its top
  where it would belong. Whoever builds it must read the comment at `drain.ts:100-108` first: if a
  notification was delivered and only the bookkeeping write afterwards failed, the row reads
  `failed`, and a naive retry would tell that customer the same thing twice.

**The storefront now renders dynamically, on purpose.** A nonce CSP and static generation are
mutually exclusive in Next, and for one release that conflict left the production build blocking
every script and hydrating nothing. `await connection()` in `app/layout.tsx` is what resolves it.
Read trap 11 before touching rendering, caching or `proxy.ts`, and trap 12 before believing the
browser pane about anything that waits for a frame.

- `lib/catalog/` holds the full Hot Wings menu, nine wing flavours, the Level of Hotness scale with
  its variation-dependent pricing, nine branches, and a generated image manifest. Its types mirror
  the Phase 1 tables.
- `components/` and `app/(storefront)/` render the landing, `/menu`, `/menu/[category]`, `/about`
  and `/contact`, all reviewed in a browser at 375px and 1280px.
- **`components/ui/Button.tsx` is the control system, and it is not optional.** It exports
  `Button`, `ButtonLink`, `buttonStyles` and `PRESSABLE`, alongside `QuantityStepper` and
  `TextLink` in the same folder. `ActionLink.tsx` is deleted. Every control on the site goes
  through these: no hand-rolled `<button>`, and no bare underline on anything that performs an
  action rather than navigating. Destructive actions take `variant="danger"`, which is quiet at
  rest and turns red on engagement, so "Empty the cart" does not shout at somebody who is only
  reading their order. The focus ring colour is derived from the background utility on the
  surrounding surface, so never set one per control.
- `supabase/migrations/0001` to `0044` are written, pass the local migration suite, and are
  **all applied to the Supabase project as of 2026-08-14.**
  **A green migration suite says the migrations APPLY, not that anybody applied them.** That
  distinction cost an afternoon: the branch's whole notification feature was built, reviewed and
  committed against a database that was still at `0029`, and nothing in the test loop could
  notice, because PGlite builds the schema from the files every run. Before debugging any RPC
  that "does not exist", run
  `npx supabase migration list --db-url "$SUPABASE_DB_URL"` and compare.
  `0022` and `0033` both needed a history repair, having been applied through the dashboard SQL
  editor without being recorded. See trap 15. **Verify before repairing**: for `0033` that meant
  checking every object existed, that the md5 of every function body matched the file, and that
  eleven grants were what the file asks for. A repair on an assumption writes the divergence into
  the history permanently.
  Spec section 6 is the design and **section 6.6
  records the ten places the schema departs from it**, with reasons. Read 6.6 before changing
  anything in there.
- `lib/menu/` is the source-agnostic menu reader added in Phase 1. `getStorefrontMenu()` returns
  `get_storefront_menu()` when Supabase is configured and the static catalog when it is not, in one
  runtime shape. Pages pass the result down; no component imports the catalog any more.
- `supabase/seed.sql` is generated from `lib/catalog/` by `npm run build:seed`. Do not edit it.
- `scripts/ingest-legacy-images.ts` is the Storage ingest. It and `build-static-images.ts` share
  `scripts/lib/image-pipeline.ts`.
- `tests/sql/` runs the migrations and the seed against Postgres compiled to WebAssembly (PGlite).
  242 of the 672 tests live there. **Read trap 14 before trusting a green run about grants:** the
  harness only sees a platform behaviour it has been told to shim.
- **`DESIGN.md` and `PRODUCT.md` are tracked and are the design system and the product record.**
  Read `DESIGN.md` before any visual work. `.impeccable/design.json` is the same system in machine
  form and is tracked with it; `.impeccable/live/config.json` is tracked too. Everything else under
  `.impeccable/` is a generated run artifact (critique reports, the detector cache, live session
  journals) and is gitignored, because it belongs to the machine that produced it rather than to
  the project. The `.gitignore` block that does this is deny-all-then-allow, which is the only
  shape that keeps a new artifact type out by default.
- **The landing hero pass has landed** (`8e9d462`, `4bc6173`). `main` is at `4bc6173` and
  everything, including this, is committed and pushed.

  **Correcting the previous handoff:** it said "everything through the order tracking page is
  committed and pushed" while two commits sat unpushed on `design/landing-hero-pass`. That is the
  one respect in which it was stale, and it is worth noticing how: the sentence was true when
  written and became false the moment a branch was cut. A handoff that claims a push state has to
  be rewritten by whoever merges, not by whoever wrote it.

  What the two commits did:

  - **The hero states the heat scale; the band prices it.** They used to be the same object drawn
    twice within two screens, which is a repeat rather than a statement and its restatement, and it
    cost the band its reveal: five stops drawing themselves is only a moment if the object is new
    when it arrives. So they were split by *job*. `components/site/HeroHeat.tsx` is the ramp, still,
    no prices. `components/site/HeatScale.tsx` is now a priced list of five rows, horizontal at
    every width, and it keeps the site's only authored animation because it is where somebody is
    choosing. Both rules are recorded in `DESIGN.md` under Named Rules.

    **Superseded.** `HeroHeat.tsx` no longer exists. Splitting by job kept two heat surfaces on one
    page, and a later pass cut the hero one entirely: the shape was not the problem, the
    restatement was. The hero now carries the mural instead (`components/site/HeroWall.tsx`) and
    `DESIGN.md` records The One Heat Surface Per Page Rule in place of The Two Heat Surfaces Rule.
  - **Short viewports key on height, never on width.** A landscape phone at 844x390 is past every
    width breakpoint while having under 300px below the header, so a width-keyed rule hands it the
    desktop treatment and put the primary CTA 113px below the fold. The hero's short-viewport rules
    are `max-height` queries. This is now a `DESIGN.md` rule and a `do` in `design.json`.
  - **The hero sets `text-nybb-bone` on its container.** Anything in there that does not name its
    own colour inherits `--foreground`, which the move to a light page ground turned into ink: near
    black type on a near black wash. The level names walked straight into this while their
    percentages, which do name a colour, rendered fine, so DOM-counting measurement passed it and
    only a screenshot caught it.
  - The second CTA is "Call a branch", which retires a real collision (the header's "Branches" goes
    to `/contact`, this goes to the section on this page) and makes the disclosure's remedy
    reachable from where the disclosure is read.
  - The hero poster is fetched once, not twice: the still stays mounted under the video instead of
    the video carrying a `poster` attribute of its own.

**The Supabase project exists and 0001 to 0022 plus the seed are applied to it. Migration 0022
still needs its focused staging smoke test.** Project ref
`ktltawglqblcqduavcre`, region `ap-southeast-1`. `.env.local` holds the URL, the anon key, the
service role key and `SUPABASE_DB_URL`, and is gitignored.

Codex worktrees do not inherit ignored files. `npm run dev` therefore runs
`scripts/link-worktree-env.mjs` first. When `.env.local` is missing, it creates a hard link to the
primary Git worktree's ignored file, with a copy fallback for filesystems that cannot hard-link.
It never prints credential values. Keep using `npm run dev` rather than calling `next dev`
directly, or sign-in can appear disconnected in a new worktree.

**Applying it immediately found a real hole, which is the entire argument for doing it before step
8.** See migration `0015` and trap 14. Summary: every function in `public` was executable by `anon`,
including `rate_limit_hit`, and the whole test suite was green while it was true.

Two things about the connection, both learned the slow way:

- **The direct connection does not work from this machine.** `db.<ref>.supabase.co` has an AAAA
  record and no A record, so it is IPv6 only and fails with `ENOTFOUND` rather than with anything
  that names the real problem. Use the **session pooler**, which is IPv4:
  `postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`.
  Port 5432, not the transaction pooler's 6543, because these are DDL migrations.
- **`--include-all` turned out not to be needed.** The earlier handoff flagged the `0001`-style
  filenames as a risk; the CLI reads them fine and listed all fourteen in order. That risk is
  closed.

Two commands, and neither needs `supabase link` or a `config.toml`:

```bash
set -a && . ./.env.local && set +a && npx supabase db push --db-url "$SUPABASE_DB_URL"
```

```bash
set -a && . ./.env.local && set +a && npx supabase db query --db-url "$SUPABASE_DB_URL" -f supabase/seed.sql
```

**The seed needs one transformation to go through `db query`**, which sends a single prepared
statement and refuses multiple commands. `seed.sql` is nine `insert`s inside a `begin`/`commit`.
Replacing those two markers with `do $seed$ begin` and `end $seed$;` makes it one statement and
keeps the atomicity the transaction was there for. Do **not** edit the tracked file to do this, it
is generated; transform a copy. There is no `psql` on this machine.

**What is proven against the live project**, as opposed to against PGlite:

- `get_storefront_menu` returns the ten categories over PostgREST as `anon`, and the storefront
  genuinely reads it. Proved by writing a string into `menu_categories.blurb` that exists nowhere in
  `lib/catalog/`, loading `/menu` from the production build, finding it in the server-rendered HTML,
  and then restoring it by re-running the seed. Both halves matter: the static fallback renders an
  identical page, so seeing a menu proves nothing by itself.
- On 2026-08-10 the owner selected Central Bloc as the pilot and authorized a temporary staging
  schedule. The then-current 11:00 to 22:00 schedule was only a staging assumption. On 2026-08-11
  the owner confirmed Central Bloc is open 24/7. Migration `0026` must be applied before storing
  that fact exactly. Kitchen capacity is still unconfirmed; do not treat the current defaults of
  20 minutes preparation, 15-minute windows and six orders per window as production values.
- `rate_limit_hit` returns **HTTP 401, `42501 permission denied`** to `anon`, and is callable by
  `service_role`. That is the fix in `0015` proven at the PostgREST layer rather than in `pg_proc`.

Round trip latency to `ap-southeast-1` was 120ms to 530ms per RPC from here.

**The staging project and `.env.local` now exist.** Creating the second project for production is
still the owner's action because it lives in the owner's Supabase account and is a billing choice.
The procedure below remains useful for that second project. Customer OTP and browser-to-PostgREST
smoke tests are complete on staging, including Super Admin staff sign-in.

Two more reasons not to leave it later than that:

- **RLS and grants are the least tested part of this codebase, and the harness says so in its own
  header.** PGlite proves the schema is coherent. It cannot prove what a PostgREST request returns,
  because `anon`, `authenticated` and `auth.uid()` are shims there. Seven functions are now granted
  to `anon`, two of them (`place_order`, `get_order_by_tracking`) doing real work with real
  consequences, and none has ever run as a real anonymous role.
- **The authenticated checkout round trip has not been smoke-tested.** `place_order` is proven
  against Postgres and the Server Action is proven at its boundary, but the full signed-in request
  still needs the dashboard email template and an active test pickup window.

**Creating the project does not need the section 28 answers.** Apply the migrations and the seed,
and the default state stays honest: `store_hours` is empty, all nine branches are
`is_active = false`, and every surface says "Pickup times are not open yet". Central Bloc is the
selected pilot. Staging currently carries a temporary 11:00 to 22:00 daily override so checkout
can be tested, and migration `0026` is required before replacing it with the confirmed 24/7
schedule. Production must still wait for confirmed capacity. **This retires "do not apply the
migrations" below**, which was written when there was nowhere to apply them to. Two projects
(staging and production) if budget allows, per spec section 25.

### Creating a project, and applying the migrations plus the seed

**Steps 1 and 2 are the owner's and cannot be delegated to a session.** Everything from step 3 is a
command an agent can run once the values in step 2 exist.

1. **Create the project** at `supabase.com/dashboard`. Region **Singapore (`ap-southeast-1`)**, which
   is the nearest to Cebu; anything further adds a round trip to every PostgREST call on the
   critical path. Store the database password in a password manager at the moment it is generated,
   because the dashboard shows it exactly once. Two projects (`nybb-staging`, `nybb-prod`) if budget
   allows, per section 25; one is enough to unblock step 8, and the second can follow.
2. **Copy four values** from Project Settings: the project URL, the anon/publishable key, the
   service role key, and the connection string. Put the first three in `.env.local` under the names
   `.env.example` already uses (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`). `.env.local` is gitignored. **The service role key is a secret that
   bypasses RLS entirely**: it belongs in `.env.local` and in the Vercel environment, never in a
   client component and never in a commit.
3. **Apply the migrations.** Verified reachable from here: `supabase db push --db-url` works without
   `supabase link` and without a `supabase/config.toml`, and the CLI is present at 2.111.0 via
   `npx`. Use the **session pooler** connection string, and percent-encode the password.

   ```bash
   npx supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" --include-all
   ```

   Run it with `--dry-run` first. **`--include-all` is not optional here and this is the one open
   risk in this procedure.** These migrations are numbered `0001` to `0022`, not in the CLI's usual
   14-digit timestamp format, so the remote history table will contain none of them and the CLI's
   default is to push only what it recognises as new. This was not provable from here: it needs a
   reachable Postgres, Docker was not running and there is no `psql` on this machine. **Check the
   dry run output names all sixteen files, in order, before running it for real.**
4. **Apply the seed.** There is no `psql` on this machine and `--include-seed` reads its path from a
   `config.toml` that this repo deliberately does not have, so the shortest honest route is to paste
   `supabase/seed.sql` into the dashboard SQL editor. It is 284 lines and it is an upsert
   throughout, so a re-run is safe and is in fact the point of it. If you would rather the CLI did
   it, `supabase init` generates the `config.toml` that `--include-seed` needs, but review that file
   before committing it: it is a few hundred lines of local-development defaults that nobody here
   has read.
5. **Then prove the thing PGlite cannot.** This is the whole reason the project comes before step 8,
   so do not skip to the feature. Load `/menu` against the real project and confirm the reader takes
   the database path rather than the static fallback. Then place an order end to end from the
   browser against the production build on port 3001. That is the first time a request will have
   gone browser to PostgREST to Postgres and back, and it is the seam where a wrong argument name or
   a missing grant hides. Expect to find something.

   To place that order you have to open a branch, and **the owner's section 28 answers are still
   missing**, so do it the way the "Do not" section already requires: switch a branch on and give it
   hours **in a scratch SQL statement against staging**, place the order, then put it back. Never in
   `seed.sql`, and never in a way that survives into production, because a branch marked open is a
   promise to a customer that somebody is standing at that counter.

## Next work: Phase 1, ordering

Spec section 27. In order:

1. ~~`get_storefront_menu()` as migration `0011`.~~ **Done.** Granted to `anon`, and
   `tests/sql/storefront-menu.test.ts` proves the claim rather than asserting it: the function
   output, run through the real zod parse and the real hydration, deep-equals the static
   projection.
2. ~~The wings configurator (spec section 10, N5).~~ **Done**, at
   `/menu/[category]/[item]`. It is one component for every item rather than a bespoke wings page:
   a group whose options all carry photography renders as a visual grid, a group carrying heat
   percentages renders on the meter, anything else is a priced list. Keying it on the data rather
   than on `slug === "wing-flavour"` is what keeps it bespoke after the owner edits the menu in
   Phase 4. The Add button is deliberately disabled until the cart exists, and says so.
   The hero photograph follows the selected flavour, which is why the configurator owns both
   columns and the page hands it the static copy as a `details` slot. `previewImage()` lives in
   `lib/menu/preview.ts` rather than in `lib/menu/index.ts` on purpose: index re-exports
   `getStorefrontMenu`, which pulls in `server-only`, and a client component importing it fails
   the build.
3. ~~Small-screen pass at 320 to 390.~~ **Done** (`12460e1`). Worth knowing how, because the
   method found the real defects and cleared two suspected ones: a throwaway Playwright script
   loaded seven pages at 320, 360 and 390 and reported sideways scroll, text clipped by its own
   box, type under 12px, and per-row card geometry. Nothing overlapped and the category rail's
   overflow was a scrolling rail doing its job; what was real was name plates measuring 44px to
   95px in one grid. Menu tiles are now full height flex columns so the grid equalises a row, and
   the price is pinned with `mt-auto` so prices in a row share a line. Group cards by top
   coordinate when checking heights, or you will compare tiles from different rows and chase a
   phantom.
4. ~~**The cart.**~~ **Done**, at `/cart`, with `lib/cart/` and `components/cart/`.

   - **It stores slugs, not products.** A stored line is item, variation, chosen options and a
     quantity. No name, no photograph, no category: those are read from the live menu every time
     the cart is opened, which is what makes a cart left overnight correct in the morning.
   - **`resolveCart()` is the join, and it reports.** A line whose item, size or option has left
     the menu is dropped *and named on screen*, because a cart that quietly shrinks between
     visits reads as the site losing the order. It also reprices, so a stale figure survives
     exactly as long as it takes the customer to open the cart.
   - **The one stored price is deliberate and matches the schema.** `unitPriceCents` on a stored
     line is the same idea as `cart_items.unit_price_cents`: display only, so the sticky bar can
     show a total on pages that never loaded a menu. It is written *by* `line-pricing.ts`, so it
     is a cache and not a second implementation. `lib/cart/lines.ts` does not add money up.
   - **Identity is `lineKey()`**, sorted and canonical, so the same wings configured in a
     different order merge into one line instead of arriving in the kitchen as two tickets.
   - **The store is a module, not a context.** `useSyncExternalStore` over localStorage, so the
     header, the sticky bar and the cart page share one cart without turning the storefront into
     a client tree. `loaded` is part of the snapshot on purpose: without it, "empty" and "not read
     yet" are the same state and the cart page flashes its empty message over a real order.
   - **`reconcileCart()` lives in the store, not in the view.** Writing the correction back is
     what destroys the evidence for the notice, so one place owns both. It settles: the notice
     shows on the visit that earned it and not on the next one. An earlier version did this with
     `setState` inside an effect and the React compiler lint rejected it, correctly.
   - **Emptying the cart is undoable, and that is why it is allowed to be one tap.** The store
     keeps the discarded `Cart` in memory (never in localStorage: an undo that survives a reload
     is a cart that comes back from the dead) and the view offers "Undo" until the next cart
     write clears it. A confirmation dialog asks a customer to think about a decision that costs
     nothing to reverse; an undo lets them find out.
   - **The sticky cart bar hides itself on `/cart` and `/checkout`.** A bar advertising the cart,
     pinned over the cart, is a bar covering the thing it is pointing at. It reads the pathname
     rather than being conditionally rendered by each page, so a new route that shows the order
     does not have to remember.
   - `customer_carts` is untouched. It is keyed by `auth.users(id)` and customer sign-in is the
     last step of Phase 1, so the sync arrives as a second writer of the same `Cart`.

   Verified at 320 and 375 in the pane, and end to end against the production build in Chrome:
   the configurator prices live, Add to cart writes the configured line, the confirmation and the
   header badge follow it, the cart page reprices it from the menu, and `dynamicParams = false`
   still returns 404 for an unknown item now that the route renders dynamically.
5. ~~**Pickup slot picker.**~~ **Done**, as migration `0012`, `lib/slots/` and
   `components/checkout/`, reachable at `/checkout` from the cart.

   - **`get_pickup_slots()` is the only implementation of the grid**, and there is no TypeScript
     copy. The picker renders what the database returns and `place_order` will book against the
     same function, so the screen cannot offer a minute the transaction would then refuse.
   - **It calls `branch_is_open_at()` rather than reading `store_hours`.** 0002 says that function
     is the one definition of "open"; re-deriving windows here would be a second one, and the two
     would part company the first time somebody touched a midnight-crossing shift. It costs two
     calls per candidate window. If that ever matters, cache it, do not fork it.
   - **The grid is anchored to the branch's local midnight, not to now.** `pickup_slots` is unique
     on `(branch_id, slot_start)`, so two customers a minute apart have to compute identical
     boundaries or they book two rows for one window and the capacity check never binds.
   - **A window has to fit entirely inside opening hours**, tested at its start and one second
     before its end, and the horizon bounds when a customer may *collect*, so the last window ends
     at the horizon rather than starting there.
   - **The empty state is deliberate.** `unavailableReason` is one of `no_branch`,
     `no_hours`, `not_accepting`, `closed_now` or `fully_booked`, and the screen says which. Two of
     those are the expected state of this project rather than faults, so the copy reads as "not
     open for this yet" and points at the branch phone numbers. Staging now returns Central Bloc
     windows under the temporary schedule described above.
   - **A full window stays on screen and goes flat**, per spec section 10 N1. A window that
     vanishes reads as a broken page; a window visibly taken reads as a busy shop.
   - `/checkout` is half a screen and says so. Name, phone and payment land with `place_order`,
     because a form that collects a phone number and cannot place an order is worse than no form.

   23 SQL tests cover generation against real Postgres, all with an injected clock, including the
   Friday 18:00 to 02:00 shift. 27 unit tests cover the formatting, all in the branch timezone.
6. ~~**`place_order`.**~~ **Done**, as migration `0013`, `lib/checkout/`, `app/actions/checkout.ts`
   and the rest of the checkout screen. `/checkout` is now a whole screen: pickup window, name,
   phone, optional email and note, and a Place order button that produces a pickup code.

   - **It is the only place a peso is decided, and it decides them by asking.** It calls
     `resolve_price_list_id()`, `resolve_variation_price_cents()`, `resolve_option_price_cents()`,
     `branch_accepts_orders()` and `get_pickup_slots()` rather than restating any of them. The
     last one is the load-bearing one: the picker renders what that function returns and
     `place_order` books against the same call, so the screen cannot offer a minute the
     transaction would refuse.
   - **The payload carries no money at all.** Item slug, variation slug, option slugs, quantity,
     a pickup minute, a name and a number. `tests/unit/checkout.test.ts` proves it by handing the
     schema an object with prices in it and asserting the string "cents" does not survive to the
     payload. There is a matching SQL test that prices a cart with `lib/menu/line-pricing.ts` and
     with `place_order` and asserts the same peso.
   - **The window is booked in the same transaction as the insert**, through an upsert on
     `pickup_slots`. `pickup_slots_within_capacity` is the guard, not the `remaining` figure the
     picker showed: that number can be invalidated a millisecond later. The loser of a race gets
     no order, no items and no payment row, which there is a test for.
   - **Idempotency is `checkout_attempts`, claimed before anything else can have a side effect.**
     The browser mints one uuid per checkout in a ref and sends it again on every retry. A replay
     returns the stored result, including the tracking token, which is captured in the same
     transaction so a guest order cannot lose its private link.
   - **The rate limit is on an identity the database can see for itself**, `auth.uid()` or the
     phone number, never a key the caller supplies, because `place_order` is granted to `anon`
     and anything in the payload is something an attacker picks. It fails open per 0008. Note
     what it therefore counts: orders that *commit*, since a rejected attempt rolls back its own
     increment. **The IP dimension is now built**, in `lib/rate-limit/`, and closes spec section 22
     item 6. See the note under step 7 below.
   - **Guests can order, and that is a documented divergence from the spec, not an oversight.**
     Section 17 now carries the correction and the reasoning: counter is the only rail while
     PayMongo is dark, so requiring an account would close ordering rather than narrow it. It is
     reversible in one `if` and it is the owner's call.
   - **Every refusal is a sentence, and `lib/checkout/messages.ts` is where the machine codes
     become one.** There is a test that fails if a code is added to `0013` without an answer here,
     because falling through to "something went wrong" for a problem with a real answer is a quiet
     way to ship a broken screen.
   - `/checkout` was measured at 375 and 1280 against the production build. No sideways scroll,
     nothing clipped, fields at 16px so iOS does not zoom the page, 46px tall.
7. ~~**Order tracking page** with the pickup code.~~ **Done**, as migration `0014`, `lib/orders/`,
   `components/order/OrderTracker.tsx` and `/order/[code]`.

   - **The URL is a bearer credential, and it is paid for in three places.** `?t=` carries the
     tracking token, and whoever holds the link can read a name, a phone number and the code that
     claims the food. That is the only way a guest who never signed in reaches their own order. So
     the page is `noindex`, `Referrer-Policy: strict-origin-when-cross-origin` in `next.config.ts`
     keeps the query string off other hosts, and **nothing logs the token**, ever. Break any of
     those three and the trade stops being worth making.
   - **A wrong token and a code that never existed get the same answer**, because a six character
     code from a 31 character alphabet is guessable at scale by design, and a difference between
     those two answers would make the code space worth scraping. There is a test asserting the two
     are literally equal.
   - **"Missing" and "unavailable" are different, though.** An outage says nothing about whether an
     order exists, and telling a customer "we cannot find that order" when the database is briefly
     unreachable is how they order the same food twice. `OrderLookup` has three states for that
     reason, and the page says something different for each.
   - **It reads the snapshots, never the menu.** A rename cannot rewrite what a placed order says
     it was, which is what the `*_snapshot` columns in 0005 are for. Tested.
   - **The whole status ladder updates live.** Migration `0021` emits a data-free public Broadcast
     signal on the guest order's unguessable tracking-token topic. The signal refreshes the Server
     Component, which reads the full payload again through `get_order_by_tracking()`. Signed-in
     account links subscribe through their existing RLS-protected order row. Both keep a
     20-second polling fallback for a dropped socket.
   - `/order/[code]` was measured at 375 and 1280 against the production build with a fixture in
     place of the reader. The step ladder needed a responsive pass: four labels in 12px caps do not
     fit four columns at 375, and 12px is the floor, so the phone gets the four bars plus "Step 3
     of 4, Ready" and the full ladder returns at `sm`. Screen readers get every rung at every
     width.
   **The address dimension of the rate limit landed after this**, in `lib/rate-limit/` and
   `lib/supabase/admin-client.ts`, which closes spec section 22 item 6. It was buildable without a
   project because 0010 had already granted `rate_limit_hit` to `service_role` and said in a comment
   that it was for exactly this caller.

   - **It is defence in depth, not a security boundary, and the comment says so at the top.** Every
     header it can read is supplied by whatever spoke to the server last. Behind a proxy that
     overwrites them, which Vercel does, that is worth something; served directly, an attacker
     rotating `x-forwarded-for` evades it entirely. The real control stays the database limit, on an
     identity Postgres verifies for itself. Never let this become the only thing guarding something
     expensive.
   - **It validates before it counts, and that is not tidiness.** `rate_limits` is keyed on a
     primary key and nothing prunes it, so a caller who can invent keys adds a permanent row per
     request. An unparseable header is treated as no address at all. `node:net`'s `isIP` does the
     parsing, rather than a regex written here.
   - **Three different bugs collapse unrelated people into one bucket, and each one is a
     self-inflicted outage.** A missing address bucketed as "unknown", an IPv4-mapped IPv6 address
     bucketed on its all-zero /64, and a forwarding chain read from the wrong end. In every case the
     shared bucket fills and the site then refuses orders from people who never sent a request.
     There is a test for each.
   - **IPv6 counts by /64.** A residential customer is routinely handed one, so counting full
     addresses would let a single connection present billions of identities.
   - **The key is a hash and the honest limit of that is written down.** IPv4 is four billion
     values, so a digest is reversible by anyone willing to enumerate it. It removes the casual
     read, not a determined one; what protects the table is that it has no policy and the function
     is granted to `service_role` alone.
   - **20 per 600 seconds, and the figure is set by who shares an address rather than by what a
     script can do.** `PRODUCT.md` has the customer ordering office lunch from IT Park, which is one
     office NAT at a lunch peak, and Philippine carriers put very large numbers of subscribers
     behind CGNAT. Guessing low refuses real orders. Revisit once there is traffic to look at.
   - **`RATE_LIMITED_ADDRESS` needed its own sentence.** The existing `RATE_LIMITED` says "several
     orders from this number", which is fair when the identity is the customer's own phone. This one
     can refuse somebody on mall wifi who has done nothing, so it names the shared connection, does
     not accuse them, and leaves the branch phone as a way to order now.
   - It counts **requests**, where the database limit counts orders that **commit**. That is the
     point of having both: a script hammering checkout with payloads that all get refused is
     invisible to the database limit.
   - **Untested against a real PostgREST**, like everything else here. What needs proving on the day
     the project exists is that `service_role` may call `rate_limit_hit` and `anon` may not.

8. ~~**Customer email OTP**, the last step of Phase 1.~~ **Done and smoke-tested.** The Supabase
   email body uses `{{ .Token }}` and Mailtrap Sandbox delivered the six-digit code. Sign-in,
   sign-out, redirects, account rows and profile rows all worked end to end.

   - OTP request and verification limits reuse `withinAddressLimit` under independent hashed
     email namespaces, so ordering too fast cannot block asking for a sign-in code and one email
     cannot fill another email's bucket.

   - The browser forwards a fresh access token to `placeOrder`; the action builds a stateless
     authenticated Supabase client, with a read-only cookie fallback. `auth.uid()` inside
     `place_order` now stamps `orders.user_id`, and a SQL test proves it. No service-role client
     ever performs the order RPC.
   - `/account` carries saved pickup details and signed-in order history. History links omit the
     guest tracking token because `get_order_by_tracking` accepts the signed-in owner.
   - `CartSync` merges a carried-in guest cart once on sign-in, then keeps the account cart in
     sync without resurrecting deleted lines or leaking one account's cart into another on a
     shared phone.
   - `proxy.ts` refreshes both customer and staff sessions while preserving the nonce-based CSP.
     The cookie families remain distinct. Storefront session reads prefer the customer family and
     fall back to the staff family, so Workspace users remain signed in without duplicating tokens.

## Phase 2 started: staff boundary and workspace shell

- `/login` is now the only OTP entry point. It checks the verified email against the configured
  Super Admin and active staff profiles, then writes either the customer cookie family or the
  isolated `nybb-staff-auth` family. Authorized accounts go to the Workspace. Unauthorized
  accounts remain customers, and `/workspace/login` redirects to the regular login page.
- A signed-in customer who manually enters `/workspace` passes through `/auth/workspace`. That
  route verifies the Auth user, rechecks current database access, transfers only an authorized
  session into the Workspace cookie family, and returns everyone else to `/account` with a denial
  notice.
- `lib/staff/roles.ts` defines cashier, kitchen and manager defaults. Effective permissions are
  role defaults plus the existing per-person override rows.
- `lib/staff/session.ts` is the staff data access layer. Every workspace request verifies the Auth
  user and re-reads the active profile plus overrides through the staff session and RLS. The
  service-role client is not used for workspace page data.
- Migration `0017_staff_email_access.sql` joins `profiles` to `auth.users` for the pre-OTP email
  check. It revokes Supabase's explicit default function grants from `anon` and `authenticated`,
  then grants only `service_role`. The SQL suite proves those grants and the active-only behavior.
- The one Super Admin is bootstrapped from `SUPER_ADMIN_EMAIL` after OTP verification. The profile
  write records an audit row. There is still no in-app path to create another admin.
- `stevenvillacampa@gmail.com` is configured as the staging Super Admin. On 2026-08-10 its OTP was
  verified through the real staff form, `/workspace` rendered with no error overlay, the Auth email
  was confirmed, and the active `admin` profile plus `staff.super_admin_bootstrapped` audit row were
  verified directly in staging.
- `/workspace` has its own dark, landscape-friendly chrome and live counts for New, Preparing,
  Ready and Claimed. It deliberately inherits none of the storefront mural, footer, cart or
  customer navigation.
- Browser verification passed at 375 by 812 and 1024 by 768. `/workspace` redirects to staff login
  without a staff cookie, the login has no horizontal overflow or framework overlay, the public
  home still loads, and Chromium reported no console errors.
- `/workspace/orders` now renders New, Preparing, Ready and Claimed today. It subscribes to order
  changes through Supabase Realtime and retains a 20-second polling fallback.
- `/workspace/orders/history` is protected by `orders:view` and reads through the staff session.
  Migration `0022` independently limits direct reads to the staff member's allowed branch. The
  page includes today's closed orders, date and status filters, bounded customer search, test
  badges, item snapshots, closure details, and paid totals that exclude test orders. It never
  selects pickup codes or tracking tokens.
- Migration `0018_staff_order_ops.sql` adds one locked, idempotent transition RPC. Start records
  accepted and preparing events together, Ready stamps the kitchen milestone, and Claim verifies
  the pickup code while capturing a due counter payment. Branch scope, explicit permission denial,
  online payment gating, status events and audit rows are all enforced inside the transaction.
- Seven focused SQL tests cover the grant boundary, replay safety, payment gate, permission
  override, branch scope, pickup-code failure and counter-payment claim.
- Staging order `NY-VFY248` is an `is_test=true` counter order created without activating a branch.
  The real staff form moved it through Start, Ready and Claim with no browser console errors. It is
  now Claimed and Paid at Counter. Direct database verification found all four lifecycle stamps,
  the initial placement plus four transition events, and the three attributed staff audit rows.
  The browser review also caught that test rows lacked a visible badge; the board now renders one.
- Migration `0021_order_tracking_realtime.sql` adds customer-safe status broadcasts. It sends no
  order or customer data, only a change signal, and its trigger function is not executable by any
  application role. Staging test order `NY-RTM234` moved through Start, Ready and Claim in the
  Workspace while an already-open guest tracking page followed each transition in about two
  seconds without a refresh. Both browser consoles stayed clean.
- Migration `0022_staff_authorization_hardening.sql` closes the direct Data API bypass behind the
  Workspace UI. RLS now enforces resolved permissions and branch scope, owner and catalog writes
  stay closed until an audited RPC exists, legacy default privileges are revoked for future
  objects, and configured Super Admin rotation is atomic with its audit rows. It also pins the
  tracking trigger to `pg_catalog`. Role-switched PGlite tests prove the order and menu policies.
  This migration is locally green and applied to staging. Its focused smoke test is still pending.
- Migration `0019_workspace_access_admin.sql` adds audited list and change RPCs for Workspace
  access. Only an active admin can execute their logic. Anonymous execution and direct
  authenticated writes to `profiles` are denied. Self-demotion and changes to another admin are
  rejected in the database.
- `/workspace/team` is visible only to the configured Super Admin. It grants cashier, kitchen or
  manager access to an existing Auth account, changes roles, revokes access and restores access.
  A person without an Auth account must sign in once through the regular website before they can
  be granted access.
- Staging and local migration history now continue through `0022`. Direct database verification
  confirms the two admin RPCs are executable by `authenticated`, not by `anon`, and that
  `authenticated` no longer has direct `profiles` update privilege.
- The first live Team-page load caught a Supabase-only type mismatch: `auth.users.email` is
  `varchar`, while `admin_list_workspace_access()` promises `text`. Migration `0020` adds the
  explicit cast, and the PGlite Auth shim now uses `varchar(255)` so the harness reproduces the
  production type. The fixed Team page lists the configured Super Admin with no current overlay.
- The regular `/login?next=/workspace` flow sends the configured Super Admin to the Workspace.
  The storefront now recognizes that isolated staff session as the same signed-in account. It
  does not copy the refresh token into the customer cookie family, and Workspace authorization
  continues to use only the staff family plus a fresh database role check.
- The storefront identity control says Workspace for active staff and admins, Account for regular
  customers, and Sign in for guests. `/workspace/profile` gives staff and admins a protected view
  of their own email, role, branch access, and resolved permissions.
- Workspace landing and navigation now follow resolved permissions. Kitchen staff land on Orders,
  staff with neither dashboard nor order visibility land on Profile, and the layout hides links a
  role cannot open. This prevents the former `/workspace` self-redirect loop for Kitchen users.

**Staging now carries `0001` to `0025`, and the audit page is verified against it in a browser.**
`0023` and `0024` were applied on 2026-08-11 after repairing the migration history for `0022` (see
trap 15). Direct queries confirm the checklist reads 24 of 24, both new policies read back exactly
as written, `staff_set_order_status` now resolves permissions through
`current_staff_has_permission` and no longer reads `staff_permission_overrides` itself, and the
grants survived the replace (`authenticated` yes, `anon` no). The backfill attributed 15 of the 20
existing audit rows to a branch and left 0 order-targeted rows unattributed; the 5 without a branch
are the company records, which is the intended split. `/workspace/audit` was then loaded as the
configured Super Admin and shows the two `NY-` order transitions with their actor, the Super Admin
badge, "Central Bloc, IT Park", and a change detail carrying only `from`, `to` and
`counterPaymentCaptured`.

**The redaction masks a staff phone number, and that was a decision rather than a default.** The
access-change and Super Admin provisioning RPCs record `to_jsonb()` of the profile row, which carries
`phone`, so a staff member's number appeared in the detail of every entry about their account. It is
not a credential, and an audit trail that hides what changed is not one, so it shipped visible with
the trade written down. The owner reviewed it on 2026-08-11 and chose to mask it. What the entry
still says is that the change happened, who made it, and to whom, which is what the trail is for.

The rule now covers `phone` and any key ending `_phone`, so a future `customer_phone` in a diff is
caught too. **An email address is deliberately not covered**: no diff in this schema carries one,
because `profiles` has no email column and the address lives in the Auth directory. If an RPC ever
starts logging one, decide then rather than assuming the suffix rule caught it.

- Migration `0023_audit_log_branch_scope.sql` closes the gap `0022` opened in the
  audit trail. `0022` widened `audit_logs` from "admin only" to "anyone holding
  `audit:view`", which by role default is every manager, and left the read
  unscoped by branch. So a manager assigned to one site could read every site's
  staff activity through the Data API, while the orders those entries described
  were branch scoped one policy above. The same widening had opened `profiles`
  on `audit:view` alone, so that manager could also read another site's staff
  rows, phone numbers included.

  What it does, and the two decisions worth knowing:

  - **The scope is stored, not derived.** `audit_logs.branch_id` is a real
    column. Deriving it at read time would mean casting `target_id` and joining
    `orders` inside an RLS policy, evaluated per row on every query, and it
    would only ever answer for the one target table somebody had remembered to
    handle. A `before insert` trigger fills it from the order when the target is
    one, so the existing transition RPC needed no restatement and no future
    writer has to remember. The regex guard on `target_id` is load bearing:
    Postgres has no cast that returns null instead of raising, and there is a
    row in the tests whose target is not a uuid.
  - **A null branch means business wide, not unknown.** Workspace access grants
    and Super Admin provisioning are company records. The policy is the same
    expression the orders policy uses,
    `current_staff_can_access_branch(branch_id)`, and that function already
    returns false for a branch-assigned profile asked about a null branch and
    true for an unassigned one. So one expression scopes a site's rows and keeps
    company rows to the people who are not tied to a site. That is the intended
    reading rather than a lucky null, and `tests/sql/audit-log.test.ts` asserts
    both halves as the real `authenticated` role.

- `/workspace/audit` is the protected trail. Gated on `audit:view` at the page,
  scoped again by RLS underneath, filtered by action, target id and recorded
  date, paged by keyset on the bigserial id, and it names the actor and the
  branch. **The diff is redacted before the page sees it**
  (`redactAuditDetail` in `lib/staff/audit-log.ts`). Nothing writes a credential
  into a diff today; the redaction exists because `diff` is open-ended `jsonb`
  and the next RPC that logs a row it changed will carry whatever columns that
  row has. A denylist is the wrong default in general and the right one here,
  because an allowlist would quietly blank the next useful field somebody logs.

- **The order history search was reaching only into the page it had already
  fetched.** It filtered in memory after `.limit(250)`, so the cap applied to
  the newest closed orders and the search then looked inside them: an order
  older than the newest 250 was unfindable by its own code, and the empty state
  told the reader to widen a date range, which would have made it worse. The
  filter now runs in the database through `lib/staff/search-pattern.ts`, so the
  cap applies to matches. That helper wildcards every character outside
  `[\w@.-]` rather than dropping it, because `or=(a.ilike.*x*,b.ilike.*x*)` is
  parsed on commas, dots and parentheses: a customer name with a comma in it
  would not merely fail to match, it would change which columns were filtered.
  Widening is safe because `matchesOrderHistoryQuery` still decides the final
  answer in memory; dropping would not have been.

- Migration `0024_order_ops_resolved_permission.sql` makes
  `staff_set_order_status` ask the same permission question as everything else.
  `0018` shipped before `0022` existed, so it hand-rolled its own check: an
  active admin or staff profile, then one lookup for an override row that
  explicitly sets `orders:manage` to false. That answers "has this person been
  denied" rather than "does this person have it", and the two agree only while
  every job role carries the permission by default. All three currently do, so
  nothing was reachable through the gap, but the first role added without
  `orders:manage` would have been refused by the application and allowed by the
  database, which is the exact direction of disagreement `0022` was written to
  end. It now calls `current_staff_has_permission('orders:manage')`, the same
  resolver the RLS policies read, so the rows a staff member can see and the
  transitions they can perform cannot part company.

  Nothing else in the function changed, but the whole body is restated, because
  `create or replace function` cannot amend one in place. **If you touch it,
  diff `0024` against `0018` rather than reading it fresh**, or a transcription
  slip in the payment gate or the pickup code will read as intentional.

  The tests for it are honest about what they can prove. The behavioural cases
  cannot fail today, since no role lacks the permission, so what they lock down
  is that every job role which should work the board still can (getting the
  resolver wrong would lock kitchen staff out mid-shift), and that the resolver
  and the transition give the same answer for the same person in both
  directions. The one that would catch a regression is a source-level tripwire
  asserting the function no longer reads `staff_permission_overrides` itself.

- `chk.mts` was a one-off scratch script that reached the repository root in
  `26bd68e`. Deleted. It was inside the tsconfig `include` and the lint scope,
  so it was not inert.

Store availability and hours are implemented as migrations `0025` to `0027`,
with `/workspace/availability` for the counter pause/resume control and
`/workspace/settings` for branch settings, weekly hours and business-wide
intake. `0025` is applied to staging. `0026` adds an explicit 24-hour schedule
representation, required for Central Bloc's owner-confirmed 24/7 hours, and
still needs to be applied. `0027` keeps an existing time window when a weekday
is marked closed, so reopening it does not replace the manager's values. Both
pending migrations must land before the routes receive their browser smoke test.
**Production capacity remains blocked on the owner**, per spec section 28 item
4: Central Bloc's genuine throughput per fifteen minutes at peak.

## Things earlier sessions learned the hard way

The first four are also written into spec section 5.6 and the README. They are repeated here
because each one costs a day if rediscovered.

1. **Font variables must sit on `<html>`, not `<body>`.** `globals.css` applies `font-sans` to the
   html element, and a custom property defined on body is not in scope for its own parent. Every
   paragraph on the site silently rendered in a serif until this was fixed.
2. **Image derivatives need content-hashed filenames.** `next.config.ts` sets `minimumCacheTTL` to
   a year. Re-cropping every photograph and rebuilding changed nothing in the browser, because the
   optimizer kept serving variants derived from the unchanged path. This is why the Storage ingest
   uploads under a `randomUUID()` path.
3. **The flattened cutouts are not on `#EF6212`.** They sit on seven different duller oranges
   between `#d16828` and `#e67d39`. Photographs bleed to all four tile edges; the tile colour only
   shows where there is no photograph.
4. **The corner badge is 35% of the frame, not small.** It is measured per file and cropped
   downward, never rightward. Cropping rightward cuts the basket in half on a 3:2 original.
5. **`2024/06/Untitled-design-47.png` is the Sports Lounge frontage.** Excluded, with a unit test
   asserting on its archive path so a rename cannot bring it back.
6. **A grant without a policy is silent.** RLS denies by returning nothing, not by erroring. When
   you lock a table, audit every caller that read it: this is exactly how ZOMBEANS lost every
   customer-facing read of `app_settings` for a day. `get_public_settings()` exists so that does
   not repeat here.
7. **Postgres grants function EXECUTE to `PUBLIC` by default.** `0010` revokes it by name and hands
   it back to three functions. A new SECURITY DEFINER function without a matching revoke is
   callable by any anonymous visitor. There is a test that fails if `rate_limit_hit` ever becomes
   one.
8. **A policy expression is evaluated as the querying role.** `authenticated` therefore needs
   EXECUTE on `is_staff()` and friends, or every staff read fails on the function rather than on
   the table, which is a puzzling error to land on.
9. **The seed writes `image_source` but never `image_url`.** The Storage ingest writes the URL
   later, so between the seed and that run the database knows the provenance of every photograph
   and cannot serve one. The reader bridges it by matching `image_source` back to the committed
   derivative, and the bridge retires itself once `image_url` is populated. Build the image object
   in SQL on provenance, not on the URL, or every tile renders empty.
10. **A null price list is not a harmless default.** `resolve_variation_price_cents` falls through
   to the published price, but `resolve_option_price_cents` falls through to
   `menu_options.price_cents`, which is NULL for every heat level by design, and coalesces to
   zero. `resolve_price_list_id()` raises instead. Never reintroduce a null-list path.
11. **The nonce CSP and static generation cannot both be right. Fixed by making the site dynamic,
   and it must stay that way.** `proxy.ts` mints a nonce per request and stamps `script-src
   'nonce-...' 'strict-dynamic'` on the response. Next can only put that nonce on the script tags
   of a page it renders *in that request*. Every storefront page used to be statically
   prerendered, so the HTML Next served carried no nonce at all, `strict-dynamic` discarded the
   `'self'` allowlist, and the browser blocked every script on the page. For one release nothing
   on the production site hydrated. `next dev` renders per request, so it stamped the nonce and
   looked fine, which is how this survived Phase 0 review.

   The fix is `await connection()` in `app/layout.tsx`. It stops prerendering there, and since
   that layout wraps every route the whole site renders per request. Next's own guide is blunt:
   "When you use nonces in your CSP, all pages must be dynamically rendered." So it was the nonce
   or SSG, and spec section 22 item 7 makes the nonce Tier 1 and non-negotiable while SSG is a
   caching preference in section 23. Section 23 now carries the correction.

   What it costs is HTML rendering per request, not database work. The menu still arrives through
   `getStorefrontMenu()` and can be cached by tag behind it, which is where to go if the cost ever
   bites. Do not answer it by putting the nonce back into a prerendered page.

   `tests/unit/content-security-policy.test.ts` asserts the `connection()` call is still there. It
   is a source-level tripwire rather than a real unit test, deliberately: deleting that line breaks
   nothing you can see until a customer cannot tap Add to cart.

12. **A Suspense boundary that never resolves in the in-app browser pane is not a bug.** React
   19.2 queues a boundary reveal and performs it on an animation frame. The pane runs with
   `document.visibilityState === "hidden"` and never fires `requestAnimationFrame`, so the
   boundary sits at `<!--$~-->` (`SUSPENSE_QUEUED_START_DATA`) with its content parked in a
   `<div hidden id="S:0">` forever. The configurator looks broken and is not.

   This cost real time, and worse, it was briefly written up here as evidence of trap 11. It was
   not: trap 11 was proved by actual CSP violations in the console and by `/cart` sitting on its
   skeleton, and it is genuinely fixed. Check `document.hidden` before believing the pane about
   anything that waits for a frame.

   To verify anything frame-dependent, drive a real browser. **Playwright's browsers are now
   installed**, so `chromium.launch()` works directly and the `channel: "chrome"` workaround that
   earlier handoffs described is no longer needed. Use Chromium, never WebKit:
   `upgrade-insecure-requests` upgrades localhost and WebKit renders the page unstyled and
   unhydrated, testing nothing.

13. **A CSS grid row stretches its items to the tallest one, and that turns an honest empty state
    into a broken-looking one.** `/checkout` puts the pickup panel beside the order summary. With
    no branch active the panel holds four lines of text and the summary holds the whole order, so
    the panel painted a charcoal slab roughly a thousand pixels tall around its "not open yet"
    notice, which reads as a panel that failed to load. `items-start` on the grid fixes it and
    costs the sticky summary nothing, because `align-self` sizes the item rather than the grid
    area. Whenever a panel can legitimately be nearly empty, check it next to a full one.

14. **A revoke naming the wrong grantee is a revoke that does nothing, and Supabase makes `PUBLIC`
    the wrong grantee.** This is the most expensive thing found so far, and it was invisible to 327
    passing tests.

    Postgres grants function EXECUTE to `PUBLIC` by default, so 0010 revokes `from public` and hands
    it back by name. Correct on Postgres. But Supabase additionally ships `alter default privileges
    for role postgres in schema public grant execute on functions to anon, authenticated,
    service_role`, so every function these migrations create arrives carrying an **explicit**
    `anon=X/postgres` grant. Revoking from `PUBLIC` removes a privilege nobody held and leaves that
    one untouched.

    The result, on the first project this was ever applied to: `anon` could execute all nineteen
    functions in `public`. The price resolvers, `resolve_pickup_branch_id`, both code generators,
    and `rate_limit_hit`. That last one is the damaging one, and 0010's own comment says why: a
    limiter an anonymous caller can invoke directly is one they can drive to its ceiling against any
    key they can guess, which turns the rate limit into a way to lock a chosen phone number out of
    ordering.

    **The tests were right and the database they ran against was wrong.** Both
    `tests/sql/schema.test.ts` and `tests/sql/place-order.test.ts` already asserted that `anon`
    cannot call `rate_limit_hit` and that exactly seven functions are exposed. They passed, because
    PGlite is a bare Postgres with no such default privilege. `tests/sql/harness.ts` had already
    learned this lesson for **tables** and says so in its own comment; it simply had no equivalent
    line for **functions**. It does now, and the existing assertions fail without `0015`.

    Two general lessons worth more than the specific bug. When you revoke, check
    `pg_proc.proacl` and see who actually holds the privilege, rather than assuming the default
    grantee. And when a harness shims a platform, every shim it is missing is a class of bug it
    cannot see: the tables line was there because somebody hit this before, and the functions line
    was not.


15. **A migration applied through the dashboard SQL editor leaves the CLI's history behind, and the
    next `db push` tries to run it again.** `0022` was applied to staging that way. Every one of its
    effects was present, sampled from the revokes at the top of the file to the
    `provision_configured_super_admin` function at the bottom, but
    `supabase_migrations.schema_migrations` stopped at `0021`, so the CLI listed `0022` as pending.

    Re-running it would not have been harmless. Almost every statement in `0022` is idempotent
    (`create or replace`, `drop policy if exists` then `create policy`, `revoke`), but
    `create unique index profiles_one_active_admin_idx` is not, and it would have raised "relation
    already exists" and aborted the push before `0023` and `0024` ran.

    The fix is `supabase migration repair --status applied 0022 --db-url ...`, which writes the
    history row without executing the SQL. **Do not fix it by editing the migration to add
    `if not exists`**: section 25 makes migrations forward-only and that file is already applied to
    a real database.

    Two general lessons. Verify a claim of "applied" against the schema rather than against the
    history table or a previous handoff, because the two can disagree and only one of them is the
    database. And when a dry run names more files than you expected, that is the signal to stop:
    the surprise was a real divergence, not a quirk.

16. **The preview tool starts servers in the primary worktree, so it cannot verify work that lives
    in a Codex worktree.** `preview_start` runs in the session's working directory, which is
    `C:\dev\nybb-order`. Point it at the `prod` configuration while the work is in
    `C:\Users\Steven\.codex\worktrees\<id>\nybb-order` and it serves `main`'s build instead, which
    does not contain the feature under review.

    It fails twice over, and the second failure hides the first. `.claude/launch.json` runs
    `npx next start`, and because `node_modules` in a Codex worktree is a symlink to another
    worktree, `npx` does not resolve the local binary and downloads a different Next (16.3.0 against
    a build made by 16.2.9). The result is a bare "Internal Server Error" on every route including
    the home page, which reads like a broken feature and is actually a broken server.

    **The tell is the home page.** A defect in one new route cannot break `/`. If the root 500s,
    stop debugging the feature and check what is actually serving.

    To verify a Codex worktree, start it from that directory with the project's own binary,
    `npm run start -- -p 3001`, then drive the Browser pane at `http://localhost:3001`. Confirm the
    banner says **16.2.9**; a different version means `npx` fetched its own copy again.

17. **`preview_stop` can report success while the process keeps running and keeps the port.** It
    said "stopped", the Node process survived, and it held 3001 for long enough that the next server
    started in its place failed to bind and exited, having already printed its version banner and
    `Ready`. Every request then went to the zombie, so a working build looked broken.

    Check the port, not the tool's answer: `netstat -ano | grep LISTENING | grep :3001`, and
    `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*next*' }` for the
    process. A `next start` whose command line points into `AppData\Local\npm-cache\_npx\` is the
    downloaded copy from trap 16, not the project's.

18. **A sign-in in the user's own browser is invisible to the Browser pane, and vice versa.** They
    keep separate cookies. A page verified by eye in Chrome still redirects the pane to `/login`,
    which is correct behaviour and not a session bug. Anything an agent has to inspect while signed
    in has to be signed in inside the pane. Note also that the pane cannot take a screenshot unless
    it is displayed on screen, so prefer `get_page_text` and `read_network_requests`, which work
    either way.

## Do not

- Do not invent answers to spec section 28. Central Bloc is the selected pilot branch and its 24/7
  schedule is now confirmed, but the kitchen capacity remains unanswered. Staging has a temporary
  11:00 to 22:00 daily override until migration `0026` is applied. The seed deliberately keeps
  `store_hours` empty and all nine
  branches inactive, so a fresh environment fails closed until it is explicitly configured.
- Do not add a TypeScript implementation of the slot grid, for the same reason there is only one
  place that adds money up. `get_pickup_slots()` is the grid, `place_order` books against it, and
  `lib/slots/` only formats what it returns.
- Do not hand-roll a control. `components/ui/Button.tsx` is the button system, and a bare
  underline is for navigation, never for an action. See the bullet above.
- Do not hand-edit `supabase/seed.sql`. Change `lib/catalog/` and run `npm run build:seed`.
- Do not invent a Supabase project to get around a failing test: `npm test` is the verification
  loop and it needs no project. **The old "do not apply the migrations" rule is retired**, and the
  procedure above replaces it: the moment the owner creates the project, applying all migrations and
  the seed is the first thing to do.
- Do not use `createAdminClient()` for anything a customer's identity matters to. It bypasses RLS
  and has no `auth.uid()` at all, so using it for `place_order` would not make orders anonymous by
  accident, it would make them anonymous by definition. Its callers are limited to server-only
  rate limiting, staff access preparation and the best-effort Auth dashboard mirror. Checkout
  forwards the customer's access token instead, per spec section 14.
- Do not let a rate limiter fail closed. Spec section 22 item 6 and 0008's own comment both require
  fail open, and `lib/rate-limit/limiter.ts` returns `true` on every error path for that reason. A
  limiter that takes ordering down has done more damage than the abuse it stopped.
- Do not bucket an unreadable address into a shared "unknown" key, and do not skip the `isIP`
  validation. The first fills one bucket and refuses everybody in it; the second lets a caller add a
  permanent row to `rate_limits` per request, since nothing prunes that table.
- Do not draw the heat ramp twice on one page, and note that "twice in two different shapes" still
  counts as twice. This gotcha used to say the opposite: that the hero strip states the scale and
  the band prices it, so two surfaces were fine as long as their forms differed. The strip has since
  been removed outright. Two drawings of one fact is a repeat whatever the shapes are, and the
  second surface is always the one further from the decision, so it is the one to cut. The landing
  page draws the ramp once, in the band, which is where somebody is choosing and which owns the
  site's one authored animation. `DESIGN.md` carries this as The One Heat Surface Per Page Rule.
- Do not key a short-viewport rule on width. A landscape phone at 844x390 is past every width
  breakpoint with under 300px of usable height, so width rules hand it the desktop treatment and
  push the CTAs off the screen. Use `max-height`.
- Do not rely on counting elements to prove something is visible. The hero's level names were in the
  DOM, correct, in order, and invisible, because they named no colour and inherited ink onto ink.
  Measurement passed it and a screenshot caught it.
- Do not link `/terms`, `/privacy` or `/refund`. They do not exist yet and land with PayMongo.
- Do not write Next.js from memory. This is Next 16: middleware is `proxy.ts`, `params` is a
  Promise. Read `node_modules/next/dist/docs/`.
- Do not run the dev server through Bash. One is already running on port 3000.
- Do not judge mobile layout by eye. Measure it, per item 3 above.
- Do not add a second place that adds money up. `lib/menu/line-pricing.ts` is the display side and
  `place_order` is the authority; when they disagree the server is right. The cart is not an
  exception: `lib/cart/lines.ts` calls into `line-pricing.ts` for every peso, and the one price it
  stores is a cache that `resolveCart` overwrites.
- Do not make any route static again, and do not reach for PPR or `cacheComponents`. Both are
  incompatible with a nonce, per trap 11. If a page needs to be faster, cache the data behind
  `getStorefrontMenu()`, not the HTML.
- Do not judge anything interactive from `next dev` alone. Dev renders per request and production
  did not, which is precisely how trap 11 hid for a phase. `.claude/launch.json` has a `prod`
  configuration on port 3001 for exactly this.
