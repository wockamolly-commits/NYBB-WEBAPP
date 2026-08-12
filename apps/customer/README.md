# NYBB Order customer app

The Expo customer app. It is separate from the Next.js storefront and does not
use a WebView.

It now places real pickup orders through the versioned mobile API
(`/api/mobile/v1`, documented in `docs/mobile-api-contract.md`). It does not
import Server Actions, and it holds no provider keys.

## What the app is trusted with, and what it is not

The app sends names and counts: an item slug, a variation slug, option slugs, a
quantity, a pickup window, and who to hand the order to. It never sends a price,
a total, a discount, a payment state or an order status, and there is no field in
the request types for one.

- Prices on the menu are display values from `/menu`.
- The cart subtotal is a preview and is labelled as one on every screen.
- The order total is whatever `place_order` returned.
- An order is paid when the PayMongo webhook says so, which the app learns by
  reading the order back. Returning from a payment page proves nothing.

`src/menu/pricing.ts` mirrors the server's price resolution so a customer can see
what a size or a heat level costs while choosing. If it ever disagrees with the
database, the database is right and the mirror is the bug.

## Configure

```powershell
cd apps/customer
copy .env.example .env
```

Set `EXPO_PUBLIC_API_URL` to a NYBB server the phone can actually reach. On a
development machine that is the LAN address `next dev` prints, not `localhost`:
a phone running Expo Go cannot resolve the laptop's loopback address. Restart
Expo after changing it, because `EXPO_PUBLIC_` values are inlined at build time.

## Run locally

```powershell
cd apps/customer
npm start
```

Use Expo Go on a development phone, or `npm run android`, `npm run ios`, or
`npm run web`.

To exercise checkout end to end without a real payment, set
`MOCK_PAYMENTS_ENABLED=true` on the server and switch the PayMongo flag and the
QR Ph method on in `app_settings`. The order screen then offers an explicit
paid or failed simulator. The endpoint behind it answers 404 in production.

## Checks

```powershell
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios
```

The contract itself is tested from the Next project's suite: `npm test` at the
repository root runs `tests/unit/mobile-contract.test.ts`, which imports
`src/api/contract.ts` from this app and fails if it has drifted from the
server's copy.

## Known gaps in this slice

- **The order session is in memory only.** The tracking token that reads a guest
  order is held in React state. If the operating system terminates the app
  between placing and paying, the app cannot find its way back to the order.
  Persisting it belongs with native sign-in, where the Supabase session also
  needs secure storage rather than app storage.
- **No sign-in yet.** Every order is placed as a guest. The API already accepts a
  bearer token and stamps `orders.user_id` when it verifies, so this is an app
  screen and a token store, not a contract change.
- **No push notifications.** The order screen polls every six seconds while an
  order is live. Native registration is a later phase.
- **Deep links are declared but not handled.** `app.json` sets the `nybb-order`
  scheme and the server builds `nybb-order://order/<code>` return URLs for
  redirect payments, but the app has no `Linking` listener yet. It does not need
  one while it is polling in the foreground, and it will once the session is
  persisted.
