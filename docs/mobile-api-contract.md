# Mobile API contract, v1

The versioned HTTP contract the native customer app calls. It shipped as the
Phase M1 deliverable and replaces the app's earlier local preview data.

Server source: `app/api/mobile/v1/`, `lib/mobile/`, `lib/customer/`.
App source: `apps/customer/src/api/`.

## The rule this contract exists to hold

The app sends names and counts. It never sends a price, a total, a discount, a
payment state or an order status, and no request type in this contract has a
field for one. Money is resolved by `place_order` inside the transaction that
reserves the pickup window, and an order becomes paid when the PayMongo webhook
says so. A phone with a patched binary or a proxy rewriting its traffic can ask
for different food. It cannot ask for a different price.

## Why HTTP and not Server Actions

A Server Action is a browser form protocol. Both halves of it deploy at the same
instant, so it can change shape whenever the code does. An installed app cannot
be redeployed: some phone will still be running last month's build during the
next lunch rush. So the path carries a version, `v1` means what it meant on the
day it shipped, and a breaking change gets `v2` beside it rather than an edit in
place.

The Next.js Server Actions remain the web storefront's boundary. They are now
thin adapters over the same services this API calls, so there is one validation
path, one rate limit and one message table rather than two of each.

## Shape

Every response is the same envelope, so a client parses one shape:

```json
{ "ok": true, "data": { } }
{ "ok": false, "error": { "code": "conflict", "message": "…" } }
```

`message` is customer copy and is safe to put on a screen unchanged. It is the
same wording the website shows for the same refusal.

| Code | Status | Meaning |
| --- | --- | --- |
| `invalid_request` | 400 | The request was malformed or refused by a schema. |
| `unauthorized` | 401 | No credential, or one that does not open this order. |
| `not_found` | 404 | No such order, or the wrong token. Deliberately identical. |
| `conflict` | 409 | Real, but not in a state where this makes sense. |
| `rate_limited` | 429 | Wait, then retry. |
| `unavailable` | 503 | The server cannot answer. Says nothing about the request. |
| `server_error` | 500 | A bug on the server side. |

A checkout refusal may also carry `field`, `staleSlots` and `newAttempt`, which
are the same hints the web checkout form uses: which input to point at, whether
the pickup grid on screen is stale, and whether the attempt id is spent.

`429` and `503` are separated from `409` on purpose. A client that cannot tell
them apart either hammers a limit it cannot see or gives up on an outage that
was about to end.

## Credentials

| Credential | Where it travels | What it opens |
| --- | --- | --- |
| Supabase access token | `Authorization: Bearer <token>` | The signed-in customer's own orders, and stamps `orders.user_id` on a new one. |
| Order tracking token | `x-nybb-tracking-token` | One guest order. |
| Supabase refresh token | The body of `/auth/refresh`, and nowhere else | Minting the next access token. |

The refresh token is deliberately not carried in `Authorization`. That header
holds access tokens on every other route, and `mobileCaller()` reads it there to
build a caller's identity, so one header holding two kinds of credential would
be distinguished only by which route happened to receive it. The first handler
that read it with the wrong assumption would forward a refresh token to
PostgREST.

All three are bearer credentials and the app keeps them in platform secure
storage (`apps/customer/src/session/store.ts`), never in ordinary app storage.

Cookies are ignored completely. The mobile API has no cookie surface, and
`tests/unit/mobile-contract.test.ts` asserts it: a caller that could
authenticate with a cookie would let any web page make a customer's browser
place an order on their behalf.

The tracking token travels in a header rather than a query string because it is
a bearer credential and URLs end up in access logs, proxy logs and crash
reports. The web storefront keeps it in the URL because a customer has to be
able to paste a link; the app has no such need, it holds the token itself.

## Endpoints

All responses are `no-store`. There are no CORS headers, deliberately: a native
client does not need them, and their absence keeps a page on another origin from
reading these responses out of a visitor's browser.

### `POST /api/mobile/v1/auth/otp`

Asks for a six-digit sign-in code. Body is `{ "email": "…" }`. The answer carries
`expiresAt` and `resendAvailableAt` and nothing secret, so the sign-in screen can
pace its resend button against the server's real limit rather than a constant
that drifts from it.

**The answer is identical whether or not the address has an account.** This
endpoint is unauthenticated by necessity, and a response that differed would turn
it into a way to test whether somebody has ordered from NYBB, one address at a
time. The only refusals visible from outside are a malformed address and the rate
limit, neither of which says anything about who exists.

The limiter runs before Supabase is called, on the same hashed-email namespaces
`lib/auth/rate-limit.ts` gives the web login, so a phone and a browser share one
budget. The email is trimmed and lowercased before the limiter sees it, so one
address is one bucket.

### `POST /api/mobile/v1/auth/session`

Exchanges `{ "email": "…", "token": "123456" }` for a session: an access token, a
refresh token, an expiry in epoch milliseconds, and the address. This is the one
response in the contract that hands the caller a credential rather than reading
one, which is why `no-store` and the absent CORS headers are load bearing here
rather than merely tidy.

Three verification types are tried, because Supabase types the same six digits
differently depending on whether the address was already registered. Every way a
code can fail gives one message, so the response says nothing about whether the
address has an account.

Staff addresses get a customer session like anybody else. The workspace is
browser-only by decision, and a staff member using the customer app is a
customer; RLS scopes what they read to their own orders either way.

### `POST /api/mobile/v1/auth/refresh`

Takes `{ "refreshToken": "…" }` and returns a fresh session. Both tokens rotate,
because Supabase rotates the refresh token on every use, and an app that stores
only the new access token presents a spent credential on the next refresh.

**A `401` here means sign in again; a `503` means retry later.** The app acts on
that difference: the first clears the keychain, the second keeps the session.
Reporting a revoked token as an outage leaves a device retrying a credential that
will never work again.

There is no rate limit on this route, deliberately. It is authorized by a
credential this server issued, so it is not reachable by a stranger, and a
limiter would refuse a legitimate app reopening after a long sleep, which is
exactly when a refresh is needed.

### `GET /api/mobile/v1/menu?branch=<slug>`

The published catalog, from `get_storefront_menu()`. `data.source` is `database`
or `static`; `static` means the server answered from its build-time catalog
because no Supabase project is configured, and the app says so on screen because
a published price list is not a live one.

### `GET /api/mobile/v1/slots?branch=<slug>`

Pickup windows from `get_pickup_slots()`, including `unavailableReason`, which is
the difference between "the shop is shut" and "every window is full". The clock
is the database's. No client may pass one.

### `POST /api/mobile/v1/orders`

Body is the checkout input: an attempt id, a branch slug, a pickup minute,
customer details, a payment method and lines of item, variation, options and
quantity. Returns the placed order, including `trackingToken`.

The attempt id is a v4 uuid minted once per checkout and resent on every retry.
It is what makes a double-tapped button produce one order rather than two. A
`newAttempt` hint on a refusal means that id is spent.

Rate limited by address (twenty requests per ten minutes), and again inside
`place_order` on an identity Postgres can verify. Both fail open, by
specification: a limiter that takes ordering down has done more damage than the
abuse it prevents.

### `GET /api/mobile/v1/orders/<shortCode>`

One order, with the tracking token in a header or the owner's bearer token.
This is how the app learns every piece of state it displays. "Not found" and
"wrong token" are the same answer, because telling them apart would make the
short code space worth scraping. An outage answers `unavailable` rather than
`not_found`: telling a customer their order is gone while it sits in a database
we momentarily cannot reach is how a kitchen cooks an order twice.

### `POST /api/mobile/v1/orders/<shortCode>/payment`

Starts a payment. The body carries the rail and one payment attempt id. The
amount comes from the `payments` row, the allowed rails come from
`app_settings`, and the return URL is built by the server: `app` requests get
`nybb-order://order/<code>`, and the scheme is validated before it is used, so a
caller can never supply a return address.

The response is an instruction, not a result:

```json
{ "action": "qr", "qrImageUrl": "…" }
{ "action": "redirect", "redirectUrl": "…" }
{ "action": "mock" }
{ "action": "done" }
```

`done` means the provider has nothing further to ask for. It does not mean paid.
The app finds that out by reading the order back.

### `POST /api/mobile/v1/orders/<shortCode>/payment/mock`

Development only. Answers 404 unless the server has `MOCK_PAYMENTS_ENABLED` set
outside production, and applies the outcome through `apply_paymongo_payment`,
the same RPC the real webhook uses, so the simulator exercises the real state
machine rather than a shortcut around it.

### `POST /api/mobile/v1/orders/<shortCode>/arrival`

Tells the counter a customer is outside. `customer_mark_order_arrived` locks the
order, repeats the authorization, refuses anything that is not Ready, and makes
a retry harmless.

## Not in v1

- **Account history and profile.** Sign-in and the token store now exist, and
  the database already scopes orders by `auth.uid()`, so these endpoints are
  unblocked rather than waiting. They are still not built.
- **Sign-out as a server-side revoke.** The app deletes both tokens from the
  keychain, which is the only place it stored them, but nothing revokes the
  refresh token at Supabase, so a copy captured beforehand keeps working until
  it rotates or expires. A `/auth/signout` route is the fix and is not here.
- **Staff endpoints.** The workspace remains browser-only until the customer
  contract has run in a pilot. It becomes a separate tablet-focused API.
- **Push registration.** The app polls while an order is live. Native device
  registration is Phase M3.
- **Delivery.** Deferred by the owner. No delivery field or endpoint exists.
- **ZenPOS.** Deferred completely. There is no ZenPOS endpoint, credential,
  import, mapping, ticket lookup, stock read or synchronization anywhere in this
  contract, and none may be added while the deferral stands.

## Tests

- `tests/unit/mobile-contract.test.ts` covers the envelope, credential reading,
  body limits, the return-URL builder, and the drift check between the server's
  contract file and the app's copy of it.
- `tests/unit/mobile-api.test.ts` runs every route with no database configured
  and asserts each degrades into a specific honest answer rather than a 500,
  including that an unconfigured server answers `/auth/otp` with 503 rather than
  401, which is what keeps the unconfigured case from leaking the same signal
  the endpoint is designed not to give.
- `tests/unit/mobile-auth.test.ts` covers the sign-in service: that the limiter
  runs before Supabase is asked for anything, that a wrong code and a spent
  refresh token are `rejected` while an outage is `unavailable`, that both
  tokens rotate on refresh, and that a failed profile write still signs the
  customer in.
- The services behind the routes are covered by the existing checkout, tracking,
  arrival and PayMongo suites, which did not change: the Server Actions and the
  mobile routes now call the same code.
