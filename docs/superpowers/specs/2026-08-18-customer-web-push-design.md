# Customer web push, design

Written 2026-08-18. Covers spec section 15's customer half, which was deleted on 2026-08-17 and is
being rebuilt on a different transport.

## What this is

Notifying a customer, on their own phone, when their order becomes ready, is refused, or is
cancelled. The order tracking page already updates itself over Realtime (`0021`,
`components/order/OrderTrackingLiveRefresh.tsx`), so this is specifically about the customer who is
**not** looking at the page: the one who put the phone in a pocket, or who walked away after a
payment timed out.

## Why there is nothing to repair

The customer half of notifications shipped once, as Expo push to a native app. When the mobile app
was dropped on 2026-08-17 the whole path went with it, because the only surface that could ever
register a customer device was the app's own route. Deleted then: `lib/push/expo.ts`,
`lib/customer/push.ts`, `lib/push/drain.ts`, `customerPayload`, `notifyCustomer`, and the three
call sites that triggered them.

This is a rebuild on Web Push, not a revert. The staff half never moved and is untouched
throughout.

**What is recoverable rather than reinvented.** `customerPayload`, `notifyCustomer` and
`drainPushQueue` exist in history at `b7a64a1^`. Their logic is sound; only the transport and the
subscription lookup change. Read them before rewriting from scratch, particularly `drain.ts`'s long
comment on why a `failed` row is not proof nobody was told.

## Decisions taken, and where they came from

| Decision | Made by | Note |
| --- | --- | --- |
| Full parity: ready, rejected, and cancelled | Owner, 2026-08-18 | Including the queue drain, so the expiry sweep's cancellation notices are delivered. |
| Split the manifests so iOS customers can install | Owner, 2026-08-18 | The harder option, chosen over skipping iOS. See "Service worker and manifests". |
| Staff push is out of scope | This design | It works. Nothing here may change its behaviour. |

## The shape of it

Seven pieces. Each is small, and six of the seven mirror something that already exists.

### 1. Migration 0047: `register_customer_push_subscription`

A new `SECURITY DEFINER` function taking `p_short_code`, `p_tracking_token`, `p_endpoint`,
`p_p256dh`, `p_auth_key` and returning boolean.

The authorization is copied from `0042` and must not be re-derived: the tracking token authorizes,
**or** `auth.uid()` owning the order does, the cast stays on the column so a malformed token is a
miss rather than a raise, and a terminal order (`claimed`, `rejected`, `cancelled`, `no_show`) is
refused because it has nothing left to announce. Every refusal returns the same `false`, because
the difference between them is worth something to whoever is probing the endpoint.

It writes `transport = 'web'` with both keys, which is the shape `0038`'s check constraint already
requires.

Granted to `anon` and `authenticated`, naming both explicitly. Handoff trap 14 is the reason that
is not belt and braces.

**THE ONE GENUINELY NEW HAZARD, AND THE REASON THIS IS NOT A COPY OF 0038.**

`push_subscriptions` is unique on `endpoint`, and `0038`'s customer insert ends
`on conflict (endpoint) do update`. A staff member who opens their own order on the counter tablet
therefore rewrites that tablet's **staff** row to `audience = 'customer'`. The tablet stops being
told about new orders, silently, and nothing anywhere says why: `staff_push_targets` filters on
`audience = 'staff'`, so the row simply stops being selected.

That defect is latent in `0038` today and has never been reachable, because no browser could call
the customer function. Giving customers a browser path makes it reachable on the one device the
business cannot afford to have go quiet.

`0047` must therefore refuse to convert a non-customer row rather than upsert over it. Return
`false` when the endpoint already belongs to another audience. A customer whose browser somehow
holds the tablet's endpoint gets a refusal, which is correct: they are not that device.

### 2. `lib/customer/push.ts`

Returns, mirroring `lib/staff/push.ts` closely enough to inherit its lesson: `PushSubscription`'s
`toJSON()` nests `p256dh` and `auth` under `keys`, which is not the shape the database function
takes. The first cut of the staff schema expected them at the top level, passed a unit test written
to the same wrong assumption, and refused every real subscription with a 409 naming no cause. The
browser's serialization is the contract; flattening happens in this file.

Unlike the staff version it uses the public or caller client rather than the staff client, and it
takes a `CustomerCaller` so a signed-in owner and a token holder both work. This is the same
arrangement `lib/customer/arrival.ts` uses.

Nothing is logged but the failure itself. A subscription's keys are what let anyone send to that
device, and the tracking token opens somebody else's order. Both are passed through, never printed.

### 3. `app/api/push/customer/subscribe/route.ts`

Mirrors the staff route. It decides nothing: the database function is the authorization. One shape
of failure for every cause.

The request carries the short code and the tracking token alongside the subscription, because
unlike the staff route this caller is not identified by a session cookie alone.

### 4. `components/order/CustomerPushOptIn.tsx`

Modelled on `StaffPushOptIn.tsx`, placed on `/order/[code]` beneath the tracker, and it inherits
two rules from it:

- **It never removes itself on failure.** Every failure mode here is invisible by nature. The
  reference project's control deleted itself on error and turned a fixable configuration problem
  into a mystery.
- **Permission is requested on a tap, never on load.** A prompt on page load is the one a person
  dismisses without reading, and a browser only offers it once. Spec section 15.

It adds one state the staff version has no need of. **On iOS, Web Push is delivered only to a site
installed to the Home Screen**, and `pushManager.subscribe` fails outside standalone mode
regardless of what the customer taps. So an iOS browser not in standalone mode gets an instruction
to install the site first, rather than a button that cannot work. Detect with a display-mode media
query rather than by sniffing the user agent alone.

### 5. Dispatch

`customerPayload` returns to `lib/push/payload.ts` unchanged in substance: it delegates every
sentence to `statusCopy()` so the notification and the tracking page cannot drift into two voices.
`statusCopy()` itself was never touched.

`notifyCustomer` returns to `lib/push/dispatch.ts`, with the subscription lookup filtering
`transport = 'web'` and selecting the keypair, and the send going through `sendWeb` rather than the
deleted `sendExpo`. `deleteDeadEndpoints` is already shared and already correct for both audiences.

`CustomerNotifyResult` comes back with it, because the drain needs an answer. `delivered: 0` stays
a real and common answer meaning the customer never opted in, which is not a failure and which
retrying would never fix.

### 6. The queue drain

`drainPushQueue` returns to `lib/push/drain.ts` and the cron route calls it again.

This is the piece that closes the actual gap. `0039`'s expiry sweep runs inside `pg_cron`, has no
request to hang work off, and therefore queues a `notifications` row instead of sending. Those rows
have been accumulating unread since the drain was deleted. Restoring it delivers the one message
that tells somebody their order was cancelled for non-payment.

Restore the claim semantics exactly. `claim_queued_push_notifications` (`0041`) does the selection
and the status flip in one statement with `for update skip locked`, because the cron route is also
manually triggerable and two drains can overlap. Do not replace it with a read-then-write.

### 7. Service worker and manifests

**`public/sw.js` is currently written for one audience.** Its unreadable-payload fallback says "New
order / Open the orders board to see it" and falls back to `/workspace/orders`. One worker serves
scope `/`, so a customer with a payload the worker cannot parse would receive that.

Add an `audience` field to `PushPayload`, set by each builder, and choose the fallback text and URL
from it. The `notificationclick` handler needs no change: it is already origin-generic and its
focus-rather-than-open behaviour is right for both audiences.

**The manifests split.** `app/manifest.ts` currently describes the counter tablet, and a manifest is
per origin, so a customer installing the site to reach iOS push would land on the staff orders board
in landscape.

`app/manifest.ts` becomes the customer manifest, at `start_url: "/"`, named for the restaurant and
without the tablet's landscape lock. The workspace gets `public/workspace.webmanifest` carrying what
`app/manifest.ts` has today, referenced from `app/(workspace)/workspace/layout.tsx` as
`export const metadata = { manifest: "/workspace.webmanifest" }`.

The Next 16 documentation confirms both halves: `manifest.ts` must sit at the root of `app`, and
`metadata.manifest` on a layout emits its own `<link rel="manifest">`. What the documentation does
not state is whether the root file convention also emits one on those pages. **Verify against built
HTML that a workspace page carries exactly one manifest link, and that it is the workspace one.** Do
not take this section's word for it.

## Data flow

1. A customer opens `/order/[code]?t=token` and taps the opt-in.
2. The browser registers `/sw.js` at scope `/`, requests permission, and mints a subscription
   against `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
3. The client POSTs `subscription.toJSON()` plus the short code and tracking token.
4. The route hands it to `lib/customer/push.ts`, which flattens the keys and calls `0047`.
5. `0047` authorizes against the order, refuses a foreign-audience endpoint, and writes both the
   subscription row and the `push_subscription_orders` follow row.
6. Later, a status change calls `notifyCustomer` under `after()`, or the expiry sweep queues a row
   that the cron drain picks up.
7. `notifyCustomer` reads the order, builds the payload through `statusCopy()`, finds the web
   subscriptions following that short code, and sends. Dead endpoints are deleted.

## Error handling

Unchanged in principle from the staff path, and both rules are load-bearing.

**A notification must never fail the mutation that triggered it.** Spec section 15. Every dispatch
function is one try/catch that logs and returns, and `sendWeb` already never rejects.

**Anything sent after the response goes to `after()` as an awaitable promise.** A detached promise
is killed mid-flight on Vercel and surfaces its `ECONNRESET` on an unrelated later request.

## Testing

Test-driven, per the project workflow.

- **SQL, against PGlite.** `0047`'s authorization: right token, wrong token, malformed token,
  signed-in owner without a token, a caller who is neither. Terminal orders refused. Idempotent
  re-registration. A second order followed by one device. **And the audience guard: a staff-owned
  endpoint is refused, and the staff row survives unchanged.** That last case is the one this design
  exists to prevent, so it is not optional.
- **Unit.** The registration service, including the nested-keys shape that has bitten once already.
  `notifyCustomer` selecting only `transport = 'web'` rows. The payload delegating to `statusCopy()`.
  The drain's outcome accounting. A source tripwire for the trigger points, matching
  `tests/unit/push-triggers.test.ts`.
- **Not provable here.** That a phone lying face down lights up. That belongs on real hardware, and
  `docs/push-device-test-checklist.md` gains a customer section again.

## Out of scope

- Staff push, in every respect.
- Setting `NEXT_PUBLIC_VAPID_PUBLIC_KEY` or `VAPID_PRIVATE_KEY`. **Nothing here delivers a single
  notification until those exist on a deployment**, and per `docs/vercel-deployment-checklist.md`
  there is no deployment yet. The public key is inlined at build time, so setting it without
  redeploying changes nothing.
- Dropping `register_customer_push_device`. Migrations here are forward-only and it is applied in
  production. It becomes permanently unreachable rather than removed.
- A retry or stuck-row sweep. `0007`'s `sending_started_at` still exists for whoever builds one, and
  the hazard documented in the deleted `drain.ts` still applies: a delivered notification whose
  bookkeeping write failed reads as `failed`, so a naive retry tells that customer twice.

## Open points

None blocking. One worth a decision later: whether the opt-in should also appear on the checkout
confirmation rather than only on the tracking page. Spec section 15 says the prompt belongs after
the first successful order, and the tracking page is where an order first becomes real, so this
design puts it there and nowhere else.
