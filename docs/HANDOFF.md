# Handoff, 2026-08-05

Continuation prompt for a fresh session on `C:\dev\nybb-order`.

---

You are continuing work on **NYBB Order**, the pickup-only ordering platform for New York Buffalo
Brad's Hot Wings in Cebu. The project lives at `C:\dev\nybb-order`.

**Read first, in this order:** `AGENTS.md` (standing rules), `README.md` (live status), then the
relevant section of `docs/IMPLEMENTATION-PROMPT.md` (the full specification). Do not paste the spec
into chat, it is ~1,600 lines. Read it from disk.

## Where things stand

**Phase 0 is complete, and Phase 1 step 1 has landed.** `npm run build`, `npm run lint` and
`npm test` (104 tests) are green.

- `lib/catalog/` holds the full Hot Wings menu, nine wing flavours, the Level of Hotness scale with
  its variation-dependent pricing, nine branches, and a generated image manifest. Its types mirror
  the Phase 1 tables.
- `components/` and `app/(storefront)/` render the landing, `/menu`, `/menu/[category]`, `/about`
  and `/contact`, all reviewed in a browser at 375px and 1280px.
- `supabase/migrations/0001` to `0011` are written. Spec section 6 is the design and **section 6.6
  records the ten places the schema departs from it**, with reasons. Read 6.6 before changing
  anything in there.
- `lib/menu/` is the source-agnostic menu reader added in Phase 1. `getStorefrontMenu()` returns
  `get_storefront_menu()` when Supabase is configured and the static catalog when it is not, in one
  runtime shape. Pages pass the result down; no component imports the catalog any more.
- `supabase/seed.sql` is generated from `lib/catalog/` by `npm run build:seed`. Do not edit it.
- `scripts/ingest-legacy-images.ts` is the Storage ingest. It and `build-static-images.ts` share
  `scripts/lib/image-pipeline.ts`.
- `tests/sql/` runs the migrations and the seed against Postgres compiled to WebAssembly (PGlite).
  35 of the 81 tests live there.

**Nothing has been applied to a database.** No Supabase project exists, and the Supabase MCP
connector is not authorized in this environment.

## Next work: Phase 1, ordering

Spec section 27. In order:

1. ~~`get_storefront_menu()` as migration `0011`.~~ **Done.** Granted to `anon`, and
   `tests/sql/storefront-menu.test.ts` proves the claim rather than asserting it: the function
   output, run through the real zod parse and the real hydration, deep-equals the static
   projection.
2. **The wings configurator** (spec section 10, N5): size, then flavour from the visual grid, then
   heat on the meter with the variation-correct upcharge shown live.
3. **Cart, pickup slot picker, checkout.** Slot generation reads `store_hours` plus
   `branches.pickup_slot_minutes`, generated on read for the next `slot_horizon_hours`.
4. **`place_order`**, with idempotency through `checkout_attempts` and rate limiting through
   `rate_limit_hit()`. It must call `resolve_option_price_cents()` rather than reimplementing the
   fallback, and it must increment `pickup_slots.reserved` in the same transaction as the insert.
5. **Order tracking page** with the pickup code, then customer email OTP.

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

## Do not

- Do not invent answers to spec section 28. The pilot branch and the real weekday hours are still
  unanswered and they block Phase 1. `store_hours` is deliberately empty, `branch_is_open_at()`
  fails closed, and all nine branches are seeded `is_active = false`.
- Do not hand-edit `supabase/seed.sql`. Change `lib/catalog/` and run `npm run build:seed`.
- Do not apply the migrations. Verify them with `npm test` instead.
- Do not link `/terms`, `/privacy` or `/refund`. They do not exist yet and land with PayMongo.
- Do not write Next.js from memory. This is Next 16: middleware is `proxy.ts`, `params` is a
  Promise. Read `node_modules/next/dist/docs/`.
- Do not run the dev server through Bash. One is already running on port 3000.
