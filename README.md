# NYBB Order

Pickup-only ordering platform for **New York Buffalo Brad's Hot Wings** (Cebu, Philippines).

Built by inheriting the architecture of the ZOMBEANS ordering platform
(`C:\dev\zombeans-web`, read-only reference) on Next.js 16, Supabase, and Tailwind v4.

## Status

**Phase 0 complete. Phase 1 in progress: the menu reads through one
source-agnostic reader, the wings configurator is built, and the cart, the
pickup slot picker, checkout and order tracking are live. A customer can place
a real pickup order, gets a pickup code back, and can open the order again from
its tracking link.** `npm run build`, `npm run lint` and `npm test` (310 tests)
are all green, every page has been rendered and reviewed in a browser at 320px,
375px and 1280px, and migrations `0001` to `0014` apply cleanly against a real
Postgres in the test suite.

No Supabase project exists yet, so the migrations are written and verified but
deliberately not applied anywhere. **That should change next**: customer email
OTP is the first step that cannot be built without one, and RLS and grants have
so far only been checked against PGlite, where `anon`, `authenticated` and
`auth.uid()` are shims. Creating the project does not require the section 28
answers: apply the migrations and the seed, and the site stays exactly as
honest as it is now, because `store_hours` is still empty and no branch is
active.

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
  fallbacks all verified

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
- 310 tests, 127 of which run the migrations and the seed against Postgres
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

Next:

1. Customer email OTP, which is also when the Server Action starts forwarding
   an access token so orders stop being anonymous. **This is the first step
   that needs a real Supabase project**, and it is the right moment to create
   one: RLS and grants have only ever been checked against PGlite, where the
   roles are shims, and no request has yet gone browser to PostgREST to
   Postgres and back.

Phase 1 is blocked on two answers from the owner: which branch is the pilot,
and its real weekday hours. Nothing in the schema guesses either.

## Start here

1. `AGENTS.md` for the standing rules.
2. `docs/IMPLEMENTATION-PROMPT.md` for the full specification: architecture, data model, feature
   classification from ZOMBEANS, build phases, and open questions.

## What this replaces

`nybuffalobrads.com.ph` is a four-page WordPress brochure whose "Order Here" page links out to
Tablevibe and Foodpanda. The business currently owns no order data, no customer relationship, and
pays aggregator commission on every ticket. This platform makes the pickup channel first-party.

## Scope

- **Pickup only.** No delivery, no dine-in.
- **Single branch at launch**, multi-branch-ready schema (`branch_id` from migration one).
- **ZenPOS** integration via an adapter, with a working manual re-key fallback from day one.
- **Two payment rails** (pay at counter, PayMongo online prepay), both flag-gated, both off by
  default.

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
npm test              # applies 0001 to 0011 and the seed to a real Postgres
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

Section 28 of the implementation prompt holds the seven that only the owner can
answer. Two of them block Phase 1: the pilot branch with its real weekday
hours, and the kitchen's genuine throughput per fifteen minutes at peak. No
branch is marked as the pilot anywhere in the code, and `/contact` says plainly
that hours are not published rather than guessing them.

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
