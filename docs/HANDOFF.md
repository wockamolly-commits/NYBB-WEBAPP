# Handoff, 2026-08-06 (updated for the button system and place_order)

Continuation prompt for a fresh session on `C:\dev\nybb-order`.

---

You are continuing work on **NYBB Order**, the pickup-only ordering platform for New York Buffalo
Brad's Hot Wings in Cebu. The project lives at `C:\dev\nybb-order`.

**Read first, in this order:** `AGENTS.md` (standing rules), `README.md` (live status), then the
relevant section of `docs/IMPLEMENTATION-PROMPT.md` (the full specification). Do not paste the spec
into chat, it is ~1,600 lines. Read it from disk.

## Where things stand

**Phase 0 is complete, and Phase 1 steps 1 to 6 have landed.** `npm run build`, `npm run lint` and
`npm test` (279 tests in 14 files) are green.

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
- `supabase/migrations/0001` to `0013` are written. Spec section 6 is the design and **section 6.6
  records the ten places the schema departs from it**, with reasons. Read 6.6 before changing
  anything in there.
- `lib/menu/` is the source-agnostic menu reader added in Phase 1. `getStorefrontMenu()` returns
  `get_storefront_menu()` when Supabase is configured and the static catalog when it is not, in one
  runtime shape. Pages pass the result down; no component imports the catalog any more.
- `supabase/seed.sql` is generated from `lib/catalog/` by `npm run build:seed`. Do not edit it.
- `scripts/ingest-legacy-images.ts` is the Storage ingest. It and `build-static-images.ts` share
  `scripts/lib/image-pipeline.ts`.
- `tests/sql/` runs the migrations and the seed against Postgres compiled to WebAssembly (PGlite).
  113 of the 279 tests live there.
- Everything through the button system is committed and pushed. `main` is level with `origin/main`
  at `c959b09`.

**Nothing has been applied to a database.** No Supabase project exists, and the Supabase MCP
connector is not authorized in this environment.

3. ~~Small-screen pass at 320 to 390.~~ **Done** (`12460e1`). Worth knowing how, because the
   method found the real defects and cleared two suspected ones: a throwaway Playwright script
   loaded seven pages at 320, 360 and 390 and reported sideways scroll, text clipped by its own
   box, type under 12px, and per-row card geometry. Nothing overlapped and the category rail's
   overflow was a scrolling rail doing its job; what was real was name plates measuring 44px to
   95px in one grid. Menu tiles are now full height flex columns so the grid equalises a row, and
   the price is pinned with `mt-auto` so prices in a row share a line. Group cards by top
   coordinate when checking heights, or you will compare tiles from different rows and chase a
   phantom.

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
     increment. **The IP dimension is not built.** Postgres cannot see the client address, so it
     belongs in the Server Action, and the action needs a service-role client to call
     `rate_limit_hit` at all (0010). That is the one piece of spec section 22 item 6 still open.
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
7. **Order tracking page** with the pickup code, then customer email OTP.

   - `place_order` already returns `trackingToken`, and `orders_tracking_token_key` is indexed for
     it. The page needs `get_order_by_tracking()`, which 0010 has been expecting since Phase 0.
   - **When OTP lands, wire the access token through `placeOrder`.** Today every order is a guest
     order, because `app/actions/checkout.ts` calls the RPC with the cookie-free anon client. Spec
     section 14 is specific: the action takes the token as an argument and builds a client with it,
     so `auth.uid()` inside `place_order` stamps `orders.user_id`. Do not reach for a service-role
     client to solve it, or every order becomes a guest order placed with a key the storefront has
     no business holding.

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
- Do not apply the migrations. Verify them with `npm test` instead.
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
