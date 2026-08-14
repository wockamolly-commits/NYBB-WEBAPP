# Master Implementation Prompt: New York Buffalo Brad's Pickup Ordering Platform

> **Superseding service-model amendment, 2026-08-12.** NYBB will support pickup and delivery,
> with customers placing orders in the NYBB app, then staff manually entering each accepted order
> in ZenPOS. ZenPOS is the official sale record. The pickup-only portions of this historical prompt
> are no longer authority for new work. Follow `docs/service-model-and-zenpos-options.md` and
> `docs/transition-inventory.md` for the active transition direction. Do not delete the existing
> implementation while the customer-order and manual-ZenPOS-entry replacement is being designed and
> tested.
>
> **Hard integration boundary, 2026-08-12.** Do not automatically send, create, update, or
> synchronize NYBB customer orders in ZenPOS. Staff enter accepted orders manually in ZenPOS. A
> future ZenPOS connection may read or import information into NYBB, but it must not write customer
> order data to ZenPOS.
>
> **Delivery deferral, 2026-08-12.** Delivery is deferred and out of scope for the current build.
> Focus on customer pickup ordering, staff acceptance, and manual ZenPOS entry. Keep the future
> delivery design in the transition documents, but do not add delivery fields, screens, rider
> workflows, fees, or integrations until the owner reopens that phase.
>
> **ZenPOS integration deferral, 2026-08-12.** Keep manual ZenPOS entry as a staff operating step,
> but do not build a system connection to ZenPOS in the current phase. This includes no API work,
> ticket import, stock or price reads, kitchen-status reads, report import, webhooks, mapping, or
> automated synchronization. Build and polish the NYBB pickup experience first. Reopen the ZenPOS
> discovery and integration work only after the core system is ready.

> **How to use this file.** This is the specification for the project it lives in. Read it in full
> before starting work, and re-read the relevant section before starting each phase. Do not paste
> it into chat: at roughly 1,500 lines it would dominate the context window and it would be lost
> the moment that context compacts. Reading it from disk means you can return to it.
>
> It is written to be self-contained. It assumes you have never seen the ZOMBEANS project, the NYBB
> website, or the conversation that produced this document. Everything needed to make correct
> decisions is stated below, including the parts where you must stop and ask.
>
> `README.md` holds the live build status and what remains. `AGENTS.md` holds the standing rules.
> If reality contradicts this document, say so and update it rather than silently diverging.

---

## 0. Your role and the ground rules

You are building **NYBB Order**, a pickup-only online ordering platform for **New York Buffalo
Brad's Hot Wings & Sports Lounge** (Cebu, Philippines). You are building it by inheriting the
proven architecture of an existing production system called **ZOMBEANS**, not by cloning it.

**Ground rules, in priority order:**

1. **ZOMBEANS is a read-only reference.** It lives at `C:\dev\zombeans-web`. Read it constantly.
   Never write to it, never commit to it, never run its migrations. Your new project lives in a
   separate directory and a separate git repository.
2. **Inherit patterns, not content.** Copy the *shape* of ZOMBEANS solutions (server-authoritative
   pricing, RLS-first data access, flag-gated integrations, RPC-backed writes, idempotent
   checkout). Do not copy its brand, its copy, its zombie theming, its delivery logic, or its
   Loyverse code.
3. **This Next.js is not the Next.js in your training data.** The project uses Next 16, where
   middleware is renamed to `proxy.ts` and several APIs have changed. Before writing any code that
   touches routing, caching, server actions, or `after()`, read the relevant guide under
   `node_modules/next/dist/docs/`. Heed deprecation notices. Do not write Next 13/14/15 idioms
   from memory.
4. **Build in the phases in section 27.** Do not attempt the whole system in one pass. Each phase
   ends with a working, demonstrable app.
5. **Ask before guessing on the items flagged `NEEDS OWNER INPUT`.** There are exactly seven of
   them and they are listed in section 28. Everything else you decide yourself using the rules
   here.
6. **No em dashes** in code comments, commit messages, UI copy, or documents you write. Use
   commas, periods, or parentheses.

---

## 1. Mission

Replace a static WordPress brochure site and an outsourced third-party ordering link with a
first-party, mobile-first pickup ordering platform that the business owns end to end.

**Today's reality (verified against the live site, WordPress 7.0.2 + Elementor 3.21.5 + Astra
theme):**

- `https://nybuffalobrads.com.ph/` is a four-page brochure: Home, Our Menu, Order Here, Privacy
  Notice.
- "Our Menu" is a set of Elementor image blocks and price text. It is not queryable, not
  searchable, and cannot be updated without an Elementor editor session.
- **"Order Here" does not order anything.** It links out to `buffalobrads.tablevibe.co` and to a
  Foodpanda restaurant page. The business owns no order data, no customer relationship, and pays
  aggregator commission on every ticket.
- There is no cart, no account, no order tracking, no admin view, no notifications, and no POS
  connection.
- Branch information is a flat list of phone numbers in a footer widget.

**What you are building instead:** a customer orders on their phone, pays now or at the counter,
gets a live status page and a push notification when the food is ready, walks in, gives a pickup
code, and leaves. Staff see the order land on a realtime board, push it into ZenPOS, and move it
through prep. The owner sees sales, can edit the menu and hours without a developer, and owns
every row of data.

---

## 2. Source material you must read before writing code

### 2.1 The ZOMBEANS reference implementation (`C:\dev\zombeans-web`)

Read these first. They are the highest-signal files in the repo.

| Path | Why it matters |
|---|---|
| `zombeans-plan.md` | The original 55k-word architecture document. Read sections 3 (UX architecture), 4 (system architecture), 5 (database design). Skip the brand and delivery sections. |
| `supabase/migrations/0001_types.sql` .. `0011_place_order.sql` | The core schema and the `place_order` RPC. This is the single most important pattern to inherit. |
| `app/actions/checkout.ts` | 520 lines showing server-authoritative checkout: rate limiting, store-hours gate, stateless customer auth, idempotency, voucher resolution, post-commit notification fan-out. |
| `lib/staff-roles.ts` | Role plus per-user permission-override model. Copy this design wholesale. |
| `lib/order-status.ts` | Active vs terminal status split and the stale-order surface. |
| `lib/storefront-settings.ts` | The "fail closed" settings pattern. Every flag defaults to off. |
| `lib/content-security-policy.ts` + `proxy.ts` | Nonce-based CSP with `strict-dynamic`, wired through Next 16's proxy. |
| `lib/push-notifications.ts`, `lib/email/*` | Web Push (VAPID) and the queued transactional email system. |
| `lib/orders/rekey-view.ts`, `components/admin/OrderRekeyPanel.tsx` | The manual POS bridge. You will reuse this as the ZenPOS fallback. |
| `docs/superpowers/specs/*.md` | Eighteen design documents. Read `2026-07-11-manual-pos-rekey-workflow-design.md` in full: it explains why an automatic POS push can be the wrong answer. |
| `app/globals.css` | The Tailwind v4 `@theme inline` token system. Copy the structure, replace every value. |
| `tests/` | 95 unit test files (vitest), 5 e2e specs (playwright), 2 k6 load scripts. |

**Scale of the reference:** 111 migrations, 40 tables, 51 Postgres functions, roughly 14k lines
of `lib/`, a customer storefront, a staff workspace, and a rider app. You are building
substantially less than this. Most of what you skip is delivery.

### 2.2 The NYBB brand and menu (verified from the live site)

**Identity.** The live website still presents two sub-brands. **Only one is still trading.**

- **NYBB Hot Wings** (fast-casual, franchised, the volume business). Instagram `@nybuffalobrads`,
  TikTok `@nybbhotwings`. **This is the business you are building for.**
- **NYBB Sports Lounge** (full-service restaurant and bar). **CLOSED as of August 2026.** It had a
  single location, the alfresco area on the ground floor of Ayala Malls Central Bloc, IT Park.
  Its logo, menu, address, Instagram `@ny.bbsportslounge`, Facebook `nysportslounge`, and Eatigo
  listing are all still live on the website and are now stale.

**Consequences you must apply throughout:**

- Build for the **Hot Wings menu and price list only**. The Sports Lounge menu in this document is
  retained as historical reference and as proof that the pricing model needs to be list-based, not
  as data to seed.
- **Do not seed the Ayala Central Bloc branch** and do not offer it as a pilot candidate.
- **Do not link the Sports Lounge socials** in the footer or anywhere else. Linking a closed
  venue's Instagram from a new ordering platform is the kind of detail a CEO notices.
- The Sports Lounge *brand* stays expressible in the schema (`branches.brand`) at zero cost, but
  build nothing for it. If the concept ever returns it is a row, not a rewrite.
- Worth telling the owner as a side observation: their live site currently advertises a closed
  restaurant, its menu, and its phone number. That is a small, free win to fix regardless of
  whether this project ships.

Parent: **Five Brad Dragons Food Franchise Corporation**, Unit D, 20th Floor, Latitude Corporate
Center, Mindanao Ave., Cebu Business Park, Cebu City. Franchise contact `franchise@5bdf.ph`,
(032) 520-4930. Franchise fee PHP 1,000,000, capital investment PHP 9,000,000.

**Locations listed in the footer today.** Seed these as `branches` rows, all inactive except the
chosen pilot:

| Location | Phone | Note |
|---|---|---|
| Mango Avenue, Cebu City | 0906-440-5297 | |
| Central Bloc, IT Park, Lahug | 0906-331-3631 / (032) 318-2405 | Strong pilot candidate |
| Shell Gorordo, 839 Gorordo Ave | 0917-114-1392 | Newest opening |
| Shell Mobility, Uling Road, Naga | 0946-352-0538 | |
| Shell Mobility, Cebu Country Club, Gov. Cuenco Ave., Kasambagan | 0932-360-2916 | |
| Shell North Gateway, JP Rizal North Rd, Labogon, Mandaue | 0906-538-1220 | |
| Chong Hua Medical Mall, Don Julio Llorente cor. C. Rodriguez | 0969-328-2875 | |
| NUSTAR | 0917-790-0243 | |
| SM City Cebu Food Hall | 0917-790-0386 | |
| ~~Ayala Malls Central Bloc, alfresco ground floor~~ | ~~0906-440-5297~~ | **CLOSED, do not seed** |

Note the mix of formats. A mall food hall, a hospital mall kiosk, a casino outlet, and four petrol
station sites do not all behave the same way for pickup: a Shell forecourt has drive-up behavior, a
food hall has a shared counter, IT Park has office-lunch rush. Do not assume one prep time or one
slot capacity fits all of them. This is precisely why those values live per branch in section 6.4.

**Colors sampled from the live stylesheets** (frequency-ranked across the homepage and menu page):

| Hex | Count | Reading |
|---|---|---|
| `#EF6212` | 237 | The brand orange. Dominant. This is the primary. |
| `#000000` | 183 | Near-universal ground. The site is black-first. |
| `#FFFFFF` | 68 | Reading color on black. |
| `#F47621` | 20 | Lighter orange, hover and gradient partner. |
| `#F9EE18` | 10 | Signage yellow. Accent only. |
| `#EE2329` | 6 | Buffalo red. Accent and heat indicator. |

**Fonts loaded by the current theme:** Poppins, Roboto, Roboto Slab, DM Sans, Forum. None of these
is a deliberate brand choice; they are Elementor and Astra defaults. Treat typography as open.

**Existing headline copy** (short quotes, for tone calibration only, do not reuse verbatim):
"NYBB Hot Wings Flagship", "Join us now for the ultimate hangout spot!", "Open for Franchise".

**Menu, transcribed from the live Our Menu page.**

**Seed the Hot Wings list only.** The Sports Lounge list below is kept for one reason: it is
documented proof that the same dish carried two different prices under this company (Classic
Buffalo was a PHP 329 half-order on one list and PHP 359 on the other). Franchise sites price
differently from mall and petrol-station sites, so the list-based pricing model in section 6.4
earns its place even now that only one brand trades. Do not import Sports Lounge items.

*Hot Wings price list (franchise / quick-service). THIS IS THE SEED DATA.*

- **Chicken Wings**: HALF 6pcs PHP 329, FULL 10pcs PHP 529. Flavors (choose one, no upcharge):
  Classic Buffalo, BBQ Lime, Cheezy, Garlic Parmesan, Honey Mustard, Smokey Barbecue, Salted Egg,
  Honey Garlic, Sweet Spicy.
- **Level of Hotness add-on** (this is the tricky one, see section 6.4): LITE 20% / MODERATE 40% /
  HOT 60% / WILD 80% each priced HALF PHP 30, FULL PHP 40. INSANE 100% is HALF PHP 40, FULL
  PHP 60. **The add-on price depends on which wing size was chosen.**
- **Ribs**: Original PHP 349, Spicy PHP 349.
- **NY Burgers**: BB1 Rookie 159, BB2 The Quarterback 229, BB3 BLT 279, BB4 Buffalo Chicken 309,
  BB5 Brad's Angus Burger Meal 349.
- **NY Chicken Burgers**: Smokey BBQ 309, Honey Garlic 309, Cheezy 309, Smokey BBQ Meal 350.
- **NY Hotdogs**: H1 Classic 149, H2 Jalapeño Cheese 179, H3 Chili Cheese 209, H4 Hawaiian BBQ 249,
  H5 Hungarian Sandwich 239.
- **Pasta**: Spaghetti 156/159, Carbonara 156/159.
- **Sides**: Nuggets 6pcs 131 / 10pcs 210, Hungarian Rice Meal 189, Mozzarella Sticks 299, French
  Fries 128, Chicken w/ Rice Solo 105, w/ Rice Meal 130.
- **Value Meals**: Set A (2pc wings + rice) 102, Set B (+ drink) 124, Set C (+ drink + fries) 150.
- **Iced Coffee Series**: Americano 89, Vanilla / Dark Mocha / Hazelnut 139.
- **Waffles**: Chocolate 49, Bavarian 49, Sunrise 89. Waffle combos with coffee 109 / 109 / 149.

*Sports Lounge price list (full service). REFERENCE ONLY, the venue is closed. Do not seed.*

- **Popular**: Garlic Parmesan 359, Classic Buffalo 359, Honey Mustard 359, Pasta Carbonara 239,
  Caesar Salad 299, BLT Burger 295.
- **Flavored Wings** (11 flavors): Garlic Parmesan, Honey Mustard, Honey Garlic, Classic Buffalo,
  Sweet & Spicy, Lemon Pepper, Brad's Gravy, BBQ Lime, Pesto, Hickory.
- **Salads**: Caesar 299, Brad's 395, Mango 395.
- **Appetizers**: Macho Nachos 589, New York Fries 179, Sticks N' Fries 399, Calamares 289,
  Seafood Platter 749.
- **Breakfast**: Corned Beef 419, Burger Steak 275, Calamares 275, Chicken Fillet 299, Bacon 359,
  Fish Fillet 347, Waffles 4pcs 220.
- **Main Course**: Fish N' Chips 499, Perfect Salmon 879, Ribs 489, Crispy Golden Pork Belly 399,
  Beef Stroganoff 529.
- **Pasta**: Aglio e Olio 239, Pesto 239, Carbonara 239.
- **Sizzling**: Sisig 249, Gambas 359.
- **Sides**: Plain Rice 60, Boiled Egg 59, Mashed Potato 90, Sunny Side Up 59, Garlic Bread 71,
  Scrambled Egg 65.
- **Drinks**: Bottled Water 71, canned sodas 99 each. Milkshakes 199. Fresh juices and shakes 159.
  Mocktails 189. Iced tea 79 / 129, towers 259.
- **Group Meals**: All Star Package and Quarter Three, each with sets A/B/C. Prices not published.

---

## 3. Locked decisions

These were settled with the project owner. Do not relitigate them.

| # | Decision | Consequence |
|---|---|---|
| D1 | **Pickup only.** No delivery, no dine-in, no take-out-vs-dine-in distinction. | Delete the entire delivery subsystem and the rider app. See section 8. |
| D2 | **Single branch at launch, multi-branch-ready schema.** This is a proposal to the CEO. It must demo as one clean store while provably scaling to ten. | Every menu, pricing, hours, stock, order, and settings table carries `branch_id` from migration one. The branch picker is fully built and hidden behind a flag. Never hardcode a branch. |
| D3 | **ZenPOS integration via an adapter, with a discovery phase.** ZenPOS (zenpos.co, CodeLikeUs Technologies, Cebu) publishes no public API reference, no webhook spec, and no developer portal. Their marketing lists a Kitchen Display System, QR Ordering, and a Remote Terminal, which implies an internal order-ingest path exists, but nothing is documented. | Build `POSAdapter` as an interface. Ship a `ManualRekeyAdapter` that works on day one with zero ZenPOS cooperation. Stub `ZenPosAdapter` behind the same interface. Run the discovery checklist in section 16.2 before writing a line of ZenPOS HTTP code. |
| D4 | ~~**Both payment rails, owner-configurable.**~~ **Superseded 2026-08-11: payment first only.** The owner ruled that pickup orders must be paid online before processing, so pay at counter is not offered. The counter rail stays in the schema (the `payment_method` enum keeps `'counter'`) but is unreachable from pickup checkout. See section 17. | Port the ZOMBEANS PayMongo layer as a **Phase 1 launch blocker**, not a Phase 5 option. Ordering cannot open until it works and merchant approval lands. |
| D5 | **This is an internship deliverable and a CEO pitch, not a production launch.** | Prioritize the visible, demonstrable flow and visual quality. Include a defensible security baseline (section 22, Tier 1). Clearly label the production hardening (Tier 2) as documented-but-deferred so nothing needs re-architecting. |
| D6 | **The design must read premium, modern, and restaurant-focused.** No zombie theming, no doodle backgrounds, no cartoon mascot styling. | See section 5. |

---

## 4. Tech stack

Match ZOMBEANS exactly, minus what pickup-only does not need. Do not substitute. The point of
inheriting a proven stack is that you already know how its sharp edges behave.

**Core**
- Next.js 16 (App Router, React Server Components, Server Actions). Middleware is `proxy.ts`.
- React 19, TypeScript 5 (strict).
- Tailwind CSS v4 with `@theme inline` design tokens. No `tailwind.config.js`.
- shadcn/ui in its **Base UI** variant (`@base-ui/react`). Project preference: use Base UI `Select`
  for dropdowns, never a native `<select>`.
- `lucide-react` icons, `class-variance-authority`, `clsx`, `tailwind-merge`.
- `zod` v4 for every boundary schema.
- `sharp` for image processing.

**Backend**
- Supabase: Postgres, Row Level Security, Auth (email OTP), Realtime, Storage (menu images).
- All order writes go through `SECURITY DEFINER` Postgres functions. The client never sends a price.
- `pg_cron` + `pg_net` for scheduled jobs. **Do not use `vercel.json` crons**: the Vercel Hobby
  tier caps them at once per day, which is useless for order expiry. ZOMBEANS learned this and
  deleted its `vercel.json`.

**Integrations**
- `web-push` + VAPID for locked-screen notifications (self-hosted, no vendor).
- Resend for transactional email, behind a flag and a queue table.
- PayMongo for online payment, behind a flag.
- ZenPOS via the adapter in section 16.

**Removed relative to ZOMBEANS**
- `@googlemaps/js-api-loader`, `@types/google.maps`, the Routes API client. Pickup needs a static
  map image and a directions deep link, nothing more.

**Testing and tooling**
- vitest for unit tests, Playwright for e2e, k6 for load.
- ESLint with `eslint-config-next`.
- Deployment on Vercel.

**Known environment gotchas inherited from ZOMBEANS. Read these before you hit them.**

1. A `"use server"` file may only export `async` functions. Exporting a constant or a type from an
   actions file passes `tsc` and `vitest` and fails `next build`. Run `npm run build`, not just
   type-check, on any RSC work.
2. Server components that read cookies cannot be imported by client pages. The `Header` is
   server-only; static pages hydrate auth state client-side through a small API route.
3. New Postgres tables need **explicit** `GRANT`s to `authenticated`. This project does not use
   default privileges. Forgetting produces error 42501.
4. Detached background work (`void (async () => ...)()`) is frozen mid-request on Vercel. Anything
   after the response must return an awaitable promise to `after()`.
5. `referrer: "no-referrer"` in route metadata makes POSTs send `Origin: null`, which breaks every
   Server Action with a 403. Use `same-origin`.
6. Routes with a `loading.tsx` emit two nonce-less scripts that a `strict-dynamic` CSP blocks. This
   is a known Next 16 bug with no functional impact. Do not chase it.
7. A `shadow-[...]` override on a `buttonVariants` button defeats `focus-visible:ring-3`. Use an
   `outline` for the focus indicator instead.
8. A Supabase `postgres_changes` listener on a table that is not in the realtime publication
   subscribes successfully and never fires. Check `pg_publication_rel`, not the migrations folder.

---

## 5. Brand and design direction

### 5.1 The brief

ZOMBEANS is a dark forest-green café with a cartoon mascot, a hand-drawn doodle background, a
slime motif, and playful horror copy. **None of that transfers.** What transfers is the *method*:
a small, disciplined token set; one display font paired with one text font and one mono for
numerics; a single accent color used only for price, CTA, and badge; WCAG AA verified on every
pair; and photography treated as the primary visual, not typography.

NYBB is a **New York sports-bar wing joint**. The target feeling is a good American wing house
after dark: black and charcoal grounds, hot orange as the one loud thing, food shot close and
glossy, condensed uppercase headlines with a stadium-signage confidence, and numerals that read
like a scoreboard.

### 5.2 Token set

Build `app/globals.css` with the same `@theme inline` structure as ZOMBEANS. Replace every value.

```
--color-nybb-ink:        #0B0B0C   /* page ground, near-black with a hint of blue */
--color-nybb-charcoal:   #17181A   /* cards, elevated surfaces */
--color-nybb-graphite:   #232528   /* hairlines, input fills */
--color-nybb-orange:     #EF6212   /* PRIMARY. CTA, price, active state */
--color-nybb-orange-lit: #F47621   /* hover, gradient partner */
--color-nybb-yellow:     #F9EE18   /* signage accent, sparingly. Badges only */
--color-nybb-red:        #EE2329   /* heat scale, destructive, "sold out" */
--color-nybb-bone:       #F5F1EA   /* reading color on dark */
--color-nybb-muted:      rgba(245,241,234,0.68)
```

**Contrast rules you must verify, not assume.** `#EF6212` on `#0B0B0C` is roughly 5.4:1, which
passes AA for normal text but is uncomfortable at small sizes. Use orange for headings, prices,
buttons, and icons. Use `--color-nybb-bone` for body copy. `#F9EE18` on black is very high
contrast and very loud: badges and micro-labels only, never a paragraph. Never put orange text on
red or red on orange.

When you check contrast programmatically, **do not parse `getComputedStyle` colors as RGB.**
Tailwind v4 emits `oklch()` and naive parsing produces fake failures near 1.1:1. Composite the
color through a 1x1 canvas and read the pixel back.

### 5.3 Typography

- **Display:** a heavy condensed grotesque for headlines, category headers, and the wordmark.
  Candidates: Anton (what ZOMBEANS uses, free, billboard weight), Archivo Black, or Oswald 700.
  Uppercase, tight tracking. This carries the stadium-signage feeling.
- **Text:** Inter. Neutral, excellent at small sizes, already proven in the reference.
- **Numerics:** JetBrains Mono for prices, order codes, pickup countdowns, and the heat percentage.
  Monospaced numerals make a scoreboard, a receipt, and a timer all read correctly.

Load via `next/font/google` exactly as `app/layout.tsx` does in ZOMBEANS.

### 5.4 Signature interactions to inherit and restyle

ZOMBEANS has two card treatments worth keeping as mechanisms with new skins:

- **Card tilt** (`lib/card-tilt.ts`): a subtle pointer-tracked 3D tilt on menu cards. Keep as is.
  It reads premium and costs nothing.
- **Foil sweep** (`components/shop/MenuCategoryCard.tsx`): a specular highlight that sweeps across
  a card when it enters the viewport, replaying on every entrance, never on page load. Keep the
  mechanism. Restyle the gradient from cold foil to a **warm glaze sheen**, which is thematically
  right for wings. Note the hydration race documented in `gotcha-flaky-sweep-replay-e2e`: the
  IntersectionObserver must not be attached before the card hydrates or it opens already
  intersecting.

### 5.5 Heat scale as a design object

NYBB sells heat as a product (LITE 20% through INSANE 100%). This is the single best visual hook
the brand has and the current website wastes it as plain text. Build a **heat meter component**:
five segments, filling from `#F9EE18` through `#EF6212` to `#EE2329`, with the percentage set in
JetBrains Mono. Use it on the wings product page, on the order confirmation, on the staff ticket,
and on the printed pickup slip. It makes the platform feel designed for this specific restaurant
rather than skinned from a template.

### 5.6 Photography and the existing image library

**This section is based on a real audit of the live site's media library, not an assumption.**
One hundred unique original images were enumerated from `wp-content/uploads/` and a representative
sample was downloaded and inspected. Read this before you plan the menu grid, because the assets
you have decide the layout, not the other way around.

#### What exists and is good

**The wings shoot is professional and complete.** Ten flavors, each at **5184x3456** (18MP DSLR,
5 to 8 MB per file), shot in one consistent setup: yellow branded basket, branded liner paper,
whitewashed wood table, striped napkin, dipping sauce in frame. Every flavor is visually distinct
because the sauce color carries the difference. Filenames are item-named, so mapping to menu rows
is mechanical.

```
2024/05/Classic-Buffalo.jpg      2024/05/BBQ-Lime-1.jpg
2024/05/Garlic-Parmesan-1.jpg    2024/05/Honey-Mustard-1.jpg
2024/05/Honey-Garlic-1.jpg       2024/05/Sweet-Spicy-1.jpg
2024/05/Lemon-Pepper-3.jpg       2024/05/Pesto-3.jpg
2024/05/Hickory-1.jpg            2024/05/Brads-Gravy-3.jpg
```

This is the flagship product and its assets are the best in the library. **Build the flavor grid
around them.** Do not commission new wings photography.

**Logos are clean transparent PNGs**, which is rare and worth noting:
`2024/05/hotWingsLogo.png` at 2704x1559 with alpha, and
`2024/05/sportsLoungeLogo-e1716452164843.png` at 2220x1480 with alpha. Both are usable directly at
any size. There is also a transparent mark at
`2024/05/327279073_...-removebg-preview.png` used as the favicon source.

**Other covered items**, mostly cutouts composited on flat brand orange at 4871x3444 or square
1080x1080: five burgers (BLT, Buffalo Chicken, Rookie, The Quarter, Brad's Angus), five hotdogs
(Classic, Chili Cheese, Jalapeno Cheese, Hawaiian BBQ, Hungarian Sausage), ribs (Original and
Spicy), pasta (spaghetti, carbonara), chicken nuggets, value meals, and the burger bundle shots.

**A storefront and interior set exists, and it is not on the menu page.** Six files named
`2024/06/Untitled-design-41|45|46|47.png` and `2024/07/Untitled-design-4|5.png`, all around
2048x1365, are real location photography: an alfresco branch at dusk under string lights, a mall
kiosk with its lit menu boards, a food-hall counter with staff in uniform, and a lounge frontage.
These are genuinely good and nothing on the current site uses them well.

**Use them.** They solve three problems the food photos cannot: the landing hero (a real place beats
a stock plate), the branch card on `/contact` and in the branch picker, and the `/about` page. A
pickup platform is asking someone to physically walk somewhere, so showing them what the place looks
like is functional, not decorative. Check each against the closed-branch list before publishing:
at least one of them is the Sports Lounge frontage and must not ship.

> **Resolved in Phase 0.** It is `2024/06/Untitled-design-47.png`: a mall frontage with "Sports
> Lounge" set in script under the wordmark. That file is excluded, and
> `tests/unit/catalog.test.ts` asserts on its archive path rather than on a filename, so it cannot
> return through a rename. The other five are all Hot Wings and are safe to publish.
>
> One further caution the audit could not settle: `2024/06/Untitled-design-41.png`, the alfresco
> branch at dusk, is unmistakably Hot Wings but the specific site is not identifiable from the
> photograph. It is used as general imagery on `/about` and is never captioned with a branch name.

There is also unlisted food photography in `2024/05/Untitled-design-2024-05-22T*.png`
(2511x2560, seven files) including nuggets, garlic parmesan wings, honey mustard wings, and a
Caesar salad. The salad is a Sports Lounge item, so a little of that menu was photographed after
all. Review this set during ingest; it may close one or two of the remaining gaps.

#### The three problems you must design around

**Problem 1: four incompatible treatments in one library.**

1. *Lifestyle*: the wings, full-bleed on wood with props. 3:2 landscape.
2. *Cutout flattened onto brand orange* `#EF6212`: burgers, hotdogs, ribs, pasta, value meals.
   These are **JPEG with the orange baked in**. Drop one onto a black card and you get an orange
   rectangle, not a floating product.
3. *True transparent cutouts*, but only three of them. See the alpha audit below.
4. *Marketing posters with typography burned into the pixels*: the Iced Coffee Series shots
   (`AMERICANO.jpg`, `VANILLA.jpg`, `DARK-MOCHA.jpg`, `HAZELNUT.jpg`) carry a rendered "Iced Coffee
   Series" headline, and `Waffle-Alacart-1.jpg` carries "WAFFLE, the waffles you can't stop
   craving".

**These posters are advertisements, not product photos. Never use them as a menu item image.** A
product card with someone else's headline baked into it looks broken. Use them only as promo
banners on the landing page, or exclude them and ship those items with no photo.

**The alpha audit, because the file metadata lies.** Twenty-four files report an alpha channel, but
measuring the actual proportion of transparent pixels shows only **seven are genuinely
transparent**:

| File | Transparent | Size | Use |
|---|---|---|---|
| `2025/03/bavarian-coffee.png` | 53.0% | 5632x3754 | Waffle combo, clean cutout |
| `2025/03/egg-coffee.png` | 50.1% | 5632x3754 | Waffle combo, clean cutout |
| `2025/03/chocolate-coffee.png` | 47.7% | 5632x3754 | Waffle combo, clean cutout |
| `2024/05/sportsLoungeLogo-...png` | 40.4% | 2220x1480 | Logo, closed brand, do not use |
| `2024/05/hotWingsLogo.png` | 37.8% | 2704x1559 | **Primary wordmark** |
| `2024/05/327279073_...-removebg-preview.png` (x2) | 37.9% | 403x235 | Favicon and app-icon source |

The other **seventeen carry an alpha channel at 0.0% transparency**, meaning a fully opaque photo
paying for a fourth channel. One of them spends 8.9 MB on a 2511x2560 opaque image. Strip it at
ingest.

**Correction worth noting if you read an earlier draft of this section:** the waffle line is *not*
poster-only. `Waffle-Alacart-1.jpg` is a poster, but the three `*-coffee.png` files are the
**highest-resolution genuine product cutouts in the entire library**, 21 megapixels with clean
transparency, showing the waffle sandwich beside a branded iced coffee cup. They will composite
onto any background. Use them as the hero for the Waffle Combo items.

**The unifying move, and this is the design decision that makes the grid work with zero
re-shooting: every product tile is a brand-orange square.** The flattened cutouts already sit on
`#EF6212`, so they land natively. The lifestyle wing shots get a square center-crop and read as
full-bleed photography inside the same orange-bounded tile. The three transparent waffle cutouts
composite onto that same orange and look deliberate rather than accidental. Against the near-black
page ground, a grid of orange tiles is loud, coherent, unmistakably NYBB, and it costs nothing. Do
not fight the orange, make it the system.

> **Corrected in Phase 0. The move is right, one premise behind it is wrong.** The flattened
> cutouts do **not** sit on `#EF6212`. Sampling their backgrounds gives a different orange per
> file: `#d16828` (BLT Burger), `#dd6d26` (Classic Hotdog), `#e47936` (Value Meals), `#dd8548`
> (Ribs), `#e27731` (Spaghetti), `#d56a28` (Cheezy Burger bundle), `#e67d39` (Chicken Nuggets).
> All are duller than the brand value, and no two match.
>
> So a tile that painted `#EF6212` behind a cutout would show a visible seam at the photograph's
> edge, and the tiles would not match each other either. The implemented rule is therefore: the
> photograph bleeds to all four edges of the tile, and the tile colour is only ever seen where
> there is no photograph, which is `<NoPhotoTile>` and the transparent waffle cutouts. The grid
> still reads as a wall of orange squares, which was the point.

**Problem 2: a baked-in corner watermark.** Several photos carry a small orange corner triangle in
the top-left, some with an internal shot code (`NY1`, `NY4`, `NY7`). It is part of the pixels. Crop
it out during ingest, or align the square crop so it lands off-frame. Do not ship it: an unexplained
code on a product card reads as a bug.

> **Sharpened in Phase 0. It is not small.** On a 5184x3456 original the triangle spans 1801px
> along the top edge, roughly 35% of the width; on a 300x300 thumbnail it spans 113px, roughly
> 38%. There is no single percentage inset that works for both, and both fixed-inset and
> crop-from-the-left attempts failed visibly: shifting the square right on a 3:2 original threw
> away the left third of the frame and cut the basket in half.
>
> What works, and what `scripts/build-static-images.ts` implements: measure the run of
> badge-coloured pixels along the top edge per file, then crop **downward** rather than rightward.
> The badge covers roughly `x + y < run`, so any window whose top-left corner clears that line is
> clean, and these shots have headroom to give but no width. Size is traded for framing on
> purpose: a window at 80% of the short side is still around 2700px against a 900px output, so
> shrinking costs nothing visible while a badly placed crop costs the photograph.
>
> The measurement is only safe on `lifestyle` sources. On a flattened cutout the entire top edge
> is orange and the scan would match all of it, so it is skipped there.

**Problem 3: two resolutions of the same wing photos.** A second, later set exists at
`2025/03/` (`Classic-Buffalo.jpg`, `Salted-Egg.jpg`, `Cheezy.jpg`, `Smokey-Barbecue.jpg` and
others) at only **300x300**. Those are thumbnails, unusable as a hero. Always prefer the `2024/05/`
originals. Note that **Cheezy, Salted Egg, and Smokey Barbecue appear only in the small set**, so
those three flavors currently have no full-resolution photo. Flag them for a re-shoot or reuse a
visually adjacent flavor with an honest caption.

#### Coverage against the menu you are actually building

The library's large gap was the Sports Lounge menu: roughly forty-five items (salads, appetizers,
breakfast, main courses, sizzling plates, bar drinks, mocktails, group packages) have no photo
anywhere on the site. **That venue is closed and its menu is not being built, so the gap is moot.**

Against the Hot Wings menu, which is the one you are seeding, coverage is strong:

| Category | Coverage | Notes |
|---|---|---|
| Chicken Wings | 10 of ~11 flavors at 18MP | The flagship. Cheezy, Salted Egg, Smokey Barbecue exist only at 300x300. |
| NY Burgers | 5 of 5 | Cutouts on orange, 4871x3444. |
| NY Chicken Burgers | 3 bundle shots | Cheezy, Honey, Smoky bundles. |
| NY Hotdogs | 5 of 5 | Cutouts on orange. |
| Ribs | 2 of 2 | 1080x1080. |
| Pasta | 2 of 2 | 1080x1080. |
| Sides, nuggets, value meals | partial | Nuggets and Value Meals covered; fries and mozzarella sticks not. |
| Iced Coffee Series | 4 posters, unusable as item images | Text baked in. See below. |
| Waffles | posters only | Text baked in. |

Call it roughly **eighty percent real coverage on the seeded menu**, concentrated exactly where it
matters most. The grid will look finished on day one. This removes what would otherwise have been
the biggest visual risk to the CEO demo.

The remaining true gaps are small and specific: three wing flavors needing a re-shoot, plus the
coffee and waffle lines, which have advertising art but no clean product shots. Both are a
one-afternoon phone shoot against a plain background, not a production. Raise them as a scoped ask,
not a blocker.

> **Narrowed in Phase 0. The waffle line is covered; only coffee is not.** Two rows above are too
> pessimistic:
>
> - **Waffles are not poster-only.** Beyond the three `*-coffee.png` transparent cutouts already
>   noted, `2025/03/chocolate.jpg`, `2025/03/DSCF4657_.jpg` and `2025/03/DSCF4672_.jpg` are clean
>   6000x4000 product shots of the chocolate, sunrise and bavarian waffles on white. The shipped
>   tiles use the transparent cutouts, since those composite onto the tile ground and show the
>   combo, which is a real menu item.
> - **Mozzarella sticks are covered.** `2024/05/Untitled-design-2024-05-22T160627.766.png` is
>   breaded sticks in a branded basket with a dip. Identified by sight rather than by filename, so
>   it ships flagged `tentative` and is on the list to confirm with the owner.
>
> Still genuinely missing: French Fries, Hungarian Rice Meal, Chicken with Rice, and the whole
> Iced Coffee Series. Those ship as `<NoPhotoTile>`.
>
> The three wing flavours are worse than the table suggests, not better. Cheezy, Salted Egg and
> Smokey Barbecue exist only at 300x300, and the corner badge crop takes them to about 210px, so
> they are visibly soft next to the other six at 900px. They are the sharpest item on the
> re-shoot ask.

#### Handling missing photos

Do not ship a broken-image icon or a grey box. Build a deliberate `<NoPhotoTile>`: the brand-orange
ground, the item name set in the display face, and a subtle repeating wordmark or wing silhouette
at low opacity. It should look like a designed tile that happens to have no photo, not like a
failure. At the coverage level above you will need perhaps six of these across the whole menu, which
reads as intentional rhythm rather than as absence.

#### The source files are already downloaded. Do not re-fetch them.

**A local archive of all 100 original media files (357 MB) exists at `C:\dev\nybb-assets\`**,
mirroring the site's `wp-content/uploads/` path structure under `originals/`.

Verified on download: **100 of 100 fetched, 0 failures, 0 corrupt.** Every file was fully decoded
to a raw pixel buffer, not merely header-checked, so no truncated JPEG is waiting to fail halfway
through your ingest job. Eighty-six files have a short side of 1000px or more. Eleven are
sub-500px thumbnails and should never be used as a hero.

Three files ship with the archive:
- `inventory.csv`: path, width, height, format, alpha flag, and KB for all 100 files. Read this
  before planning the grid, it answers most asset questions without opening anything.
- `download.log`: HTTP status and byte count per fetch.
- `nybb-legacy-image-manifest.txt` (alongside this prompt): the flat list of source paths.

**Use the local archive. Do not download from the live site**, for a reason you would otherwise
waste time rediscovering: **the apex domain's TLS certificate does not cover it.** The certificate
is issued for `cpanel.`, `cpcalendars.`, `cpcontacts.`, `mail.`, and `webdisk.` subdomains only, so
`nybuffalobrads.com.ph` and `www.` both fail certificate validation. Standard fetching tools reject
the host outright. Only `curl -k` (or an equivalent verification bypass) succeeds. If you find
yourself reaching for a workaround here, stop: the files are already on disk.

The archive is the input to the ingest pipeline below. Keep it **outside the git repository**, or
in a gitignored folder. Commit the manifest, never the 356 MB.

#### Ingest pipeline

Source files are 5 to 8 MB and the current WordPress site serves multi-megabyte originals to
phones. Do not repeat that.

- Store in Supabase Storage under `menu-images/` with a **`randomUUID()` path per upload**, exactly
  as ZOMBEANS does. Every URL is then immutable, replacing an image always yields a new URL, and
  `minimumCacheTTL` can safely be set to a year. Inherit the `next.config.ts` `remotePatterns`
  block and its cache-TTL comment verbatim.
- On upload, use `sharp` to: strip EXIF, **drop the alpha channel when the image is fully opaque**
  (seventeen files in the archive waste a fourth channel, one of them across 8.9 MB), center-crop
  to 1:1 (offsetting to exclude the corner watermark), resize to a 1600px master, emit WebP and
  AVIF, and generate a tiny blurhash-style base64 placeholder stored on the `menu_items` row.
- **Preserve alpha on the seven genuinely transparent files.** Flattening the waffle cutouts or the
  wordmark onto a background at ingest destroys the only compositing freedom the library has.
- Serve through `next/image` with explicit `sizes`. Never let an original reach a browser.
- **Watch egress, not storage.** The ZOMBEANS project blew its Supabase free-tier meter on image
  egress while storage stayed near empty. Long cache TTLs and immutable paths are the entire fix.

#### Ask the owner for the originals

The `NY1` / `NY4` / `NY7` shot codes imply a numbered shot list from a real production. The web
files are compressed exports. Request the original shoot deliverables: full-resolution exports or
RAWs, and the cutout source files **with alpha** rather than the orange-flattened JPEGs. Getting
transparent PNGs would remove the single biggest constraint on the grid design and is a five-minute
ask. Add it to the section 28 list.

---

## 6. Data model

### 6.1 Approach

Start from the ZOMBEANS schema, then apply the deltas below. Read migrations `0001` through `0011`
first so you inherit the conventions: money as `BIGINT` minor units (centavos) named `*_cents`,
`generate_short_code()` for human-quotable order codes, `set_updated_at()` triggers, and
`current_role_kind()` as the authorization primitive inside every `SECURITY DEFINER` function.

**Never store money as float.** `12000` renders as `PHP 120.00`.

### 6.2 Tables to carry over unchanged in shape

`menu_categories`, `menu_items`, `item_variations`, `menu_option_groups`, `menu_options`,
`menu_item_option_groups`, `carts`, `cart_items`, `customer_carts`, `orders`, `order_items`,
`order_item_options`, `order_status_events`, `payments`, `checkout_attempts`, `profiles`,
`customer_profiles`, `staff_invitations`, `staff_permission_overrides`, `app_settings`,
`audit_logs`, `notifications`, `push_subscriptions`, `push_subscription_orders`, `rate_limits`,
`vouchers`, `voucher_redemptions`.

### 6.3 Tables to drop entirely

`delivery_addresses`, `customer_addresses`, `riders`, `rider_assignments`, `tables`,
`loyverse_sync`, `order_item_modifiers` (legacy in ZOMBEANS, never populated), `staff_passkeys`,
`staff_passkey_challenges` (half-built, not on the critical path).

`loyalty_stamps` and `loyalty_rewards`: see section 19, the recommendation is to keep the tables
and change the accrual rule.

### 6.4 New tables and columns

**`branches`** (new, the multi-branch spine)

```
id uuid pk
slug text unique                    -- 'garden-bloc', 'ayala-central-bloc'
name text                           -- 'NYBB Hot Wings, Central Bloc IT Park'
brand text                          -- 'hot_wings' | 'sports_lounge'
price_list_id uuid fk -> price_lists
address_line text
barangay text, city text
phone text
lat numeric, lng numeric            -- for the static map and directions link only
google_place_id text
is_active boolean default false
is_accepting_orders boolean default false
prep_minutes_default int default 20
pickup_slot_minutes int default 15  -- slot granularity
pickup_slot_capacity int default 6  -- orders per slot, the throttle
sort_order int
```

Seed all ten known locations as rows with `is_active = false`, then flip exactly one to true. The
CEO demo shows a single clean store; the schema visibly proves the other nine are one boolean away.

**`price_lists`** (new)

One catalog, many price lists. Seed exactly one list (`hot-wings-standard`) and attach every branch
to it.

Keep the table even though only one list exists at launch. The justification is no longer the
closed Sports Lounge, it is the branch mix in section 2.2: this company runs mall food halls, a
hospital kiosk, a casino outlet, and four petrol-station forecourts, and site formats like those
routinely carry different prices for the same item (rent, concession fees, franchisee pricing
latitude). The day one branch needs its own prices, the change is one row and one foreign key
rather than a schema migration across a live menu. The company has already demonstrated it prices
the same dish two ways.

```
id uuid pk, slug text unique, name text
```

**`item_variation_prices`** (new)

```
id uuid pk
variation_id uuid fk -> item_variations
price_list_id uuid fk -> price_lists
price_cents bigint not null
unique (variation_id, price_list_id)
```

**`menu_option_variation_prices`** (new, and this one is genuinely important)

ZOMBEANS models an option's upcharge as a flat delta on `menu_options.price_cents`. **NYBB breaks
that model.** The Level of Hotness add-on costs PHP 30 on a HALF order and PHP 40 on a FULL order,
and INSANE costs PHP 40 / PHP 60. The option price is a function of the selected variation.

```
id uuid pk
option_id uuid fk -> menu_options
variation_id uuid fk -> item_variations
price_list_id uuid fk -> price_lists
price_cents bigint not null
unique (option_id, variation_id, price_list_id)
```

Resolution order inside `place_order`: look for a `menu_option_variation_prices` row matching
(option, chosen variation, branch's price list). If absent, fall back to
`menu_options.price_cents`. If that is null, the option is free. Write a unit test for all three
paths. **This is the single most likely place for a pricing bug to hide, and pricing bugs on a CEO
demo are fatal.**

**`pickup_slots`** (new, the heart of pickup-only)

Rather than a free-text pickup time, model capacity explicitly.

```
id uuid pk
branch_id uuid fk -> branches
slot_start timestamptz not null
capacity int not null
reserved int not null default 0
unique (branch_id, slot_start)
```

`place_order` increments `reserved` in the same transaction as the order insert, and rejects the
order if `reserved >= capacity`. A cancelled or rejected order decrements it. This is what stops a
Friday 7pm rush from promising forty customers the same fifteen-minute window.

**`store_hours`** (new as a proper table, per branch)

ZOMBEANS keeps weekly hours in `app_settings` **and** hardcoded in `lib/`, and they drift. Learn
from that: hours live in exactly one place, a `store_hours` table keyed by `(branch_id, weekday)`,
and every surface reads them through one function. There is no hardcoded fallback schedule.

**`pos_sync`** (new, replaces `loyverse_sync`)

```
id uuid pk
order_id uuid fk -> orders unique
adapter text                        -- 'manual_rekey' | 'zenpos'
state text                          -- 'pending' | 'sent' | 'acked' | 'failed' | 'manual'
external_ref text                   -- ZenPOS ticket id when known
request_payload jsonb
response_payload jsonb
attempts int default 0
last_error text
entered_by uuid                     -- staff profile, for the manual path
entered_at timestamptz
```

**Columns added to `orders`**

```
branch_id uuid fk -> branches not null
pickup_slot_id uuid fk -> pickup_slots
pickup_code text                    -- 4-digit counter handoff code, separate from short_code
customer_arrived_at timestamptz     -- set by the customer's "I'm here" button
claimed_at timestamptz              -- set by staff at handoff
no_show_at timestamptz
```

**Columns removed from `orders`**: everything delivery (`delivery_fee_cents`, detected lat/lng,
rider fields) and `table_number`.

`service_mode` **stays as a column, pinned to a single value `'pickup'` with a CHECK.** Do not
delete it. Keeping the column costs one byte and means adding dine-in later is a constraint change,
not a migration of every order row.

### 6.5 Row Level Security

Every table gets RLS. Inherit the ZOMBEANS policy shape:

- Customers read only their own orders, through `get_order_by_tracking(tracking_key)` or via
  `auth.uid()`.
- Staff read scoped by `current_role_kind()` returning `'staff'` or `'admin'`.
- `anon` gets read on the public menu RPC output and nothing else. Note the ZOMBEANS lesson: after
  locking `app_settings` to staff, every customer-facing read of it had to move to a service-role
  client or it silently returned no row. Audit for that when you lock a table.
- Anything a customer can enumerate must go through a `SECURITY DEFINER` RPC, never a direct table
  select.

### 6.6 Corrections from writing the migrations

Migrations `0001` to `0010` are written (not applied: no Supabase project exists). Where the
schema departs from 6.1 to 6.5 above, this is what it does instead and why. Everything not listed
here was built as specified.

1. **`branches.brand` admits one value.** 6.4 drafted it as `'hot_wings' | 'sports_lounge'`. The
   Sports Lounge closed in August 2026 and nothing in this platform may reference it, so the column
   carries `check (brand = 'hot_wings')`. The multi-brand seam survives; widening it is a
   constraint change.

2. **`branches.phones` is `text[]`, not `phone text`.** Two of the nine branches publish two
   numbers. An array keeps both without a second table.

3. **`branches` also carries `timezone` and five image columns.** The timezone is read by
   `branch_is_open_at()` rather than hardcoded, which is the same class of mistake, in miniature,
   as keeping hours in two places. The image columns give
   `scripts/ingest-legacy-images.ts` somewhere to write the two branch photographs that exist.

4. **`payment_status` gains `'due'`.** A counter order is money the business expects to collect in
   person; an unpaid online order is an intent awaiting a webhook that expires and releases a
   pickup slot. ZOMBEANS called both `'pending'` and its dashboard could not tell them apart.

5. **`anon` holds no table privilege at all, not even on the menu.** 6.5 asks for RPC-only
   enumeration and this takes it literally: the public read surface is three functions, reviewable
   in one sitting, rather than policies spread across eleven catalog tables that must all stay
   correct as columns are added. `get_public_settings()` exists so that locking `app_settings` does
   not repeat the ZOMBEANS silent-empty-read bug.

6. **Two resolver functions carry the pricing rule**, `resolve_variation_price_cents()` and
   `resolve_option_price_cents()`. 6.4 puts the resolution order inside `place_order`. Keeping it
   in one function instead means `place_order`, `get_storefront_menu()` and the admin preview
   cannot drift, which matters more than the indirection costs. All three fallback paths are tested
   (`tests/sql/schema.test.ts`), plus the failure that would actually ship: overrides written for
   one price list leaking into another.

7. **`menu_options.price_cents` is nullable and null is load-bearing.** It means the option has no
   flat price at all and the variation decides. Every Level of Hotness row above "No heat" is null.

8. **`user_role` is `admin | staff`, with a separate `staff_role` of `cashier | kitchen |
   manager`.** Section 13's four roles do not all belong in the RLS primitive: policies only ever
   need to know whether a session may touch operational data. The job is what supplies default
   permissions.

9. **Nothing is seeded that only the owner can answer.** `store_hours` is empty and
   `branch_is_open_at()` fails closed, so a branch with unknown hours is shut rather than guessing.
   All nine branches are seeded `is_active = false`.

10. **`supabase/seed.sql` is generated**, by `npm run build:seed` from `lib/catalog/`. Hand-writing
    the menu a second time in SQL guarantees the two copies disagree within a month, and a menu
    that disagrees with itself charges the wrong price.

---

## 7. Information architecture

```
Public
  /                          Landing: hero, heat scale hook, bestsellers, pickup explainer,
                             branch card with hours and a static map, franchise strip
  /menu                      Category tabs, photo grid, search, sold-out states
  /menu/[category]           Category view (statically generated, DB-driven at build)
  /menu/[category]/[item]    Product detail: variation, flavor, heat, quantity, add-ons
  /cart                      Line editing, voucher field, subtotal
  /checkout                  Name, phone, email (optional), pickup slot picker,
                             payment method, place order
  /order/[code]              Live tracking: status timeline, pickup code, "I'm here" button,
                             countdown to ready
  /account                   Order history, reorder, saved details, loyalty card
  /login                     Email OTP, 6-digit code
  /about                     Real brand story, the wing flavors, the sports-lounge angle
  /contact                   Branch, phone, hours, map, socials
  /franchise                 Franchise inquiry form (the current site has one, keep the lead gen)
  /terms /privacy /refund    Legal. Required if PayMongo card is ever enabled.

Staff workspace (auth + role gated, landscape-first tablet PWA)
  /workspace                 Today's KPIs
  /workspace/orders          Realtime board: New -> Preparing -> Ready -> Claimed
  /workspace/orders/history  Closed orders, includes today
  /workspace/menu            Category / item / variation / option CRUD, availability toggles
  /workspace/pos             ZenPOS sync status, manual re-key queue, mapping
  /workspace/analytics       Sales, peak hours, prep-time distribution, flavor mix
  /workspace/vouchers        Promo code CRUD
  /workspace/team            Invite staff, per-user permission overrides
  /workspace/settings        Hours, prep time, slot capacity, feature flags
  /workspace/availability    Open / close the webstore, high-demand mode
  /workspace/audit           Staff action log
  /workspace/branches        Branch CRUD (visible to owner only, hidden behind the flag)

Removed relative to ZOMBEANS: the entire /rider/* tree, /customer/rider-arrival-acknowledgement.
```

---

## 8. Feature mapping from ZOMBEANS

Every ZOMBEANS feature, classified. **Keep as-is** means port the code with a brand reskin.
**Modify** means the concept survives, the implementation changes. **Replace** means a different
mechanism serves the same need. **Remove** means delete it and do not build a substitute.
**Optional** means build it only if the phase budget allows.

### 8.1 Customer storefront

| Feature | Class | Notes |
|---|---|---|
| Menu browsing, category tabs, photo grid | **Keep as-is** | Reskin only. |
| Static generation of menu pages with DB-driven content | **Keep as-is** | Inherit the guard: `/menu` calls Supabase at build time, so missing `NEXT_PUBLIC_SUPABASE_*` in the Vercel Preview scope fails the build. Readers must fall back to a static catalog. |
| Product detail with variations and option groups | **Modify** | Add variation-dependent option pricing (6.4) and the heat meter. |
| Cart in localStorage | **Keep as-is** | |
| Server cart sync across devices (`customer_carts` + `CartSync`) | **Keep as-is** | Genuinely good, cheap to port. |
| Guest checkout | **Modify** | Guests may order **only** when paying online. Pay-at-counter requires an account, inheriting the ZOMBEANS anti-no-show rule at all three layers: UI gate, `place_order` `authRequired`, and a DB constraint. Pickup no-shows are the main abuse vector for a pickup-only store. |
| Service-mode selector (dine-in / pickup / delivery) | **Remove** | Pickup only. The `service_mode` column stays pinned. |
| Pickup time as free text | **Replace** | Capacity-bounded `pickup_slots` (6.4). This is the most important upgrade in the whole build. |
| Delivery address form, map picker, GPS capture | **Remove** | |
| Delivery fee ladder, 3km radius, road-distance quotes | **Remove** | Delete `lib/delivery*.ts`, `lib/google-maps.ts`, `delivery_quote()`, `resolve_delivery_fee_cents()`. |
| Free-delivery threshold | **Remove** | |
| Order tracking by short code | **Keep as-is** | |
| Private tracking key (unguessable, separate from the short code) | **Keep as-is** | Security-relevant. Migration 0080 in the reference. |
| Realtime + polling status updates | **Keep as-is** | Inherit the decision to poll rather than use Supabase Realtime on the customer tracking page: fewer connections, no RLS-on-realtime surprises. |
| Customer sound + toast alerts | **Modify** | Gate on `ready` and `claimed` only. Drop the delivery statuses. |
| "Order is ready" acknowledgement button | **Keep as-is** | |
| Rider-arrival acknowledgement | **Replace** | Becomes the customer's **"I'm here"** button, which sets `customer_arrived_at` and pings the counter. Same component shape, inverted direction. |
| Reorder from history | **Keep as-is** | Ships dark behind a flag in the reference; turn it on here, it demos well. |
| Product recommendations | **Optional** | `lib/recommendations.ts`. Nice, not load-bearing. |
| Store-closed notice, kitchen-closing banner | **Keep as-is** | |
| Legal pages | **Keep as-is** | Required before PayMongo will approve card payments. |
| Doodle background, slime divider, zombie copy | **Remove** | Brand. |
| Menu card foil sweep and tilt | **Modify** | Keep the mechanism, warm-glaze skin (5.4). |

### 8.2 Ordering and payment

| Feature | Class | Notes |
|---|---|---|
| `place_order` as a `SECURITY DEFINER` RPC | **Keep as-is** | The client never sends a price. Non-negotiable. |
| Idempotent checkout via `checkout_attempts` | **Keep as-is** | |
| Rate limiting in Postgres (`rate_limit_hit`) | **Keep as-is** | |
| Store-hours gate on order placement | **Keep as-is** | Reads from the new `store_hours` table. |
| Cash payment | **Modify** | Rename to "Pay at counter". Same flow, account required. |
| PayMongo GCash / Maya / QR Ph | **Keep as-is** | Flag-gated, dark by default. |
| PayMongo card | **Optional** | Requires published business registration number, terms, privacy, refund, contact, and dispute pages. Keep the pages, leave card off. |
| Payment webhook reconciliation | **Keep as-is** | Note the reference gotcha: PayMongo webhooks cannot be deleted, only disabled, and `pending_webhooks` in the stored event tells you which endpoint your signing secret belongs to. |
| Unpaid-online-order expiry cron | **Keep as-is** | |
| Voucher engine | **Keep as-is** | Discount resolved server-side from the vouchers row. A client-supplied discount amount is ignored. |
| Voucher migration ordering hazard | **Keep the lesson** | All voucher migrations ship **before** the code. Applying the first one alone fails open and charges customers full price while the screen shows a discount. |

### 8.3 Staff workspace

| Feature | Class | Notes |
|---|---|---|
| Realtime orders board | **Modify** | Four columns instead of six: New, Preparing, Ready, Claimed. Delete `out_for_delivery`. |
| Stale-active-order banner | **Keep as-is** | For pickup this catches abandoned orders, which matters more here than it did for delivery. |
| Order history including today | **Keep as-is** | |
| Manual POS re-key panel | **Modify** | Becomes `ManualRekeyAdapter`, restructured to ZenPOS's screen order once discovery reveals it. Until then, structure it by category, matching the printed menu. |
| "In POS" double-entry guard | **Keep as-is** | |
| Menu management CRUD | **Keep as-is** | |
| Product availability holds with auto-expiry | **Keep as-is** | "Sold out until 6pm" is exactly right for a wing house that runs out of a flavor. |
| Loyverse menu sync and mapping UI | **Replace** | ZenPOS mapping, same UI shape. See section 16. |
| Analytics | **Modify** | See section 20. |
| Audit log | **Keep as-is** | |
| Team invites with 48h expiry | **Keep as-is** | |
| Role + per-user permission overrides | **Keep as-is** | `lib/staff-roles.ts` is the best single file in the reference. Drop the `rider` role, add `kitchen` and `manager`. |
| Owner settings form | **Modify** | Add slot capacity and prep minutes. Drop delivery settings. |
| Store availability, high-demand mode | **Keep as-is** | |
| Staff web push for new orders | **Keep as-is** | Verified working on Android tablets in the reference. |
| Landscape-first PWA manifest | **Keep as-is** | Android can lock orientation, iOS cannot. Rules key on viewport **height**, not orientation. |
| Store hours settings form | **Keep as-is** | Reading from the new per-branch table. |

### 8.4 Rider subsystem

| Feature | Class |
|---|---|
| Rider dashboard, delivery detail, history, profile | **Remove** |
| Rider availability and one-active-delivery gate | **Remove** |
| Rider push alerts, alert sound | **Remove** |
| Rider assignment control on the orders board | **Remove** |

Delete `app/rider/*`, `components/rider/*`, `lib/rider*.ts`, and migrations 0019, 0048, 0050,
0053, 0056, 0058, 0059, 0109 equivalents. Roughly fifteen percent of the reference codebase
disappears here. **Do not port it "just in case."** A pickup-only store with a dormant rider app is
a maintenance liability and a confusing demo.

### 8.5 Notifications

| Feature | Class | Notes |
|---|---|---|
| Web Push, self-hosted VAPID | **Keep as-is** | The reference lost days to a wrong `NEXT_PUBLIC_VAPID_PUBLIC_KEY` on Vercel: a 32-char `pk_`-style value instead of the 87-char VAPID key. The opt-in button vanishes silently. **Assert the key length at startup.** |
| Customer push on "ready" | **Keep as-is** | For pickup this is the product. Get it right. |
| Staff push on new order | **Keep as-is** | |
| Push subscription per order | **Keep as-is** | |
| Queued transactional email (Resend) with a send cron | **Optional** | Flag-gated. Order confirmation and "ready for pickup" are the only two templates worth building. |
| Email dark-mode handling | **Keep the lesson** | `color-scheme: only light` plus Gmail overrides fixes every client except the Gmail iPhone app, whose forced flip is unfixable. Do not spend a day on it. |
| SMS | **Optional, recommend deferring** | The obvious PH answer, and genuinely better than email for pickup. But it costs per message and needs a Semaphore or Twilio account. Note it as a Phase 2 recommendation with a cost estimate, do not build it. |

### 8.6 Infrastructure and security

| Feature | Class |
|---|---|
| Nonce-based CSP via `proxy.ts` | **Keep as-is** |
| Security headers (HSTS, nosniff, frame-deny, referrer, permissions policy) | **Modify**: drop `geolocation=(self)`, pickup has no GPS need |
| Postgres-backed rate limiting | **Keep as-is** |
| Constant-time cron authentication | **Keep as-is** |
| Audit logging of staff actions | **Keep as-is** |
| Separate customer and staff cookie namespaces | **Keep as-is** |
| Service-role client discipline (`createAdminClient` vs `createAdminSessionClient`) | **Keep as-is** |
| `pg_cron` scheduled jobs | **Keep as-is** |
| vitest unit suite | **Keep as-is** |
| Playwright e2e | **Modify**: rewrite specs for pickup |
| k6 load scripts | **Optional** |

---

## 9. Features to remove, and why

State these explicitly in your README so a reviewer understands they were considered, not missed.

1. **Delivery.** The business does pickup and dine-in at physical branches; delivery is already
   served by Foodpanda. Building a delivery rail would duplicate an aggregator the business
   already pays, and it would drag in Google Maps billing, a rider app, route quoting, and a
   distance-fee model. Recommendation instead: keep the Foodpanda link on the contact page as a
   secondary channel and own the pickup channel completely.
2. **Dine-in with table QR codes.** Real, but a different product with different failure modes
   (table state, split bills, running tabs) and it overlaps ZenPOS's own QR Ordering feature.
   Recommendation: let ZenPOS own dine-in, let this platform own pickup, and do not build a second
   system that fights the POS.
3. **The rider role and app.** Follows from 1.
4. **Physical stamp cards as the loyalty primitive.** See section 19.
5. **Loyverse.** Wrong POS. The mapping *concept* survives in the ZenPOS adapter.
6. **Staff passkeys.** Half-built in the reference, not on the critical path, and email OTP plus a
   role check is a defensible baseline for an internship deliverable.

---

## 10. New features not present in ZOMBEANS

These exist because pickup-only demands them. Build them, do not skip them: they are what makes
this a new product rather than a reskin.

**N1. Capacity-bounded pickup slots.** Section 6.4. Customer picks a fifteen-minute window; the
window shows remaining capacity; a full window is disabled with "Fully booked, try 7:15pm". The
kitchen never gets promised more than it can cook. Slot generation runs from `store_hours` plus
`pickup_slot_minutes`, generated on read for the next N hours rather than materialized far ahead.

**N2. Pickup code and counter handoff.** A four-digit `pickup_code` shown on the tracking page and
on the staff ticket, distinct from the public `short_code`. Staff enter it (or scan a QR of it) to
mark the order `claimed`. This is the anti-fraud and anti-mixup control for a pickup counter, and
it demos beautifully.

**N3. "I'm here" arrival signal.** The customer taps it on the tracking page when they arrive.
Sets `customer_arrived_at`, pushes to staff, and moves the order card to the top of the Ready
column with an arrival badge. Reuses the rider-arrival component's shape from the reference.

**N4. No-show handling.** A `pg_cron` job flags orders sitting in Ready past a configurable window
(default 45 minutes) and sets `no_show_at`. Unpaid ones auto-cancel and release the pickup slot.
Paid ones stay open and surface in a "Needs attention" banner. Reuses
`expire_unpaid_online_orders()` as the template.

**N5. Wings configurator.** Not a generic product page. Choose size (HALF 6pc / FULL 10pc), then a
flavor from a visual flavor grid with the flavor's color and description, then a heat level on the
heat meter with the variation-correct upcharge shown live. This is the flagship product and it
deserves a bespoke screen.

**N6. Branch selector, built and hidden.** A `<BranchPicker>` component, a `branch_id` cookie, and
branch-scoped menu, hours, and slot reads. Rendered only when `app_settings.multi_branch_enabled`
is true. Ship with it false. In the CEO demo, flipping the flag live is a strong moment: it shows
the roadmap is real, not a promise.

**N7. Prep-time telemetry.** Record `accepted_at`, `preparing_at`, `ready_at`, `claimed_at` and
derive actual prep duration per item mix. Feeds both the analytics page and the customer-facing ETA.
ZOMBEANS shows a static ETA; a pickup platform should learn the real one.

**N8. ZenPOS adapter and sync surface.** Section 16.

**N9. Franchise inquiry form.** The current site earns leads from it. Do not lose that. A simple
form writing to a `franchise_inquiries` table plus an email to `franchise@5bdf.ph`. Rate-limited,
with a honeypot field, no CAPTCHA.

---

## 11. Customer ordering flow

Four screens from menu to confirmation. Never more.

```
1. /menu                 Browse. Tap a product.
2. /menu/[cat]/[item]    Size, flavor, heat, quantity, add-ons. Add to cart.
3. /cart                 Review, edit quantity, apply a voucher.
4. /checkout             Name, phone, pickup slot, payment method. Place order.
   -> /order/[code]      Live status, pickup code, "I'm here".
```

**Rules:**

- The cart lives in `localStorage` and syncs to `customer_carts` when signed in.
- Signed-in users get name, phone, and email prefilled.
- ~~Guests can reach checkout, but the pay-at-counter option is disabled with a clear "Sign in to
  pay at the counter" affordance rather than a silent absence. Online prepay stays available.~~
  **Superseded, see the correction in section 17.** Guests can place a counter order. Online prepay
  is flag-gated off, so the original rule would have closed ordering rather than narrowed it.
- The pickup slot picker is the first field, not the last: it is the constraint that can invalidate
  the whole order, so surface it early.
- A mobile bottom-sticky cart bar appears whenever the cart is non-empty.
- Store closed, or the branch not accepting orders, blocks placement server-side inside
  `place_order`, not only in the UI. The UI shows the next opening time.

---

## 12. Order lifecycle

```
pending      order placed, payment not yet settled (online) or not yet due (counter)
  -> accepted    staff accepted. For online orders this requires payment = paid.
  -> preparing   kitchen started. In practice accept and start are one tap.
  -> ready       food is up. Customer push fires HERE. This is the money moment.
  -> claimed     pickup code verified at the counter. Terminal, success.

Terminal failure states:
  rejected     staff declined, with a reason. Refund path if prepaid.
  cancelled    customer or staff cancelled before prep. Releases the pickup slot.
  no_show      auto-flagged after the configured window. Releases the slot if unpaid.
```

`ACTIVE_STATUSES = [pending, accepted, preparing, ready]`.
`TERMINAL_STATUSES = [claimed, rejected, cancelled, no_show]`.

Port `lib/order-status.ts` and its stale-order selector directly; only the arrays change.

Every transition writes an `order_status_events` row. Every transition made by staff writes an
`audit_logs` row. Status changes happen only inside `staff_set_order_status()` or
`cashier_advance_order()`, never as a bare table update, so authorization and the event trail
cannot be bypassed.

---

## 13. Admin workflow

**The board.** Four columns, realtime via Supabase postgres_changes on `orders`, with a polling
fallback. Cards show: short code, pickup slot with a live countdown, item count, total, payment
badge (Paid online / Collect at counter), heat level chips, and an arrival badge when
`customer_arrived_at` is set. Orders past their slot time turn amber, then red.

**The one-tap path.** ZOMBEANS learned that a six-status workflow means six taps per order during
a rush, and cashiers stop using it. Collapse aggressively:

- **Start** sets `accepted` and `preparing` together and stamps acceptance.
- **Ready** sets `ready` and fires the customer push.
- **Claim** opens the pickup-code prompt, verifies, and sets `claimed`. ~~and for a counter-payment
  order records payment in the same action.~~ Under the payment-first ruling (section 17) every
  order arrives paid, so claim is verification only and collects nothing.

Three taps per order, total.

**POS entry.** Tapping a card opens the ticket panel (section 16.3). Once ZenPOS auto-forwarding is
live the panel becomes read-only confirmation; until then it is the re-key surface with the
"Mark as entered in POS" guard against double entry.

**Permissions.** Inherit the model exactly: a job role supplies defaults, per-user override rows
force a single permission on or off, and effective permissions are computed by
`resolvePermissions()`. Roles for NYBB: `cashier` (orders, menu availability), `kitchen` (orders
view and advance only), `manager` (adds analytics, vouchers, menu configure), plus the Super Admin
bootstrapped from `SUPER_ADMIN_EMAIL`.

**Owner-editable without a developer:** menu items and prices, availability and sold-out holds,
weekly hours, prep minutes, slot capacity, promo codes, feature flags, staff and permissions. If
the owner has to call you to change a price, the platform has failed.

---

## 14. Authentication

Inherit the ZOMBEANS model exactly. It is well-tested and the alternatives are worse.

- **Customers:** Supabase email OTP, six-digit code, no password. Configure the Supabase Magic
  Link, Confirm Signup, and Invite templates to show `{{ .Token }}` and remove
  `{{ .ConfirmationURL }}`. See `docs/auth-otp-supabase-template.md` in the reference.
- **Staff:** same OTP entry point at `/login`, redirected to `/workspace` after the role check.
- **Two cookie namespaces, one continuous signed-in experience.** Staff sessions and customer
  sessions do not share cookies. The storefront checks the customer session first, then recognizes
  a valid staff session as the same signed-in account. Do not copy one refresh token into both
  cookie families because concurrent refreshes can invalidate each other. The workspace still
  accepts only the staff family and re-checks its role from the database on every request.
- **Re-check the role on every workspace request**, from the database, not from the token.
- **Staff invitations** expire in 48 hours and can only create non-admin accounts.
- **Never read customer auth through a cookie-writing Supabase client inside a Server Action.** A
  failed internal token refresh will delete the customer's cookies mid-checkout and sign them out.
  `placeOrder` must take the access token as an argument and verify it statelessly. This is
  `lib/supabase/server.ts::createReadOnlyClient` in the reference and it is load-bearing.

---

## 15. Notifications

**Three channels, in priority order.**

1. **Push. The primary channel, but no longer one transport.** Two audiences, and as of
   2026-08-13 they no longer share a delivery mechanism:
   - **Customer: Expo push to the native app.** Fires on `ready`, and also on `rejected` and
     `cancelled`. This is the entire value proposition of pickup ordering.
   - **Staff: Web Push (VAPID, self-hosted).** Fires on a new order landing. Proven on Android
     counter tablets in the reference.
   Opt-in prompt appears after the first successful order, never on first page load. On the
   customer side that now means the order screen, showing an order that already exists.

   **What changed, and why.** This section originally said Web Push for both audiences. The owner
   approved retiring the web storefront on 2026-08-13 (`docs/mobile-app-transition.md`), which
   leaves no customer-facing browser to hold a Web Push subscription, and iOS Safari's Web Push
   requires the customer to install the site to their home screen first. The customer half is
   therefore Expo push through `apps/customer`. The staff half stays Web Push because the staff
   workspace stays in the browser until a native staff app exists, which is not scheduled.

   Both halves share everything above the transport: one `push_subscriptions` table, one payload
   builder, one queue. `transport` on that table ('web' or 'expo') is the only place the split
   is visible in the schema.

   **The customer events are three, not one.** This section listed only `ready`. `rejected` and
   `cancelled` were added afterwards and are the reason a customer whose payment timed out is
   told at all. `cancelled` in particular is the only thing that tells somebody their order was
   dropped for non-payment.
2. **In-app realtime toast and sound.** For anyone with the tab open. Guard against replaying
   toasts for already-seen orders: the reference shipped a bug where a first sighting counted as a
   status change and completed orders replayed their toasts.
3. **Email (Resend), flag-gated, optional.** Order confirmation and ready-for-pickup only.

**Hard rules:**

- Assert `NEXT_PUBLIC_VAPID_PUBLIC_KEY.length === 87` at startup and log loudly if not. A wrong key
  makes the opt-in button disappear with no error anywhere. This now covers the staff half only,
  and `components/workspace/StaffPushOptIn.tsx` no longer lets the button disappear either.
- The Android notification channel id is `orders` on both sides. Android drops a notification for
  a channel that does not exist on the phone, silently, with no error anywhere. `lib/push/expo.ts`
  sends it and `apps/customer/src/push/register.ts` creates it.
- The customer app must set a notification handler. `expo-notifications` discards a notification
  that arrives while the app is in the foreground when no handler is set.
- Anything sent after the response must be returned as an awaitable promise to `after()`. Detached
  promises are killed mid-flight on Vercel and the `ECONNRESET` surfaces on an unrelated later
  request.
- Notification sends must never fail the order mutation that triggered them. Wrap and swallow.

---

## 16. ZenPOS integration

### 16.1 The honest situation

ZenPOS is a Cebu-built enterprise POS from CodeLikeUs Technologies. Their public site advertises a
Kitchen Display System, QR Ordering, a Remote Terminal, inventory, and a loyalty module. It
advertises **no API, no webhooks, and no developer documentation**, and none exists in public
search. Contact is `+63 917 639 7020` and the head office is in Cebu City.

Therefore: **do not design as if an API exists.** Design so the platform works with zero ZenPOS
cooperation, and so that adding a real API later is one new class.

This mirrors exactly what happened in the reference project. ZOMBEANS built an automatic Loyverse
receipt push, then discovered Loyverse's API can only create *finished, paid-looking* receipts and
not the open tickets staff actually needed. Pushed receipts piled up looking paid while unpaid
orders hid among them, and the team pivoted to a manual re-key workflow that shipped and is still
in production. Read `docs/superpowers/specs/2026-07-11-manual-pos-rekey-workflow-design.md`.
**Assume the same discovery is ahead of you.**

### 16.2 Discovery checklist (run before writing any ZenPOS HTTP code)

Give this list to the owner to take to their ZenPOS account manager. Every answer changes the design.

1. Is there a REST or GraphQL API? Where are the docs? What authentication (API key, OAuth, mTLS)?
2. Can it **create an order or open ticket**, or only read? An integration that cannot create is a
   reporting integration, not an ordering one.
3. If it can create: can it create an **unpaid open ticket**, or only a finished paid sale? This is
   the exact question that killed the Loyverse push.
4. Are there outbound **webhooks** (order status, payment, item availability)?
5. Is there an **inventory or item availability** read, so the website can hide sold-out items
   automatically?
6. How are **modifiers** modeled? Can an add-on carry a price that varies by parent variation
   (the Level of Hotness problem in 6.4)? If not, model heat as a separate line item.
7. Is there a **branch or store** dimension in the API, and does one credential span branches?
8. Does the **Kitchen Display System** have an ingest endpoint independent of the POS? Sometimes
   the KDS is the easier integration surface.
9. Does the **QR Ordering** module have an endpoint an external site can post into? If so, that is
   very likely the intended path and it may be available today.
10. Rate limits, sandbox environment, idempotency key support, and who to contact when it breaks
    at 7pm on a Friday.

### 16.3 Adapter contract

```ts
// lib/pos/adapter.ts
export type PosTicket = {
  orderId: string;
  shortCode: string;
  pickupCode: string;
  branchExternalId: string | null;
  placedAt: string;
  pickupAt: string | null;
  customer: { name: string; phone: string | null };
  payment: { method: PaymentMethod; state: "paid" | "due_at_counter" };
  lines: PosTicketLine[];      // resolved to POS vocabulary, with a web-name fallback
  discountCents: number;
  totalCents: number;
  notes: string | null;
};

export interface PosAdapter {
  readonly id: "manual_rekey" | "zenpos";
  /** Push a ticket. Must be idempotent on orderId. */
  send(ticket: PosTicket): Promise<PosSendResult>;
  /** Optional inbound status reconciliation. */
  reconcile?(externalRef: string): Promise<PosStatus>;
  /** Optional item availability pull. */
  pullAvailability?(): Promise<PosAvailability[]>;
}
```

`ManualRekeyAdapter.send()` writes a `pos_sync` row with `state = 'manual'` and returns
immediately. All the work happens in the UI: the ticket panel renders the order in POS vocabulary,
the cashier re-keys it, and taps "Mark as entered in POS", which stamps `entered_by` and
`entered_at` and flips the card's In-POS badge. A second tap is blocked.

`ZenPosAdapter.send()` is a stub that throws `NotImplementedError` until discovery completes. The
adapter selection reads from `app_settings.pos_adapter`, so switching is a settings change, not a
deploy.

### 16.4 Mapping layer

**Corrected 2026-08-11, on the owner's report that each branch runs its own ZenPOS account.** The
design below inherited a single-account assumption from the reference project, which ran one
Loyverse account across the whole business. That does not hold here.

If every branch is a separate account, then every branch has its own item catalog, and the same
wing on the menu carries a **different POS id at every branch**. A single `pos_item_id` column on
`menu_items` can only ever be right for one branch. It has to become a join table keyed by
`(branch_id, menu entity)`, something like `pos_item_mappings (branch_id, menu_item_id,
pos_item_id, pos_item_name)`, and the same for variations and options. Credentials follow the same
rule: one set per branch, stored per branch, never a single pair of environment variables.

This is cheap to get right before the mapping tables exist and expensive afterwards, since fixing
it later means a migration plus re-mapping every item by hand at every branch. Treat the columns
below as the shape the reference used, not the shape to build.

~~Carry over the ZOMBEANS mapping tables in renamed form:~~ `menu_items.pos_item_id` and
`pos_item_name`, `item_variations.pos_variant_id` and name, `menu_options.pos_modifier_id` /
`pos_line_item_id` and name. **Persist the POS-side display names at mapping time**, not just the
IDs, so the ticket panel renders offline and fast. Where a mapping is missing, fall back to the
webstore snapshot name so a ticket line is never blank. A muted `web: "<original name>"` line under
each item acts as the cashier's confidence check.

Build `/workspace/pos` with three tabs: Mapping (link menu entities to POS entities), Sync status
(recent `pos_sync` rows, failures, retry), and Settings (adapter selection, credentials status,
never the credentials themselves).

**When you build the POS item picker, paginate.** The reference shipped a bug where Loyverse's
`/items` returned about fifty per page, the mapping UI read only page one, and half the catalog
showed as "Unmapped" with truncated dropdowns. Assume ZenPOS paginates too.

---

## 17. Payment flow

**Owner ruling, 2026-08-11: pickup is strictly payment first.** The customer pays online before the
order is processed. There is no pay at counter and no pay later. An order is not sent to the branch,
and does not consume kitchen capacity, until payment has cleared.

This inverts D4 and moves PayMongo from Phase 5 optional to a Phase 1 launch blocker. **As written
today the platform cannot satisfy this ruling**, and the gap is not a flag: `lib/paymongo` was never
ported, `app_settings.paymongo_enabled` defaults false, `place_order` rejects every non-counter
method while that flag is off (`0013_place_order.sql:260`), and `lib/checkout/schema.ts` pins
`payment_method` to `'counter'` on purpose. Turning counter off before online prepay works and is
merchant-approved closes ordering completely. Sequencing, and the consequences below, are the
owner's to accept.

Consequences that follow from the ruling and are not yet built:

- **Refunds become mandatory rather than optional.** Money is taken before the food is made, so
  every sold-out item, kitchen failure, or branch closure now creates a refund obligation. Port the
  reference's staff refund workflow.
- **The claim tap simplifies.** Claim becomes pickup-code verification only. The counter-payment
  capture inside the same action (`0018_staff_order_ops.sql:99`, `0024_...:114`) becomes dead code
  for pickup and should be left in place but unreachable, not deleted, since `payment_method` still
  carries `'counter'` for any future in-store use.
- **No-show changes meaning and needs an owner answer.** Previously a no-show cost the business
  nothing. Now the customer has paid and not collected. Hold, remake, refund, or forfeit is a
  business decision, not a technical one. Added to section 28.
- **Guest ordering survives**, because guests can prepay. The correction below therefore loses its
  first and strongest premise but not its conclusion.
- **The refund policy page stops being card-only paperwork** and becomes genuinely required, since
  money is now always taken online.
- **Analytics loses the paid versus counter no-show split**, which was the stated business case for
  enabling prepay. The ruling settles that question by fiat instead.

**Superseded by the ruling above, retained for its reasoning.** ~~Pay at counter (default on).~~
Order is placed `pending` with a `payments` row in `due` state. ~~Requires a signed-in account.~~
Payment is recorded at the moment of claim, in the same action that verifies the pickup code.
No-show after the window releases the slot and cancels.

**Correction, written while building `place_order`.** Pay at the counter does not require a
signed-in account, and section 11's "Sign in to pay at the counter" affordance is therefore not
built either. Three things make the original rule unshippable here:

1. **It would close ordering entirely.** Online prepay is the alternative the rule assumes a guest
   still has, and it is flag-gated off behind `paymongo_enabled` until the business is approved.
   Counter is the only rail. A guest who cannot use it cannot order at all.
2. **Sign-in arrives last.** Section 27 puts customer email OTP at the end of Phase 1, after
   `place_order` and after the tracking page. Requiring an account first inverts that order and
   leaves two steps with nothing to demonstrate.
3. **The schema was built for guest orders.** `orders.user_id` is nullable and documented "Null for
   guests", `checkout_attempts.actor_kind` admits `'guest'`, and `orders.tracking_token` exists
   specifically because "guest order tracking requires this". Refusing guest orders would leave all
   three unreachable.

The reference required an account for cash so the order would count for loyalty, vouchers and
order history, and so a no-show had a name attached. None of those exist on this platform yet, and
the pickup code plus a phone number carries the counter. When customer sign-in lands, the signed-in
path is strictly better (prefilled details, order history, a tracking page that needs no token) and
should be the one the screen encourages, but not the only one it allows.

**This is reversible in one `if`, and it is the owner's call rather than a technical one.** If they
want accounts compulsory, `place_order` raises `AUTH_REQUIRED` when `auth.uid()` is null, and
`lib/checkout/messages.ts` grows one entry.

**Online prepay (default off, flag `paymongo_enabled`).** Port the ZOMBEANS PayMongo layer whole:
`lib/paymongo/{client,config,intents,methods,webhook,confirmation,attach-result}.ts`, the
`paymongo_payments` migrations, and the webhook route.

- QR Ph is the reliable live method (approved and working in the reference). GCash and Maya go
  through the same intent flow. Card requires the legal pages and separate merchant approval:
  build the pages, leave card off.
- The QR is presented in a centered modal with save and download, plus a resume banner if the
  customer navigates away.
- Order stays `pending` until PayMongo confirms it. A definitive `payment.failed` webhook cancels
  the order and releases its pickup slot immediately. A `pg_cron` job handles abandoned intents
  that never return a result.
- One payment row per order, enforced by a unique constraint.
- Webhook signature verification is mandatory. Note again: PayMongo webhooks cannot be deleted,
  only disabled, and Vercel "Sensitive" environment values are write-only, so record which endpoint
  your signing secret belongs to somewhere you can read it later.

**Refunds** are manual and out of scope for the build. Document the process on `/refund`.

---

## 18. Vouchers and promotions

Port the voucher engine unchanged. It is complete and well-tested in the reference.

- Fixed-amount and percentage codes, minimum order, expiry, usage cap, per-customer cap.
- The client sends a **code only**. `place_order` resolves the peso value from the `vouchers` row.
  Any discount amount arriving from a client is ignored.
- `voucher_redemptions` records every use. A cancelled or rejected order returns the voucher.
- Flag `vouchers_enabled`, off by default.
- Admin CRUD at `/workspace/vouchers`.

**Deploy discipline, inherited as a hard rule:** every voucher migration goes in **before** the
code ships. Applying the first migration alone fails open: the screen shows a discount and the
customer is charged full price.

**Launch promo suggestions for the pitch** (do not implement, put them in the README as a
go-to-market slide): a first-order pickup code, a slow-hours discount targeting the 2pm to 5pm
trough, and a "skip the queue" framing rather than a discount, since pickup ordering sells time.

---

## 19. Loyalty: recommendation

**Recommendation: keep the reward rail, replace the accrual rule. Build it in Phase 4 or mark it
Optional.**

ZOMBEANS runs a digital version of a physical stamp card: eight stamps, one per qualifying order,
producing a peso voucher. That works for a café where every ticket is roughly one drink at a
similar price.

**It breaks at NYBB.** The ticket spread is enormous: PHP 59 for a boiled egg against PHP 879 for
salmon, and a group package well beyond that. One stamp per order means a customer buying eggs
eight times earns the same reward as one buying eight seafood platters. That is not a loyalty
program, it is an arbitrage.

**Better design:**

- Accrue **points on spend**, not stamps on visits. One point per peso, reward at a threshold.
  Same `loyalty_stamps` table with the column renamed to `points_earned`, same
  `award_loyalty_stamp` trigger point, same voucher issuance on threshold. The engine survives; one
  arithmetic line changes.
- Keep the voucher as the reward instrument. It is already built, already audited, and it means
  loyalty rewards flow through the same server-authoritative discount path as promo codes rather
  than inventing a second one.
- Keep the expiry and the reminder cron.
- **Do not** try to link the existing paper cards. The reference found its physical cards carry
  only a name line and are unlinkable to accounts. Run the digital program in parallel and let the
  paper one lapse naturally.

If the phase budget is tight, ship the schema and the settings, leave `loyalty_enabled` false, and
present it as a designed-and-ready feature. That is a stronger pitch position than a half-working
stamp card.

---

## 20. Analytics

Port `order_analytics(from_ts, to_ts)` as the pattern: **aggregate in SQL, not in Node**, guard it
with `current_role_kind() in ('staff','admin')`, exclude test orders from every money figure, and
collapse to one representative paid payment per order so multi-row payments cannot double-count.

**Drop:** the by-service-mode breakdown, delivery fee revenue, rider metrics.

**Add, because they are the questions a pickup-only restaurant actually asks:**

| Metric | Why it earns its place |
|---|---|
| Orders and revenue by hour of day | Drives staffing and the slot capacity setting. The single most actionable chart. |
| Slot utilization (reserved vs capacity) | Shows whether the throttle is too tight or too loose. |
| Median and p90 prep time, from `preparing_at` to `ready_at` | The promise the platform makes to customers. Track whether it is kept. |
| Wait time from `ready_at` to `claimed_at` | How long food sits. Directly a quality metric. |
| No-show rate against refund cost | ~~The business case for turning online prepay on.~~ The split by paid versus counter died with the payment-first ruling, since every order is now paid. What the owner needs instead is what no-shows cost in refunds. |
| Flavor and heat mix | Prep and inventory planning, and it is the most brand-specific chart on the page. |
| Top items and top pairings | Menu engineering. |
| New vs returning customers | The reason to own the channel instead of renting Foodpanda. |

Keep the discount-check card from the reference: it catches vouchers being applied at a rate that
suggests a leak.

---

## 21. Mobile-first responsive design

Over seventy percent of Philippine restaurant traffic is mobile. Design at 375px first and let
desktop be the enhancement.

- Breakpoints: 375 (baseline), 768 (tablet), 1280 (desktop container max).
- Bottom-sticky cart bar whenever the cart is non-empty. Thumb-reachable primary actions.
- Horizontally swipeable category tabs with scroll-snap.
- Minimum 44px hit targets. Focus rings always visible (use `outline`, not `box-shadow`, per the
  gotcha in section 4).
- Wide content (the analytics tables, the POS ticket) scrolls inside its own `overflow-x: auto`
  container. The page body must never scroll horizontally.
- Images: `next/image` with explicit sizes, blur placeholders generated by `sharp` at upload.
- **The staff workspace is landscape-first**, a separate concern from the storefront. Android PWA
  can lock orientation via the manifest, iOS cannot. Key layout rules on viewport **height**, not
  on orientation, because landscape tablets were already fine and landscape phones were the broken
  case.
- Respect `prefers-reduced-motion`: disable the tilt, the sweep, and the countdown pulse.

---

## 22. Security

**Tier 1, build these (non-negotiable even for a demo):**

1. RLS enabled on every table with explicit policies. No table is readable by `anon` by default.
2. Explicit `GRANT`s. New tables get them or you get 42501.
3. All order and payment writes through `SECURITY DEFINER` functions that check
   `current_role_kind()` internally.
4. Server-authoritative pricing. The client sends item ids, variation ids, option ids, quantities,
   and a voucher code. Nothing else. Never a price, never a total, never a discount amount.
5. Idempotent checkout keyed on a client-generated UUID validated against a strict pattern.
6. Rate limiting on order placement, OTP requests, and the franchise form. Fail open on the rate
   limiter itself so a limiter outage cannot take down ordering.
7. Nonce-based CSP with `strict-dynamic`, plus HSTS, `nosniff`, `frame-ancestors 'none'`,
   `X-Frame-Options: DENY`, and a restrictive Permissions-Policy.
8. Separate customer and staff cookie namespaces, with the staff role re-checked from the database
   on every workspace request.
9. The service-role key is used only in explicitly named server modules. Audit that
   `createAdminClient` (service role) is never confused with `createAdminSessionClient` (anon key
   plus a staff cookie, which remains subject to RLS on every page).
10. Zod validation at every boundary: server action inputs, route handler bodies, webhook payloads,
    form data.
11. Webhook signature verification, constant-time comparison for cron secrets.
12. Audit log for every staff mutation.

**Tier 2, document as production hardening, do not build now:** penetration test, WAF or bot
management, secret rotation policy, backup and restore drill, SOC-style alerting, DPA compliance
review for Philippine data privacy (the current site already carries a Privacy Notice, extend it),
and PCI scope review before enabling card payments.

Write both tiers into `docs/security.md` so the CEO deck can honestly say what is done and what is
planned.

---

## 23. API architecture

**Default to Server Actions.** They are typed end to end, they carry no separate auth surface, and
they are what the reference uses for cart, checkout, payment, vouchers, and every workspace
mutation. Remember the `"use server"` async-only export rule.

**Use Route Handlers only where a non-browser caller exists:**

```
POST /api/paymongo/webhook        signature-verified, no auth
POST /api/pos/webhook             ZenPOS inbound, if discovery finds webhooks
GET  /api/cron/expire-orders      constant-time secret, called by pg_cron via pg_net
GET  /api/cron/no-show-sweep      same
GET  /api/cron/send-notifications same
POST /api/push/subscribe          service worker registration
GET  /api/auth/nav-state          hydrates auth state on statically generated pages
GET  /api/store/hours             public, cached, for the footer and the closed banner
GET  /api/branches/[slug]/slots   available pickup slots with remaining capacity
```

**Added while building Phase M1.** The native customer app is exactly the
non-browser caller this section reserves Route Handlers for, and it needs more
than a slot read:

```
GET  /api/mobile/v1/menu                            published catalog
GET  /api/mobile/v1/slots                           pickup windows
POST /api/mobile/v1/orders                          checkout
GET  /api/mobile/v1/orders/[shortCode]              order read, bearer or tracking token
POST /api/mobile/v1/orders/[shortCode]/payment      start a payment
POST /api/mobile/v1/orders/[shortCode]/payment/mock development simulator, 404 in production
POST /api/mobile/v1/orders/[shortCode]/arrival      customer arrival signal
```

These are not a second implementation of checkout. The customer Server Actions
were reduced to adapters over the services in `lib/customer/`, and the routes
call the same code with a bearer token where the browser has a cookie. The path
carries a version because an installed app cannot be redeployed alongside the
server. `docs/mobile-api-contract.md` is the contract; the default in the
paragraph above still holds for the web workspace.

**Postgres RPCs are the third layer**, and they own anything that must be atomic or authorized in
the database: `place_order`, `staff_set_order_status`, `cashier_advance_order`,
`claim_order_with_code`, `award_loyalty_points`, `get_storefront_menu`, `get_order_by_tracking`,
`store_is_open_at`, `order_analytics`, `rate_limit_hit`.

**Caching:** ~~menu pages statically generated and revalidated by tag on menu mutations.~~ Settings
and hours cached with `unstable_cache` and a named tag, invalidated by the settings action. Order
data is never cached.

**Correction, written while building Phase 1.** Menu pages cannot be statically generated, because
section 22 item 7 requires a nonce-based CSP and the two are mutually exclusive. A nonce is minted
per request, and Next can only stamp it onto script tags while rendering that request; a
prerendered page carries no nonce, `strict-dynamic` then discards the `'self'` allowlist, and the
browser blocks every script on the page. Next's own guide states it plainly: "When you use nonces
in your CSP, all pages must be dynamically rendered." PPR is incompatible for the same reason.

This was not theoretical. Both were specified, both were built, and the production build hydrated
nothing at all for a release: `next dev` renders per request and hid it completely.

The security requirement is Tier 1 and non-negotiable, so it wins, and `app/layout.tsx` calls
`await connection()` to keep every route dynamic. Caching moves down a layer rather than being
abandoned: the menu is still cached by tag behind `getStorefrontMenu()`, and what is paid per
request is HTML rendering, not a database round trip. If that ever costs too much, cache the data
and the fragments. Do not restore prerendering, and do not weaken the CSP to buy it back without
the owner agreeing to trade away a Tier 1 control.

---

## 24. Testing

- **vitest** for every pure function: pricing resolution (all three fallback paths in 6.4), slot
  capacity math, status transitions, permission resolution, voucher validation, loyalty accrual,
  store-hours windows, peso formatting. Target the reference's density, roughly ninety-five test
  files for a codebase of this size.
- **Playwright** for five specs: guest online-prepay order end to end, ~~signed-in pay-at-counter
  order~~ **a signed-in prepay order plus an abandoned payment that expires and releases its slot**,
  staff fulfillment through to claim, menu availability and sold-out states, pickup-slot
  exhaustion. The counter spec is retired by the payment-first ruling, and the expiry path replaces
  it because it is the new way an order can fail silently.
- **A known trap:** Playwright WebKit cannot load the dev server, because
  `upgrade-insecure-requests` upgrades `localhost` and the page silently renders unstyled and
  unhydrated, testing nothing. Run WebKit against a deployed HTTPS preview, not localhost.
- **A second known trap:** e2e specs that scroll to trigger an IntersectionObserver race card
  hydration. Wait for a hydration marker before scrolling. Reproduce timing bugs with Playwright's
  CPU throttling, then remove the throttling before committing.
- Time-dependent tests must inject a clock. The reference had specs that passed in the morning and
  failed in the evening because the store had closed.
- `npm run build` is part of the test loop, not just `tsc`. RSC boundary errors only appear there.

---

## 25. Deployment

- **Vercel**, GitHub-connected, preview deployments per PR.
- **Supabase** for Postgres, Auth, Realtime, Storage. Two projects if budget allows (staging and
  production); one project with a `staging` schema if not.
- **Migrations are numbered, sequential, forward-only, and applied manually in order.** Every
  migration file states at the top what it does and whether it must land before or after the code
  that uses it. Feature flags default to **off** so code can ship ahead of its migrations safely,
  except where the voucher rule in section 18 applies.
- **Scheduled jobs via `pg_cron` + `pg_net`**, not `vercel.json`.
- **Environment variables** (mirror the reference's `.env.example` structure):
  ```
  NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  NEXT_PUBLIC_SITE_URL
  SUPER_ADMIN_EMAIL
  NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
  PAYMONGO_SECRET_KEY, NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY, PAYMONGO_WEBHOOK_SECRET
  RESEND_API_KEY, RESEND_FROM
  ZENPOS_BASE_URL                            (unset until discovery completes)
  CRON_SECRET
  ```
  **`ZENPOS_API_KEY` was removed on 2026-08-11.** Each branch runs its own ZenPOS account, so
  credentials are per branch and cannot live in a single environment variable. They belong in a
  per-branch secret store that the adapter reads by `branch_id`, with the workspace showing only
  whether a branch's credentials are present, never their value. Adding branch eleven must not
  require a deploy. See section 16.4.
  Note the build-time trap: `/menu` reads Supabase during `next build`, so the Preview environment
  scope needs `NEXT_PUBLIC_SUPABASE_*` or the build fails. Readers must fall back to a static
  catalog anyway.
- **Domain:** the business owns `nybuffalobrads.com.ph` on cPanel hosting. Do not touch it. Deploy
  to a Vercel subdomain (`order.nybuffalobrads.com.ph` via a DNS-only CNAME when approved) and
  leave the WordPress brochure site running until the CEO decides. Write the cutover as a checklist
  in `docs/domain-cutover-checklist.md`, do not execute it.

---

## 26. Future scalability

Design decisions that keep the door open, and what you would do next:

1. **Multi-branch** is already in the schema. Turning on branch two is: insert a `branches` row,
   attach a price list, set hours, flip `is_active`, flip `multi_branch_enabled`.
2. **Dine-in and QR table ordering** return by relaxing the `service_mode` CHECK and adding a
   `tables` table. The order pipeline does not change.
3. **Delivery**, if the business ever wants to stop paying aggregator commission, is a new service
   mode plus a rider role. The reference has a complete, working implementation to copy from.
4. **Franchisee self-service:** `branches` plus `price_lists` plus the permission model already
   support scoping a manager to one branch. Add a `branch_id` to `staff_permission_overrides` and a
   branch filter on the board.
5. **A second brand or a Sports Lounge revival** is a `brand` value on the branch plus a new price
   list. Build nothing for it now. If it ever needs a different visual identity, the token set is
   one CSS file.
6. **Native app:** the workspace is already an installable PWA. iOS push has scope limits documented
   in the reference at `docs/ios-native-push-scope.md`.
7. **Kitchen Display System:** the `preparing` and `ready` transitions are already events. A KDS is
   a new realtime subscriber, not a new pipeline.
8. **Scale ceiling to watch:** Supabase free-tier **egress**, not storage. The reference blew its
   meter on image egress, not on rows. Long image cache TTLs and immutable upload paths are the fix
   and they are already specified in section 5.6.

---

## 27. Build phases

Each phase ends with something you can put in front of a person. Do not start a phase before the
previous one builds clean and its tests pass.

**Phase 0, foundation.** Next 16 + TS + Tailwind v4 + Base UI scaffold. Brand tokens and fonts.
Header, footer, layout. CSP and security headers. Supabase project. Migrations 0001 to 0010: types,
branches, price lists, menu, cart, orders, staff, settings, RLS, grants. Seed the real NYBB menu
from section 2.2. **Run the image ingest pipeline from 5.6 over the existing library as a scripted,
repeatable job** (`scripts/ingest-legacy-images.ts`): fetch by filename, crop out the corner
watermark, resize, convert, upload to Storage, and write the `menu_items.image_url` mapping. Do
this in Phase 0, not later, because the grid layout cannot be judged without real photos in it.
Static landing, menu, about, contact rendering from a static catalog.
*Deliverable: a beautiful, fast brochure site with real food photography that already reads as
NYBB.*

**Replanned 2026-08-11 for the payment-first ruling (section 17).** The old plan treated online
payment as an optional Phase 5 extra sitting behind a flag, because pay at counter carried the
launch. It cannot any more. Payment moved from the end of the plan to the middle of the critical
path, and holding customer money before the food is made created a second body of work (refunds)
that did not previously exist. The phases below replace the original six.

**Phase 1a, ordering. Shipped.** Menu from the database. Product detail with the wings configurator
and the heat meter. Variation-dependent option pricing. Cart. Pickup slots. `place_order` RPC with
idempotency and rate limiting. Order tracking page with the pickup code. Customer email OTP.

Its checkout collects nothing and marks the order due at the counter, which the ruling disallows.
Nothing here was wasted, and none of it needs unwinding. The payment step is the part that changes.

**Phase 1b, payment. New, and the launch blocker.** Port the ZOMBEANS PayMongo layer whole
(section 17): client, config, intents, methods, webhook, confirmation, attach-result, the
`paymongo_payments` migrations, and the webhook route. Then:

- QR Ph first, since it is the rail proven live in the reference. GCash and Maya through the same
  intent flow. Card stays off, it needs separate merchant approval and the legal pages.
- Checkout switches to prepay. `place_order` accepts online methods, and counter becomes
  unreachable from pickup checkout without being removed from the schema.
- Order stays `pending` until PayMongo confirms it. A definitive failure cancels the order and
  releases its pickup slot immediately. Signature verification is mandatory.
- A `pg_cron` job expires abandoned unpaid intents and releases the pickup slot they were holding.
- One payment row per order, enforced by a unique constraint.

*Deliverable: a customer can place and pay for a real pickup order.*

**This phase has an external dependency the repo cannot resolve: PayMongo merchant approval.**
Build and test against PayMongo's test mode meanwhile. Approval gates going live, not building.
Start the application now rather than when the code is ready, because it is the long pole.

**Phase 2a, staff. Shipped.** Workspace shell, auth, roles and permission overrides. Realtime orders
board with the three-tap flow. Pickup-code claim. Order history. Store availability and hours.
Audit log.

Two corrections fall out of the ruling, both small: claim verifies the pickup code and collects
nothing, and the board's "Collect at counter" badge goes, because there is no such order any more.
The counter-capture branches in the claim RPCs stay in place and become unreachable.

**Phase 2b, money out. New, and also a launch blocker.** We now take payment before the food is
made, so the business can owe a customer money, which was never true under pay at counter. Required
before the first real order, not after:

- A staff refund workflow, full and partial, permission-gated and audit-logged. The implementation
  is in progress: order history and customer tracking are wired, while the active board remains
  limited to food preparation states.
- The `refunded` payment status wired through order history and the customer tracking page.
- The refund policy page published, and reachable from checkout.
- No-show handling rebuilt around the owner's policy answer (section 28). The current sweep assumes
  a no-show costs nobody anything. That assumption is now false.

*Deliverable: a staff member can make a customer whole when the kitchen cannot deliver.*

**Phase 3, notifications and POS.** Expo push to the customer app for ready, rejected and
cancelled; Web Push for staff-new-order. "I'm here". The `PosAdapter` interface,
`ManualRekeyAdapter`, the ticket panel, the In-POS guard, and the `/workspace/pos` mapping UI.
Send `docs/zenpos-questions.md` to ZenPOS and record the answers in `docs/zenpos-discovery.md`.
*Deliverable: the pickup loop closes. This is the demo.*

**Corrected 2026-08-13, same change as section 15.** This phase used to say "Web Push for
customer-ready" and one customer event. Both halves of that are now wrong: the customer transport
is Expo, and three events reach the customer, not one.

**This phase has external dependencies the repo cannot resolve, and they are not the same ones
Phase 1b has.** An Expo project id, an FCM server key, an APNs key, and a real build are all
required before a single customer notification can be delivered, and the APNs key needs a paid
Apple Developer membership. `docs/push-device-test-checklist.md` lists them and says what each
one blocks. Note that the Apple membership is on the critical path for iPhone customers ORDERING
at all, not only for notifying them, so it is a launch dependency rather than a notifications
dependency. Start it now.

**Phase 4, owner tools.** Menu management CRUD with availability holds. Settings form. Analytics.
Vouchers. Reorder. Note that the analytics no-show split by paid versus counter is gone, since
every order is now paid. Replace it with no-show rate against refund cost, which is the number the
owner will actually want.
*Deliverable: the owner can run the platform without a developer.*

**Phase 5, optional.** Loyalty points. Email. Recommendations. The branch picker unhidden. k6 load
scripts. PayMongo card, if the business ever wants it, with the legal pages and separate approval
it requires.

### What the reordering costs

Launch now depends on two things the build does not control: PayMongo merchant approval, and the
owner's no-show and refund policy. Neither can be worked around in code, and both should be started
today rather than when their phase comes up.

Everything not in Phase 1b or 2b can proceed in parallel while approval is pending. The menu, the
board, availability, the POS ticket panel, and the owner tools are all independent of which payment
rail is live. Do not idle the build waiting on a payment processor.

---

## 28. Items that need owner input

Stop and ask before deciding these. Do not invent answers.

1. ~~**Which single branch goes live first?**~~ **Resolved 2026-08-10.** The owner selected
   **Central Bloc, IT Park, Lahug** as the pilot branch. Keep it inactive until its real operating
   hours and kitchen capacity are confirmed.
2. ~~Hot Wings or Sports Lounge menu?~~ **Resolved.** Hot Wings, the only trading brand.
   Seed `hot-wings-standard` as the single price list.
3. ~~**Real operating hours per weekday.**~~ **Resolved 2026-08-11.** Central Bloc, IT Park is
   open 24 hours, seven days a week. Migration `0026` represents this explicitly as an equal
   open and close time on every open day, rather than inventing a one-minute closure. The generated
   seed remains empty so a new production database still fails closed until its confirmed settings
   are entered through the owner controls.
4. **Prep time and slot capacity.** How many orders can the kitchen genuinely absorb per fifteen
   minutes at peak? Get a number from a manager, not an estimate.
5. **ZenPOS technical contact**, so the section 16.2 checklist can be answered. The sendable
   version of that checklist is `docs/zenpos-questions.md`; internal reasoning, which is not for
   the vendor, is in `docs/zenpos-discovery.md`.
5b. **No-show policy under payment first.** The customer has paid and did not collect. Is the food
   held for a stated period, remade on a later visit, refunded in full, refunded in part, or
   forfeited? This did not need an answer while orders were unpaid. It does now, and it needs to
   be published to customers before the first order, since it is a money question.
5c. **Who reconciles online sales at branch cash up**, and in what form they need them, so the
   ZenPOS tender-type answer can be judged against a real process rather than a guess.
6. **The original shoot deliverables.** Per 5.6, ask specifically for: (a) the cutout source files
   **with alpha**, not the orange-flattened JPEGs, and (b) full-resolution wing photos for Cheezy,
   Salted Egg, and Smokey Barbecue, which exist only as 300x300 thumbnails. Clean product shots for
   the coffee and waffle lines would close the last gap and are a phone-and-plain-background job.
   The logos are already clean transparent PNGs and need nothing.
7. **Whether the franchise inquiry form should stay on this platform** or keep pointing at
   `5bdf.ph`.

---

## 29. Definition of done

The build is done when all of these are true:

- [ ] A customer on a 375px phone can go from landing to a **paid** pickup order in under ninety
      seconds, including choosing a wing flavor and heat level and completing payment.
- [ ] The order reaches the staff board only after payment clears, and appears in under two seconds
      without a refresh.
- [ ] An abandoned payment expires on its own and releases the pickup slot it was holding, verified
      by a test rather than by watching it.
- [ ] Staff move it to Ready in one tap and the customer's phone buzzes on a locked screen.
- [ ] The pickup code verifies at the counter and closes the order. It collects no money, because
      there is none left to collect.
- [ ] A staff member can refund an order, in full and in part, and the customer's tracking page and
      the audit log both reflect it.
- [ ] The published refund policy matches what the software actually does when the kitchen cannot
      deliver.
- [ ] A full pickup slot is genuinely unbookable, verified by an e2e test.
- [ ] Heat-level pricing is correct for both HALF and FULL, verified by unit tests on all three
      price-resolution paths.
- [ ] The owner changes a price, a weekly closing time, and the slot capacity through the UI, with
      no deploy, and every customer-facing surface reflects it.
- [ ] `npm run build`, `npm run lint`, `npm test`, and `npm run test:e2e` are all green.
- [ ] Every table has RLS. No client request can influence a price.
- [ ] `docs/security.md`, `docs/zenpos-questions.md`, `docs/zenpos-discovery.md`, and `README.md`
      exist and are accurate.
- [ ] Nothing in the codebase mentions delivery, riders, dine-in tables, Loyverse, or zombies.
- [ ] Nothing in the app references the closed Ayala Central Bloc location or the Sports Lounge
      brand: not a branch row, not a menu item, not a footer social link.

---

## 30. Anti-goals

Things you might be tempted to do. Do not.

- Do not port the delivery subsystem "in case they want it later." The reference is right there if
  they ever do.
- Do not build a generic multi-tenant restaurant platform. Build NYBB's pickup platform on a schema
  that happens to scale.
- Do not write ZenPOS HTTP code before the discovery checklist is answered. You will build the
  wrong thing, exactly as the reference did with Loyverse.
- Do not copy ZOMBEANS copy, colors, illustrations, or the doodle background. Not one hex value.
- Do not let the client compute or send any price, total, discount, or fee.
- Do not add a payment method the business has not been approved for.
- Do not use `vercel.json` cron.
- Do not ship a feature flag defaulted to on.
- Do not write Next.js from memory. Read `node_modules/next/dist/docs/`.
