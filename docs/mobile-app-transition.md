# Mobile-app transition plan

> **Service-model amendment, 2026-08-12.** Customers will place pickup orders in the NYBB app.
> Staff will review and accept them, then manually enter each accepted order in ZenPOS. The mobile
> target includes the customer pickup journey and the staff acceptance and pickup-operations tools.
> ZenPOS is the official sale record. The remaining sections record an earlier proposal and are not
> implementation authority. See `docs/service-model-and-zenpos-options.md` before implementing
> further mobile UI or backend contracts.
>
> **Delivery deferral, 2026-08-12.** Delivery is not part of the current build. The active mobile
> scope is customer pickup ordering, staff acceptance, manual ZenPOS entry confirmation, and pickup
> operations. Do not implement delivery screens or workflows until the owner reopens delivery.

## Status and intent

On 2026-08-12, the IT Head directed that NYBB's customer ordering experience become a mobile app
rather than a browser-first Next.js storefront. This is a product-platform change. It is not a
request to package the existing website as-is.

This document is the proposed implementation direction until the decisions in section 7 are
confirmed. It supplements the master implementation prompt. Where it conflicts with customer
storefront guidance in that prompt, this document takes precedence. Pickup-only ordering,
server-authoritative pricing, RLS, atomic Postgres writes, payment-first ordering, ZenPOS's manual
fallback, and the existing owner-input items remain in force.

> **Staff-platform ruling, 2026-08-12.** The staff workspace stays in the browser. There is no
> native staff app in this plan any more, and the orders board is the first staff surface to finish.
> This reverses the recommendation immediately below, which is kept for its reasoning rather than as
> instruction. What it does not change: the board must still receive a paid order in under two
> seconds without a refresh, and it must still support the three-tap fulfillment path, the
> pickup-code claim, refunds, and availability. Those move from "build natively" to "finish in the
> workspace". Section 7's decisions 1, 2 and 5 covered the customer app; they are not authority for a
> staff app that is no longer being built.

## Recommendation

Build native iOS and Android apps with Expo and React Native for both customer ordering and staff
operations. Retain the existing Next.js applications during the transition as the executable
reference, fallback, and owner-console candidate until the native staff scope is complete.

Both platforms must ship together. The customer app is the public ordering channel. The staff app
must include the realtime orders board, POS re-key flow, refunds, availability, and the owner tools
within its confirmed scope. Staff screens should be tablet-first and support landscape, while the
customer journey remains phone-first. A browser owner console may remain after the pilot if its
desktop workflows are valuable, but that is now a deliberate product choice rather than the default
architecture.

Do not start by wrapping the existing website in a WebView. It would preserve the web application's
loading, offline, push, cookie, and payment-return limitations without producing a credible native
experience. The only acceptable temporary wrapper would be an explicitly time-boxed internal demo,
not the pilot architecture.

## Target architecture

```
Native customer app (Expo / React Native)
  catalog, cart, checkout, order tracking, native push
                 |
                 v
Mobile API / domain-service boundary
  authenticated endpoints, payment-intent creation, order read models
                 |
                 v
Supabase and provider integrations
  Postgres RPCs, RLS, Auth, Storage, Realtime, PayMongo webhooks, ZenPOS adapter
                 ^
                 |
Native staff app
  orders board, refunds, POS re-key, menu, availability, owner controls

Existing Next.js apps
  transition reference, fallback, and possible browser owner console
```

The security boundary does not move to the phone. The app may send identities, item and option
identifiers, quantities, a pickup slot, and a payment method. It must never calculate or submit a
trusted price, total, discount, refund amount, order state transition, or ZenPOS credential.

The mobile API is not an extra copy of business logic. It is a stable transport layer over shared
domain services and the existing database RPCs. The public app must not rely directly on Next.js
Server Actions as its application API. Server Actions remain useful for the web workspace, but they
are a browser form protocol and not a versioned native-client contract.

## What can be retained

| Existing asset | Transition treatment |
| --- | --- |
| Supabase schema, migrations, RLS, grants, and `SECURITY DEFINER` order RPCs | Retain unchanged as the system of record and authority boundary. |
| Catalog data, price-list model, variation-dependent heat pricing, slot capacity, order lifecycle | Retain. Expose mobile read models and commands without duplicating the rules on-device. |
| Image archive, image pipeline, generated image manifest, Supabase Storage | Retain. The mobile client consumes the generated image URLs and placeholders. |
| PayMongo server client, webhook handling, expiry, refund workflow | Retain server-side. Add a mobile payment-return contract and deep-link handling. |
| ZenPOS adapter, audit trail, staff permissions, realtime board | Retain the backend and rebuild the operational UI as a native tablet-first staff app. |
| Pure TypeScript validation, formatting, order-status, cart-resolution, and pricing helpers | Move into framework-neutral shared packages where they have no Next.js or browser dependency. |
| Visual identity, menu copy, photography, accessibility requirements | Retain, then implement as native components rather than porting DOM and CSS. |

## What must change

| Current web assumption | Mobile replacement |
| --- | --- |
| React Server Components and Next.js routes render the customer UI | Expo / React Native screens and native navigation. |
| Server Actions are the storefront mutation boundary | Authenticated mobile API endpoints calling shared services and database RPCs. |
| Supabase browser cookies and separate cookie namespaces | Supabase mobile sessions persisted in platform secure storage. Staff browser cookies remain only in the workspace. |
| `localStorage` cart | Device-local app storage for non-sensitive cart data. Tokens stay in secure storage. |
| `next/image` and browser layout | Native image rendering, cached remote images, and native layout. The image sizes and alt-text equivalents still need review. |
| Web Push and VAPID | Native push tokens, with Android FCM and iOS APNs credentials. Store provider-specific device subscriptions separately from web subscriptions. |
| Browser return after QR payment | App deep links and an order-payment resume screen. PayMongo confirmation remains webhook-authoritative. |
| CSP and `proxy.ts` protect rendered web pages | Keep them while the Next.js fallback remains. Add API authentication, explicit CORS policy, request validation, rate limits, and mobile release signing for the native clients. |

## Transition phases

**Phase M0 status, 2026-08-12:** closed. Expo is approved, `apps/customer` is the
native customer-app foundation, and every customer-facing Server Action has been
classified in `docs/mobile-api-inventory.md`.

**Phase M1 status, 2026-08-12:** the mobile-safe backend contract has shipped, and
the app now uses it. `docs/mobile-api-contract.md` is the reference.

- The customer Server Actions were reduced to adapters over framework-neutral
  services in `lib/customer/`, which the versioned routes in
  `app/api/mobile/v1/` call with a bearer token instead of a cookie. There is one
  validation path, one rate limit and one refusal-message table, not two.
- The app places real pickup orders: live menu, live pickup windows, a cart keyed
  on catalog slugs, checkout, QR Ph payment, order tracking and the arrival
  signal.
- The local sample menu and the disabled checkout button are gone. What replaced
  them sends no price, no total and no payment state, and reads every piece of
  order state back from the server.
- Not yet built, and listed in the inventory: native sign-in, a persisted order
  session, account history, push registration, and deep-link handling.

### Phase M0, decide and protect the boundary

Confirm the remaining decisions in section 7. Freeze new customer and staff web UI features, except
defects and payment/refund work required to preserve the current demo. Keep database migrations
forward-only. Do not delete the existing web applications yet: they are the executable reference
for user flows and the fallback during app development.

Inventory every customer-facing Server Action and classify it as a domain service, a web-only form
adapter, or a new mobile endpoint. Create contract tests for catalog reads, slot reads, checkout
initiation, payment status, order tracking, customer arrival, and authenticated account history.

### Phase M1, establish a mobile-safe backend contract

Extract framework-neutral command and query services from customer Server Actions. Keep the database
RPCs as the atomic source of truth. Add a versioned mobile API for the flows listed above, with Zod
validation, bearer-token verification, the existing rate limiting, and no privileged provider keys
in any app bundle.

Use shared TypeScript packages for contracts and pure domain code. Do not share React components or
Next.js-only modules with the mobile app. Run the existing unit and SQL tests against the extracted
services before starting screen work.

### Phase M2, build the native customer app

Create the Expo applications, native navigation, design tokens, catalog, wings configurator, cart,
pickup slot picker, checkout, tracking, OTP account flow, account history, staff authentication,
orders board, pickup-code claim, refunds, POS re-key, availability, and owner tools. Preserve the
current mobile-first customer flow and 44px interaction target, but redesign each screen for native
controls rather than recreating the website pixel-for-pixel. Make staff screens tablet-first and
landscape-capable.

The cart must be repriced from the server catalog on every checkout path. The displayed total is
informational until the server creates the order and payment intent.

### Phase M3, payment, links, and notifications

Keep PayMongo intent creation, confirmation, refunds, and webhooks on the server. Implement QR Ph
first, then the approved GCash and Maya methods through the same intent flow. Handle payment return
with verified app links, and always resolve the final payment state from the server rather than
trusting a return URL.

Replace customer and staff VAPID subscription flows with native device registration. Verify customer
ready notifications and staff new-order notifications on locked Android and iOS devices before
calling this phase complete.

### Phase M4, release readiness and controlled cutover

Add Android and iOS release builds, app signing, store metadata, privacy disclosures, crash
reporting, deep-link verification, offline and poor-network handling, and a rollback path to the
web storefront. Re-run the customer e2e suite on physical devices or device clouds, not only in a
web browser.

Pilot at the confirmed branch only after payment, refunds, capacity limits, and the no-show policy
are production-ready. Retain the web storefront through the pilot until the owner approves removal
or conversion to a marketing-only site.

## Definition-of-done changes

Replace the customer-browser portions of section 29 in the master plan with these additions:

- A customer can install the app and complete a paid pickup order on the supported phone sizes.
- The app cannot influence server-authoritative prices, discounts, payment state, or order status.
- Payment return and order tracking work after the app is backgrounded or reopened through an app
  link.
- Ready notifications arrive on locked Android and iOS devices and open the correct order.
- Android and iOS release builds pass the agreed device test matrix, including poor-network and
  interrupted-payment cases.
- The native staff app receives a paid order in under two seconds without a refresh.
- Staff can complete the three-tap fulfillment path, pickup-code claim, refund, and manual POS
  re-key flows on a supported tablet device.

## Decisions required before Phase M0 is closed

These are owner decisions. Do not infer them from the mobile-app direction alone.

1. **Resolved 2026-08-12.** The mobile scope includes customer ordering, staff tools, and owner
   tools.
2. **Resolved 2026-08-12.** iOS and Android must ship together. Minimum OS versions and the device
   test matrix remain to be supplied by IT, if they have a standard.
3. **Tentative.** App-store distribution is intended, but it is not confirmed as a first-milestone
   requirement. Until confirmed, plan for signed internal test builds as the minimum demo path and
   do not promise public store availability.
4. **Open.** Ownership of the Apple Developer and Google Play Console accounts, package identifiers,
   signing keys, and store privacy declarations is not yet known.
5. **Resolved 2026-08-12.** IT approved Expo and managed native builds. The initial scaffold is
   the customer app. The staff app follows once the mobile-safe backend contract is in place.
6. What is the web storefront's role during and after the pilot: temporary fallback, marketing
   site with app-download links, or retirement after a defined acceptance point?

The existing open decisions on prep capacity, ZenPOS contact, no-show policy, online-sales
reconciliation, assets, and franchise inquiry handling remain open and are still launch-relevant.
