# Handoff, 2026-08-05

Continuation prompt for a fresh session on `C:\dev\nybb-order`.

---

You are continuing work on **NYBB Order**, the pickup-only ordering platform for New York Buffalo
Brad's Hot Wings in Cebu. The project lives at `C:\dev\nybb-order`.

**Read first, in this order:** `AGENTS.md` (standing rules), `README.md` (live status), then the
relevant section of `docs/IMPLEMENTATION-PROMPT.md` (the full spec). Do not paste the spec into
chat, it is ~1,500 lines. Read it from disk.

## Where things stand

Phase 0 is done except the database. The previous session built the whole public storefront off a
static catalog:

- `lib/catalog/` holds the full Hot Wings menu, nine wing flavours, the Level of Hotness scale with
  its variation-dependent pricing, nine branches, and a generated image manifest. Its types
  deliberately mirror the Phase 1 tables.
- `components/` holds Header, Footer, HeroVideo, HeatMeter, ProductTile, NoPhotoTile, FlavourGrid,
  CategoryNav, Wordmark.
- `app/(storefront)/` holds the landing, `/menu`, `/menu/[category]`, `/about` and `/contact`.
- `scripts/build-static-images.ts` and `scripts/build-hero-video.sh` regenerate every asset from
  `C:\dev\nybb-assets` and the brand video.
- 46 unit tests across four files. `npm run build`, `npm run lint`, `npm test` are all green, and
  every page was rendered and reviewed at 375px and 1280px.

**The work is uncommitted.** `git status` shows 6 modified paths and 11 new ones. Review and commit
it as the first step if that is wanted. No em dashes in the commit message.

## Next work, in order

1. **Migrations `0001` to `0010`** per spec section 6: types, branches, price lists, menu, the two
   price-override tables (`item_variation_prices`, `menu_option_variation_prices`), cart, orders,
   pickup slots, store hours, staff, app settings, RLS policies and explicit `GRANT`s. Read
   ZOMBEANS `supabase/migrations/0001_types.sql` through `0011_place_order.sql` first for the
   conventions. Write them, do not apply them: no Supabase project exists yet, and the Supabase MCP
   connector is not authorized.
2. **`supabase/seed.sql`**, generated from `lib/catalog/menu.ts` so the two cannot drift. Hot Wings
   only. Nothing from the Sports Lounge, which closed in August 2026.
3. **`scripts/ingest-legacy-images.ts`**, the real Supabase Storage ingest. The transform rules in
   `scripts/build-static-images.ts` carry over unchanged; only the destination differs, and
   `public/img` can be deleted once it lands.

## Things the previous session learned the hard way

Four of these are already written into the spec as correction blocks in section 5.6, and into
`README.md`. They are repeated here because they will cost a day each if rediscovered.

1. **Font variables must sit on `<html>`, not `<body>`.** `globals.css` applies `font-sans` to the
   html element, and a custom property defined on body is not in scope for its own parent. Every
   paragraph on the site silently rendered in a serif until this was fixed.
2. **Image derivatives need content-hashed filenames.** `next.config.ts` sets `minimumCacheTTL` to
   a year. Re-cropping every photograph and rebuilding changed nothing in the browser, because the
   optimizer kept serving variants derived from the unchanged path. Filenames now carry an
   8-character content hash, for the same reason the Supabase ingest will use a `randomUUID()` path.
3. **The flattened cutouts are not on `#EF6212`.** They sit on seven different duller oranges
   between `#d16828` and `#e67d39`. Photographs bleed to all four tile edges; the tile colour only
   shows where there is no photograph.
4. **The corner badge is 35% of the frame, not small.** It is measured per file and cropped
   downward, never rightward. Cropping rightward cuts the basket in half on a 3:2 original.
5. **`2024/06/Untitled-design-47.png` is the Sports Lounge frontage.** Excluded, with a unit test
   asserting on its archive path so a rename cannot bring it back.

## Do not

- Do not invent answers to spec section 28. The pilot branch and the real weekday hours are still
  unanswered and they block Phase 1. Nothing in the code marks a branch as the pilot, and
  `/contact` says hours are not published rather than guessing.
- Do not link `/terms`, `/privacy` or `/refund`. They do not exist yet and land with PayMongo.
- Do not write Next.js from memory. This is Next 16: middleware is `proxy.ts`, `params` is a
  Promise. Read `node_modules/next/dist/docs/`.
- Do not run the dev server through Bash. One is already running on port 3000.
