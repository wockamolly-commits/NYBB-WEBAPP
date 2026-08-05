# NYBB Order

Pickup-only ordering platform for **New York Buffalo Brad's Hot Wings** (Cebu, Philippines).

Built by inheriting the architecture of the ZOMBEANS ordering platform
(`C:\dev\zombeans-web`, read-only reference) on Next.js 16, Supabase, and Tailwind v4.

## Status

**Phase 0, storefront pages done. Database not started.** `npm run build`,
`npm run lint` and `npm test` (46 tests) are all green, and every page has been
rendered and reviewed in a browser at 375px and 1280px.

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

Not started, and this is the next work:

1. Migrations `0001`-`0010`: types, branches, price lists, menu, the two
   price-override tables, cart, orders, pickup slots, store hours, staff,
   app settings, RLS, explicit GRANTs. See spec section 6.
2. `supabase/seed.sql`, generated from `lib/catalog/menu.ts`. Sports Lounge
   items are reference only and must not be seeded.
3. `scripts/ingest-legacy-images.ts`: the real Supabase Storage ingest, which
   replaces the committed derivatives under `public/img`. The transform rules
   in `scripts/build-static-images.ts` carry over unchanged; only the
   destination differs.

No Supabase project exists yet, so migrations should be written but not applied.

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
committed because Phase 0 has no Storage bucket to serve them from. Phase 1
moves the menu photography to Supabase Storage and `public/img` can then be
deleted.

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
