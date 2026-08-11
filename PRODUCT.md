# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Three audiences are **co-equally primary**. No one of them outranks the others when their needs
conflict; each surface brief decides locally which one it serves.

**1. The customer, on a phone.** Someone in Cebu who wants NYBB wings. Confirmed as arriving in
three distinct scenes, all real, all of which the interface must survive:

- **Ordering ahead, then walking in.** Office lunch from a desk in IT Park, or ordering on the way
  over. The value is time: skip the queue. Calm conditions, attention available.
- **Standing in the queue.** Already at the counter, ordering on their own phone to get ahead of
  the line. One hand, noisy, rushed, someone waiting behind them. Every extra tap is felt.
- **Sitting down, browsing hungry.** Deciding what they want. Photography and the heat scale do the
  selling, and time spent on the page is a good thing rather than a cost.

**2. The counter and kitchen staff, on a landscape tablet.** They live in the order board for a
whole shift: accept a new order, move it through prep, mark it ready, verify a pickup code at the
counter, and re-key the ticket into ZenPOS. Hands may be wet or gloved. The board is glanced at
across a counter, not read up close.

**3. The owner and the CEO.** The owner runs the menu, hours, prices and slot capacity without a
developer. The CEO evaluates whether this platform should replace the current arrangement. Per
locked decision D5 this build is an internship deliverable and a pitch, so the CEO is a genuine
user of the artifact, not just its approver.

## Product Purpose

Replace a static WordPress brochure site and an outsourced third-party ordering link with a
first-party, pickup-only ordering platform that New York Buffalo Brad's owns end to end.

Today the live site's "Order Here" page orders nothing: it links out to `buffalobrads.tablevibe.co`
and to a Foodpanda restaurant page. The business owns no order data, holds no customer
relationship, and pays aggregator commission on every ticket. There is no cart, no tracking, no
admin view, no notifications, and no POS connection.

Success is the closed pickup loop: a customer orders on their phone, pays now or at the counter,
watches a live status page, gets a push notification when the food is ready, walks in, gives a
pickup code, and leaves. Staff see the order land on a realtime board within two seconds and move
it through prep in one tap per stage. The owner sees sales and edits the menu without a deploy, and
every row of data belongs to the business.

## Positioning

Three things a neighboring product could not truthfully copy:

- **Pickup only, and designed for it.** Not a delivery platform with pickup bolted on. Capacity
  bounded `pickup_slots` replace free-text pickup times, so a full slot is genuinely unbookable and
  the kitchen is never oversold. This is the single most important upgrade in the build.
- **Heat is a product, not a note.** NYBB sells hotness as a priced, five-step scale (LITE 20%
  through INSANE 100%) whose price depends on the wing size chosen. No competitor's menu model has
  to express that, and the current website wastes it as plain text.
- **First-party ownership.** Order data, customer relationship, and margin stay with the business
  instead of an aggregator.

## Operating Context

**The order.** Wings are configured, not just added: size (HALF 6pcs or FULL 10pcs), one flavor
from nine at no upcharge, then a heat level whose add-on price is variation dependent. The customer
receives a short pickup code plus a separate unguessable tracking key.

**The counter.** Pickup happens at a physical counter, verified by code. The customer may signal
arrival with an "I'm here" action that pings the counter. No-shows are the main abuse vector for a
pickup-only store. A signed-in account is encouraged because it adds saved details and history, but
guests may order, because they can prepay. **Payment first (owner ruling, 2026-08-11) changes what a
no-show costs**: the customer has already paid, so a no-show is now a refund question rather than a
lost sale, and the policy is an open owner decision.

**The kitchen.** Orders move New to Preparing to Ready to Claimed. Staff re-key each ticket into
ZenPOS by hand, because ZenPOS publishes no documented order-ingest path. The manual re-key panel
is the day-one path, not a fallback.

**The sites differ, and this is load bearing.** The chain spans a mall food hall, a hospital mall
kiosk, a casino outlet, four petrol-station forecourts, and street-front stores. A Shell forecourt
has drive-up behavior, a food hall has a shared counter, IT Park has an office-lunch rush. Prep
time and slot capacity are per branch for this reason, and no single number fits all of them.

**Prices vary by site.** The same dish has carried two different prices under this company (Classic
Buffalo at PHP 329 on the franchise list and PHP 359 at the Sports Lounge), which is why pricing is
list based rather than a single price column.

**Currency is PHP.** All money is stored and computed in centavos, server side.

## Capabilities and Constraints

**Confirmed functionality.** Menu browsing with category tabs and a photo grid; a wings
configurator with variation dependent option pricing; cart with server sync; capacity bounded
pickup slots; server authoritative checkout via a `SECURITY DEFINER` `place_order` RPC with
idempotency and Postgres rate limiting; order tracking by short code plus a private tracking key;
customer email OTP and account profiles; isolated staff email OTP; cashier, kitchen and manager
permission resolution; and a role-gated workspace shell with live order counts.

**Planned in the remaining phases.** Web push for customer-ready and staff-new-order; the manual
POS re-key workflow; menu, hours and availability management; analytics; vouchers; and the
optional payment and loyalty work. The realtime staff board and pickup-code claim are built.

**Hard constraints.**

- **Pickup only** (locked decision D1). No delivery, no dine-in, no rider subsystem, no
  service-mode selector. Nothing in the codebase may mention delivery, riders, dine-in tables,
  Loyverse, or the reference project's theming.
- **Single branch at launch on a multi-branch schema** (D2). Every menu, pricing, hours, stock,
  order and settings table carries `branch_id`. The branch picker is fully built and flag hidden.
  Never hardcode a branch.
- **The client never sends a price.** No total, discount, or fee originates on the client. Every
  order write goes through a `SECURITY DEFINER` Postgres function. Every table has RLS.
- **No feature flag ships defaulted to on.** Settings fail closed. ~~Both payment rails (pay at
  counter, and PayMongo online prepay) exist behind flags, off by default (D4).~~ **Superseded
  2026-08-11: pickup is payment first.** Online prepay is the only rail offered to customers, and
  it must be live before ordering opens. The counter rail stays in the schema but is unreachable
  from pickup checkout.
- **Guests may order, and they prepay like everyone else.** No account is required to pay online.
  The database still records an authenticated owner whenever a customer chooses to sign in.
- **The Sports Lounge is closed** as of August 2026, and the Ayala Malls Central Bloc branch with
  it. Nothing in the app may reference either: not a branch row, not a menu item, not a footer
  social link. The `branches.brand` column keeps the concept expressible at zero cost, but nothing
  is built for it.
- **Only the Hot Wings price list is seeded.** The Sports Lounge menu is historical reference.
- **Next.js 16**, where middleware is `proxy.ts`. Framework idioms are read from
  `node_modules/next/dist/docs/`, never written from memory. `npm run build` is part of the test
  loop, because RSC boundary errors appear only there.
- **The storefront renders dynamically, deliberately.** A nonce based CSP and static generation are
  mutually exclusive in Next: a prerendered page carries no nonce, so `strict-dynamic` discards the
  `'self'` allowlist and the browser blocks every script. The CSP is non-negotiable, so
  `app/layout.tsx` calls `await connection()` and every route is server rendered on demand.
- **`C:\dev\zombeans-web` is read only.** It is the architectural reference and is never written
  to, committed to, or run.
- **No em dashes** anywhere: not in code comments, commit messages, documentation, or shipped UI
  copy.

**Terminology.** ~~"Pay at counter", not "cash".~~ Retired by the payment-first ruling; the customer
facing word is "Paid", and no screen offers to take money at the counter. "Pickup code", not
"order number" (the tracking key
is a separate, unguessable value). "Level of Hotness" is the customer facing name of the heat
scale. Order statuses are New, Preparing, Ready, Claimed.

**Owner input.** Two items in spec section 28 are resolved. Five remain open. Do not invent answers
to the remaining items:

1. *(Resolved 2026-08-10: Central Bloc, IT Park, Lahug is the pilot branch.)*
2. *(Resolved: Hot Wings, the only trading brand.)*
3. *(Resolved 2026-08-11: Central Bloc, IT Park is open 24 hours, seven days a week.)*
4. Prep time and slot capacity per branch, as a real number from a manager.
5. A ZenPOS technical contact, so the integration discovery checklist can be answered.
6. The original shoot deliverables: cutout sources with alpha rather than orange flattened JPEGs,
   and full resolution wing photos for Cheezy, Salted Egg and Smokey Barbecue.
7. Whether the franchise inquiry form lives on this platform or keeps pointing at `5bdf.ph`.

## Brand Commitments

- **Name.** "New York Buffalo Brad's" in full is what shipped copy leads with. "NYBB" is used only
  where space forces it. The full legal parent, Five Brad Dragons Food Franchise Corporation,
  appears in the footer and on legal pages.
- **Voice.** Plain and confident. Short declarative sentences, no hype, no exclamation marks. The
  food and the heat scale carry the energy; the words do not have to.
- **Identity.** The business is a New York sports-bar wing house in Cebu. Locked decision D6
  requires the design to read premium, modern and restaurant focused. The incumbent brand identity
  (the orange, the black ground, the heat ramp) is recorded in spec section 5.2 and implemented in
  `app/globals.css`. Nothing from the ZOMBEANS reference brand transfers: not a color, not a
  typeface, not a line of copy.
- **Franchise line.** The business actively sells franchises (`franchise@5bdf.ph`, (032) 520-4930).
  Franchise lead generation exists on the current site and is kept, pending item 7 above.

## Evidence on Hand

**Real, verified, on disk.**

- **The wings shoot.** Ten flavors, each 5184x3456 (18MP DSLR), shot in one consistent setup:
  yellow branded basket, branded liner paper, whitewashed wood table, dipping sauce in frame. Each
  flavor is visually distinct because the sauce color carries the difference, and filenames map
  mechanically to menu rows. This is the best asset the brand has.
- **Clean transparent logo PNGs**: the Hot Wings logo at 2704x1559 with alpha, plus a transparent
  mark used as the favicon source.
- **Other covered items**: five burgers, five hotdogs, ribs, and further items, mostly cutouts
  composited on flat brand orange.
- **The archive lives at `C:\dev\nybb-assets\`** (100 files, 357 MB, with `inventory.csv`
  describing every one). It is kept out of this repository. **Do not fetch from
  `nybuffalobrads.com.ph`**: its TLS certificate does not cover the apex domain, so standard
  fetching tools reject the host. The files are already on disk.
- **The real menu and price list**, transcribed from the live site and seeded from `lib/catalog/`
  via `supabase/seed.sql`.
- **Nine real branch locations** with real phone numbers.
- **A brand food film**, cut and re-encoded into the video hero.

**Absences that must not be fabricated.** There are no testimonials, no customer counts, no review
scores, no sales figures, no awards, and no press. Cheezy, Salted Egg and Smokey Barbecue exist
only as 300x300 thumbnails. The coffee and waffle lines have no clean product shots. Operating
hours are unknown. A staging Supabase project exists, migrations `0001` to `0022` and the seed are
applied, and customer plus Super Admin OTP flows have been verified end to end. Migration `0022`
is locally verified and awaits its focused staging smoke test. The configured
Super Admin has an active admin profile and matching bootstrap audit record.
Migration `0018`, migration `0021`, and the four-column orders board are live in staging. Marked
test orders have completed Start, Ready and pickup-code Claim through the real staff browser flow,
including an already-open guest page following every transition.

## Product Principles

1. **The server is the authority.** Prices, totals, discounts, availability and slot capacity are
   resolved in Postgres. The client asks; it never asserts. This is the one rule that does not bend
   for a demo.
2. **Three users, no hierarchy.** The customer flow, the staff board and the owner tools each have
   to be genuinely good. A surface that serves one of them well by making another worse has failed,
   even if it demos better.
3. **Honest over impressive.** Nothing invented: no placeholder hours, no fabricated proof, no
   feature flag on before the business is approved for it, no reference to a closed venue. An empty
   state that tells the truth beats a filled one that does not.
4. **Heat is the signature.** The Level of Hotness scale is the one thing this restaurant has that
   no template accounts for. Wherever it appears (product page, confirmation, staff ticket, pickup
   slip), it is treated as a designed object rather than a text field.
5. **Built for one, shaped for ten.** Single branch at launch, but nothing hardcodes it. Growing to
   ten locations is a row, not a rewrite.

## Accessibility & Inclusion

**WCAG 2.2 AA is binding across the whole platform**, storefront and staff workspace alike:
contrast, focus visibility, keyboard operability, target size, and reduced motion. It can block a
change.

**Plus the real-hand constraints of this product:**

- **One-handed phone use.** The queue scene means a customer is holding a phone in one hand,
  rushed, with someone behind them. Primary actions stay in thumb reach.
- **A 320px floor.** Every surface is verified at 320px, not just at 375px.
- **Targets sized for the actual hands.** Counter-queue haste on the customer side, and wet or
  gloved kitchen hands on the staff tablet. The staff board is glanced at across a counter, so its
  type and targets are sized for distance, not for a desk.

**Verification note.** Contrast is checked by compositing the color through a 1x1 canvas and
reading the pixel back. Do not parse `getComputedStyle` colors as RGB: Tailwind v4 emits `oklch()`
and naive parsing produces fake failures near 1.1:1.
