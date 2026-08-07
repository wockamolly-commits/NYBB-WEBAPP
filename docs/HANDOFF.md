# Handoff, 2026-08-06 (updated for the landing hero pass and the design system)

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

**Phase 0 is complete, and Phase 1 steps 1 to 7 have landed.** `npm run build`, `npm run lint` and
`npm test` (310 tests in 16 files) are green.

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
- `supabase/migrations/0001` to `0014` are written. Spec section 6 is the design and **section 6.6
  records the ten places the schema departs from it**, with reasons. Read 6.6 before changing
  anything in there.
- `lib/menu/` is the source-agnostic menu reader added in Phase 1. `getStorefrontMenu()` returns
  `get_storefront_menu()` when Supabase is configured and the static catalog when it is not, in one
  runtime shape. Pages pass the result down; no component imports the catalog any more.
- `supabase/seed.sql` is generated from `lib/catalog/` by `npm run build:seed`. Do not edit it.
- `scripts/ingest-legacy-images.ts` is the Storage ingest. It and `build-static-images.ts` share
  `scripts/lib/image-pipeline.ts`.
- `tests/sql/` runs the migrations and the seed against Postgres compiled to WebAssembly (PGlite).
  127 of the 310 tests live there.
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

**Nothing has been applied to a database.** No Supabase project exists.

**And an agent cannot create one.** This is worth writing down because it has now been rediscovered
in two sessions. Creating the project needs one of three things, and none of them is available to a
session running here:

- the Supabase MCP connector, which is **not authorized** in this environment and cannot be
  authorized from a non-interactive session, because the OAuth flow needs a browser and a human;
- `npx supabase login`, which is interactive for the same reason. **The CLI itself is present
  (2.111.0 via `npx`), so this is an authorization problem and not a tooling one**;
- a `SUPABASE_ACCESS_TOKEN` in the environment, which is not set. There is no `.env.local`, only
  `.env.example`.

It should stay that way. The project lives in the owner's account, a database password has to be
chosen and stored, and section 25 wants two projects, which is a billing decision. **This is the
owner's action, and the handoff's job is to make it a five minute one rather than to work around
it.** See "Creating the project" below for the exact steps and the exact commands that follow.

**When the project should be created: now, before step 8.** Everything through the tracking page
was buildable without one, because PGlite runs the real migrations and the storefront falls back to
the static catalog. Customer email OTP is the first thing that cannot be: Supabase Auth is the
thing being integrated, so there is nothing to write against.

Two more reasons not to leave it later than that:

- **RLS and grants are the least tested part of this codebase, and the harness says so in its own
  header.** PGlite proves the schema is coherent. It cannot prove what a PostgREST request returns,
  because `anon`, `authenticated` and `auth.uid()` are shims there. Seven functions are now granted
  to `anon`, two of them (`place_order`, `get_order_by_tracking`) doing real work with real
  consequences, and none has ever run as a real anonymous role.
- **The checkout round trip has never happened.** `place_order` is proven against Postgres and the
  Server Action is proven at its boundary, but no request has gone browser to PostgREST to Postgres
  and back. That is the seam where a wrong argument name or a missing grant hides.

**Creating the project does not need the section 28 answers.** Apply the migrations and the seed,
and the site stays exactly as honest as it is now: `store_hours` is empty, all nine branches are
`is_active = false`, and every surface says "Pickup times are not open yet". The owner's answers
are what flip a branch on, not what create a database. **This retires "do not apply the
migrations" below**, which was written when there was nowhere to apply them to. Two projects
(staging and production) if budget allows, per spec section 25.

### Creating the project, and applying 0001 to 0014 plus the seed

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
   risk in this procedure.** These migrations are numbered `0001` to `0014`, not in the CLI's usual
   14-digit timestamp format, so the remote history table will contain none of them and the CLI's
   default is to push only what it recognises as new. This was not provable from here: it needs a
   reachable Postgres, Docker was not running and there is no `psql` on this machine. **Check the
   dry run output names all fourteen files, in order, before running it for real.**
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
   - **The empty state is the feature today.** `unavailableReason` is one of `no_branch`,
     `no_hours`, `not_accepting`, `closed_now` or `fully_booked`, and the screen says which. Two of
     those are the expected state of this project rather than faults, so the copy reads as "not
     open for this yet" and points at the branch phone numbers. What renders right now is
     "Pickup times are not open yet", because no branch is active.
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
   - **The whole status ladder is written, though only `pending` is reachable.** Nothing can move
     an order until the staff board lands in Phase 2. The copy exists now because the copy is the
     part that needs thinking about, and because a page handling only the status it can currently
     reach would render an empty box on the first day the board works.
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

8. **Customer email OTP**, the last step of Phase 1. **This one needs a Supabase project**, unlike
   everything before it.

   - `lib/rate-limit/` is ready for the OTP limit: `withinAddressLimit` takes the action as a
     namespace, so ordering too fast cannot also block asking for a sign-in code. Spec section 22
     item 6 wants the franchise form covered too.

   - **Wire the access token through `placeOrder` at the same time.** Today every order is a guest
     order, because `app/actions/checkout.ts` calls the RPC with the cookie-free anon client. Spec
     section 14 is specific: the action takes the token as an argument and builds a client with it,
     so `auth.uid()` inside `place_order` stamps `orders.user_id`. Do not reach for a service-role
     client to solve it, or every order becomes a guest order placed with a key the storefront has
     no business holding.
   - `get_order_by_tracking` already accepts a signed-in owner without a token, so order history
     works the moment sign-in does.
   - Configure the Supabase Magic Link, Confirm Signup and Invite templates to show `{{ .Token }}`
     and drop `{{ .ConfirmationURL }}`, per spec section 14.

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

## Do not

- Do not invent answers to spec section 28. The pilot branch and the real weekday hours are still
  unanswered and they block Phase 1. `store_hours` is deliberately empty, `branch_is_open_at()`
  fails closed, and all nine branches are seeded `is_active = false`. The slot picker is now the
  loudest place this shows: it renders "Pickup times are not open yet" on every visit, and that is
  it working, not it failing. Seed a branch in a test if you need windows, never in the seed.
- Do not add a TypeScript implementation of the slot grid, for the same reason there is only one
  place that adds money up. `get_pickup_slots()` is the grid, `place_order` books against it, and
  `lib/slots/` only formats what it returns.
- Do not hand-roll a control. `components/ui/Button.tsx` is the button system, and a bare
  underline is for navigation, never for an action. See the bullet above.
- Do not hand-edit `supabase/seed.sql`. Change `lib/catalog/` and run `npm run build:seed`.
- Do not invent a Supabase project to get around a failing test: `npm test` is the verification
  loop and it needs no project. **The old "do not apply the migrations" rule is retired**, and the
  procedure above replaces it: the moment the owner creates the project, applying 0001 to 0014 and
  the seed is the first thing to do.
- Do not use `createAdminClient()` for anything a customer's identity matters to. It bypasses RLS
  and has no `auth.uid()` at all, so using it for `place_order` would not make orders anonymous by
  accident, it would make them anonymous by definition. Its one caller today is the rate limiter,
  which is what 0010 granted `rate_limit_hit` to `service_role` for. Step 8 forwards the customer's
  access token instead, per spec section 14.
- Do not let a rate limiter fail closed. Spec section 22 item 6 and 0008's own comment both require
  fail open, and `lib/rate-limit/limiter.ts` returns `true` on every error path for that reason. A
  limiter that takes ordering down has done more damage than the abuse it stopped.
- Do not bucket an unreadable address into a shared "unknown" key, and do not skip the `isIP`
  validation. The first fills one bucket and refuses everybody in it; the second lets a caller add a
  permanent row to `rate_limits` per request, since nothing prunes that table.
- Do not draw the heat ramp twice on one page. A level keeps its swatch everywhere, but the *form*
  is once per page: the hero strip states the scale and the band prices it. The band owns the site's
  one authored animation because it is where somebody is choosing, and the hero strip is
  deliberately still. Both rules are in `DESIGN.md`.
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
