# Mobile API inventory

This began as the Phase M0 inventory for the Expo customer app. The rule it was
written to enforce still stands: the native app calls versioned HTTP endpoints
backed by shared domain services, and never imports or invokes Next.js Server
Actions.

**Status, 2026-08-12.** The first contract has shipped. `docs/mobile-api-contract.md`
is the reference for what exists; this file records how each web flow was
treated and what is still outstanding.

## Customer flows

| Web implementation | Mobile treatment | Status |
| --- | --- | --- |
| Storefront menu readers | `GET /api/mobile/v1/menu` | Shipped. Same `get_storefront_menu()` read model, same static fallback, `source` exposed so the app can say which it got. |
| `get_pickup_slots()` | `GET /api/mobile/v1/slots` | Shipped. The database function remains the authority, including its clock. |
| `app/actions/cart.ts` | Device cart | Shipped as a local cart keyed on catalog slugs (`apps/customer/src/cart.ts`). Authenticated cart sync is not built and is not needed for ordering. |
| `app/actions/checkout.ts::placeOrder` | `POST /api/mobile/v1/orders` | Shipped. The action is now a thin adapter over `lib/customer/orders.ts`, which both callers share, so the Zod validation, the address rate limit, the identity handling and the `place_order` RPC are one implementation. |
| `app/actions/payment.ts::payOrder` | `POST /api/mobile/v1/orders/{code}/payment` | Shipped through `lib/customer/payment.ts`. The server keeps the PayMongo credentials and builds the return URL. The channel is pinned by the route, never read from the client. |
| `get_order_by_tracking()` | `GET /api/mobile/v1/orders/{code}` | Shipped. Bearer-token handling preserved, and the missing-order response is still identical to a wrong token. |
| `app/actions/order-arrival.ts::markCustomerArrived` | `POST /api/mobile/v1/orders/{code}/arrival` | Shipped through `lib/customer/arrival.ts`. Authorization and eligibility stay in the RPC. |
| Storefront OTP actions | `POST /api/mobile/v1/auth/otp`, `/auth/session`, `/auth/refresh` | Shipped through `lib/customer/auth.ts`. Server-proxied rather than the Supabase SDK in the app bundle, so the hashed-email OTP limit in `lib/auth/rate-limit.ts` counts a phone and a browser against one budget and the refusal copy stays in one table. The workspace paths (staff email lookup, Super Admin provisioning, cookie families) are deliberately absent: this is the customer path only. |
| Account profile action and history readers | Authenticated account commands and queries | Not built, as planned. Defined after the ordering contract, which is now the thing to build against. |

## Outside the first mobile contract

- Staff workspace actions remain browser-only until the customer contract is
  verified in a pilot. They will become a separate tablet-focused staff API.
- PayMongo webhooks and refund reconciliation remain server-side integrations.
- ZenPOS work is deferred. Do not add a ZenPOS endpoint, credential, import,
  mapping, synchronization, ticket lookup, or stock read.
- Delivery is deferred. Do not add delivery fields or endpoints.

## What the extraction changed on the web side

Nothing a customer can see, and that was the constraint. The customer Server
Actions were reduced to adapters that turn a cookie jar and a proxy header into
a `CustomerCaller`, and every decision moved into `lib/customer/`. Two small
additions were made to shared types:

- `CheckoutFailure.kind` distinguishes a rate limit and an unreachable database
  from an ordinary refusal, so the API can answer 429 and 503 rather than
  flattening both into 409. The browser ignores it.
- `lib/orders/reader.ts` gained `readOrderByTracking(caller, …)`, with
  `getOrderByTracking` kept as the cookie-shaped wrapper the web pages call.

## Still to do

1. ~~Native sign-in, a secure token store, and persistence of the order
   session.~~ **Done.** `apps/customer/src/session/store.ts` keeps the Supabase
   session and the order's short code and tracking token in `expo-secure-store`,
   and `useCustomerSession` is the only accessor for an access token, so a token
   inside its expiry margin is refreshed before it is used rather than after it
   fails. A terminated app now comes back to an unpaid order.

   Two things this slice did **not** do, written down rather than assumed:

   - **Sign-out is local.** The tokens are deleted from the keychain, which is
     the only place they were stored, but the refresh token is not revoked at
     Supabase and a copy captured beforehand would work until it rotates or
     expires. Closing that needs a revoke endpoint.
   - **The mobile email schema normalizes before it validates**, which the web
     login action does not: `z.email().trim().toLowerCase()` applies its
     transforms after validation, so a trailing space fails as a malformed
     address. A software keyboard's autocomplete appends exactly that space. The
     web action has the same construction and the same latent defect; it was
     left alone because it is shipped and smoke-tested, and it is worth fixing
     the next time somebody is in that file.
2. Account history and profile endpoints, now unblocked by sign-in.
3. Push registration, replacing the order screen's six-second poll.
4. Deep-link handling for redirect payments. The scheme and the server-side
   return URL exist; the app has no `Linking` listener yet.
5. A staff API, after the customer pilot.
