# Order notifications, design

Written 2026-08-13. Covers spec section 15 and the notifications half of Phase 3.

## What this is

Alerts that reach a person when they are not looking at a screen. Two audiences,
two transports, one backbone.

- **Customers** get notified in the Expo app (`apps/customer`) through Expo's
  push service, which relays to Google's FCM on Android and Apple's APNs on iOS.
- **Staff** get notified in the browser workspace on the counter tablet through
  Web Push with self-hosted VAPID keys.

The realtime updates that already exist (migration `0021`, the 20 second polling
fallback, the app's own poll while an order is live) are unchanged. This
supplements them. It does not replace them, because realtime is instant when the
screen is open and push has provider latency and OS throttling.

## Decisions taken, and where they came from

| Decision | Made by | Note |
|---|---|---|
| Customer notifications are native only, no Web Push | Owner, 2026-08-13 | There will be no customer web storefront at all. Everything customer-facing moves into the app. |
| Staff notifications are Web Push, for now | Owner, 2026-08-13 | The workspace stays a website on the counter tablet. A native staff app is planned eventually and will replace this. |
| Customer events are ready, rejected, cancelled | Owner, 2026-08-13 | Spec section 15 says ready only. It was written before a branch could refuse an order (`0036`) and before an unpaid order could be swept (`0031`). |
| Staff subscriptions key on the staff account, branch resolved at send | Owner, 2026-08-13 | So the people pinged are exactly the people allowed to see the order. |
| Direct sends where a request exists, a queued row only for the sweep | Owner, 2026-08-13 | See "The one event with nobody waiting". |

**This contradicts `docs/mobile-app-transition.md`**, which says the web storefront
is retained through the pilot with removal to be approved later. That approval has
now happened. Update that document as part of this work rather than diverging from
it silently.

## The schema already has most of this

Migration `0007` created three tables for exactly this feature and nothing has
written to them since. They were carried over from the reference project in Phase
0 and have been waiting for Phase 3. **Do not create new tables alongside them.**

- **`push_subscriptions`**: `audience` in `('customer','staff')`, `profile_id`
  for staff rows, `endpoint` unique, `p256dh`, `auth_key`, timestamps, and a
  check constraint tying the audience to whether `profile_id` is set. Note that
  `profiles` is the *staff* table here, so a signed-in customer still leaves
  `profile_id` null. The existing constraint is already right about that.
- **`push_subscription_orders`**: `(endpoint, order_code)`, so one device
  following two orders in an evening is two rows against one subscription. This
  is better than keying a device row to an order, which is what an earlier draft
  of this design proposed and which would have duplicated the device per order.
- **`notifications`**: `channel` in `('push','email')`, `target`, `template`,
  `payload` jsonb, `status` in `('queued','sending','sent','failed')`, `attempts`,
  `sending_started_at`, `sent_at`, `last_error`. This is a complete outbox,
  including the in-flight-versus-stuck distinction its own comment describes.
  **The queue this design needs already exists**, so no `push_outbox` gets built.

`0009` enables RLS on all three and deliberately gives them no policies. Its
comment states the intent: the send workers and the subscribe route use the
service-role client, and no browser session has any business reading a queue of
other people's phone numbers and endpoints. That is the correct posture and this
design keeps it.

## What does not transfer from the reference

`C:\dev\zombeans-web\docs\web-push-notifications.md` is the inherited design, and
three of its conclusions do not survive contact with this project.

1. **The staff trigger point moved.** ZOMBEANS pushed when the order was created.
   Here, payment comes first: an order sits at `pending` and stays off the kitchen
   board until the signed `payment.paid` webhook lands. Pushing at `place_order`
   would ping the counter for orders that are never paid for. The trigger is
   payment reconciliation.
2. **The reference rejected an outbox as overkill because "no worker/cron runtime
   exists today."** That reasoning does not transfer. This project has `pg_cron`
   running `expire_unpaid_online_orders()` every five minutes, a `CRON_SECRET`
   guarded route at `app/api/cron/expire-orders/route.ts`, and a `notifications`
   table already built to be drained.
3. **The reference shipped this with no automated tests, on purpose.** That does
   not transfer either. This codebase runs 564 tests across 46 files, and most of
   what is being built here (grants, policies, branch scope, message selection) is
   exactly what its SQL harness is good at.

What does transfer, and should be taken as given rather than rediscovered, is the
reference's hardening pass: silent per-order re-registration, `renotify` and
`requireInteraction` on the alerts that need acting on, a fresh worker with
no-cache headers, high urgency on sends, and never using the tab favicon route as
the notification icon.

## The one event with nobody waiting

Four moments produce a notification. Three and a half of them happen because
somebody made a request, so the send can be attached to that request.

| Event | Origin | Request in flight |
|---|---|---|
| Customer: ready | `staff_set_order_status` Server Action | yes |
| Customer: rejected | same Server Action | yes |
| Staff: a paid order landed | `payment.paid` webhook, and `settleMockPayment` | yes |
| Customer: cancelled, payment failed | `payment.failed` webhook (`0032`) | yes |
| Customer: cancelled, payment expired | `expire_unpaid_online_orders()` on `pg_cron` | **no** |

The expiry sweep runs inside Postgres deliberately. Migration `0031` says why in
its own comment: expiry must not depend on Vercel's cron limits or an HTTP round
trip. That decision is about whether orders get cancelled correctly, which
outranks whether a notification is convenient to send, so it stands.

So the sweep inserts a `queued` row into `notifications`, and the cron route that
already exists drains it. Everything else sends inline. Durability goes where the
problem is and nowhere else: making the ready path transactional and indirect
would solve a problem the ready path does not have, and ready is the one the spec
calls the entire value proposition of pickup ordering.

`notifications` carries `attempts` and `last_error`, so a retry sweep is a later
addition the columns already anticipate. Nothing retries in this slice.

## Migrations

### `0037_staff_branch_access_shared.sql`

The send side runs as `service_role` with no `auth.uid()`, so it cannot ask
`current_staff_can_access_branch()` anything. Writing a second branch-access
expression next to it is precisely the divergence migration `0024` was written to
end. Instead: extract `staff_can_access_branch(p_profile_id, p_branch_id)`, and
rewrite `current_staff_can_access_branch()` to call it with the current profile.
One definition, two callers.

`create or replace function` cannot amend a body in place, so the whole of
`current_staff_can_access_branch` is restated. Diff it against `0022` rather than
reading it fresh, for the same reason `0024` carries that warning.

### `0038_push_registration.sql`

**Two column changes to `push_subscriptions`, no new table.**

- `transport text not null default 'web' check (transport in ('web','expo'))`.
  The default keeps every future staff row correct without restating it.
- `p256dh` and `auth_key` become nullable, guarded by a new check: a `web` row
  must have both, an `expo` row must have neither. An Expo push token is a single
  string with no encryption keypair of its own, and it lives in `endpoint`, which
  is already unique and already the upsert key.

**Registration functions**, both `security definer`:

- `register_customer_push_device(p_short_code, p_tracking_token, p_expo_token, p_platform)`,
  granted to `anon`. It verifies the short code and tracking token the same way
  `get_order_by_tracking` does, so authorization lives in one place rather than in
  a route handler holding a service-role client. It upserts the
  `push_subscriptions` row on `endpoint` and inserts the `push_subscription_orders`
  row for this order. It refuses on a terminal order, because there is nothing
  left to announce.
- `register_staff_push_subscription(p_endpoint, p_p256dh, p_auth_key)`, granted to
  `authenticated`. It resolves the caller's active profile and requires
  `orders:view`, via `current_staff_has_permission`, because that is what "is
  allowed to know an order exists" means here.

**Recipient lookup.** `staff_push_targets(p_branch_id)`, `security definer`,
granted to `service_role` alone. Returns the subscriptions of active staff whose
profile passes `staff_can_access_branch`. Customer lookup needs no function: it is
a join from `push_subscription_orders` on the order's short code, read by the
service-role client.

**Grants.** Per trap 14, every revoke names `anon`, `authenticated` and
`service_role` explicitly rather than revoking from `public`, because Supabase
ships a default privilege that a `revoke from public` does not touch. The SQL
suite asserts the resulting grant set rather than assuming it.

### `0039_expiry_queues_notification.sql`

Replaces `expire_unpaid_online_orders()` so each order it cancels also inserts a
`notifications` row (`channel = 'push'`, `template = 'order_cancelled_expired'`,
`target` the short code) in the same transaction as the cancellation. Same
restatement warning as `0037`.

## Send side

`lib/push/` holds the whole of it.

| File | Job |
|---|---|
| `payload.ts` | Turns an order plus an event into a title, body, url and tag. |
| `expo.ts` | Posts to Expo's push API. Reads the per-token receipts and deletes rows Expo reports as `DeviceNotRegistered`. |
| `web.ts` | Wraps `web-push`. Deletes the row on a 404 or 410 and swallows everything else. |
| `dispatch.ts` | Given an order id and an event, resolves recipients and calls the right transport. The only thing call sites import. |
| `drain.ts` | Claims `queued` rows from `notifications`, sends, and marks them. |
| `vapid.ts` | Asserts the public key is 87 characters at startup, from `instrumentation.ts`. |

**The wording is not written twice.** `payload.ts` builds its body from
`statusCopy()` in `lib/orders/status.ts`, which already produces the exact sentence
the customer reads for every status, including the per-reason rejection copy from
`lib/orders/reject-reasons.ts` and the three different cancellation messages. A
notification that says something the tracking screen does not say is a second
voice talking to the customer, and this project already refuses that for money
(`lib/menu/line-pricing.ts` and `place_order`). A unit test asserts the body is
the one `statusCopy()` returned.

**Every call site hands an awaitable promise to `after()`**, per the spec's hard
rule. A detached promise is killed mid-flight on Vercel, and the `ECONNRESET`
surfaces on an unrelated later request, which is a genuinely horrible thing to
debug.

**A send can never fail the mutation that triggered it.** `dispatch.ts` catches
everything and resolves to void. An order does not fail to be marked ready
because Apple was slow.

**The tag is the order's short code**, so repeated notifications about one order
replace each other on the lock screen instead of stacking. `ready` alone carries
`requireInteraction`, `renotify` and a vibrate pattern, because it is the only one
the customer has to act on. Vibrate is honoured on Android and ignored on iOS,
which is an OS limit and not worth working around.

**The customer notification carries the tracking token in its url**, and that is
safe for a specific reason. Expo delivers to a token bound to one app install, and
the device receiving it already proved it held the tracking token at registration,
so nothing new is exposed. The existing rule that nothing ever *logs* the token is
unchanged.

## Client registration

**Customer, in the app.** `apps/customer/src/push/` requests permission on the
order screen after the first order is placed, never on launch, per spec section
15. Declining is a supported outcome: the screen keeps polling and nothing else
changes. When permission is already granted, the token is registered against the
*current* order on every mount, silently and with no prompt. This is not optional
polish. It is the specific bug the reference project shipped: a customer who
opted in last week has no live registration for this week's order, and background
alerts simply never arrive. `push_subscription_orders` is the table that makes
this cheap, because the device row is reused and only the follow row is new.

Registration posts to `POST /api/mobile/v1/orders/[shortCode]/push`, matching the
shape of the `arrival` and `payment` routes already there.

**Staff, in the workspace.** A button on the orders board registers the tablet.
Staff are signed in, so there is no token dance. `public/sw.js` handles the `push`
and `notificationclick` events and opens `/workspace/orders`. It is served with
no-cache headers and registered with `updateViaCache: "none"`, so a stale worker
cannot outlive a deploy. `app/manifest.ts` declares the landscape-first
installable workspace that spec section 8.3 asks for.

The notification icon is `public/icon-192.png` and the badge is `public/badge.png`,
both real files. It must not be `/icon.png`: `app/icon.png` owns that route and is
cropped for a browser tab.

## Testing

**SQL, against real Postgres in the existing PGlite harness.**

- `push_subscriptions`, `push_subscription_orders` and `notifications` remain
  unreadable and unwritable by `anon` and `authenticated` after the change.
- The grant set on the new functions is exactly as intended, asserted rather than
  assumed, per trap 14.
- The new transport check accepts a `web` row with both keys and an `expo` row
  with neither, and rejects both mixed cases.
- `register_customer_push_device` refuses a wrong tracking token, refuses a
  terminal order, upserts rather than duplicating on re-registration, and adds a
  second `push_subscription_orders` row for a second order on the same device.
- `register_staff_push_subscription` refuses a staff member without `orders:view`
  and refuses an inactive profile.
- `staff_push_targets` returns the branch's staff, excludes another branch's
  staff, and includes unassigned staff, which is the same null-means-business-wide
  reading `0023` established.
- `current_staff_can_access_branch` and `staff_can_access_branch` give the same
  answer for the same person, in both directions.
- The expiry sweep queues exactly one `notifications` row per order it cancels,
  inside the cancelling transaction.

**Unit.**

- The body of every event equals what `statusCopy()` returned, plus a
  source-level assertion that `payload.ts` contains no customer sentences of its
  own.
- Dead-token cleanup: an Expo `DeviceNotRegistered` receipt and a web 410 each
  delete their row; a 500 deletes nothing.
- `dispatch.ts` resolves without throwing when the transport rejects.
- `drain.ts` marks a sent row `sent`, marks a failed row `failed` with
  `last_error`, and does not claim a row already `sending`.
- The VAPID key assertion fires on a key that is not 87 characters.

**What cannot be automated.** Delivery to a locked phone. That needs a real device
and the external items below, and it stays genuinely unproven until then. It gets
a device checklist, not a green test run standing in for one. The checklist
covers: locked Android, locked iPhone, app killed rather than backgrounded,
tapping through to the right order, a second device on the same order, and
permission revoked mid-order.

## External dependencies, which are owner actions

None of these block writing the code. All of them block proving it works, which is
the same position PayMongo is in.

1. **An Expo account and project id** in `apps/customer/app.json`. Free.
2. **A Firebase Cloud Messaging key** for Android delivery, uploaded to EAS. Free,
   needs a Google account and a Firebase project.
3. **An Apple Push Notification key**, which requires a **paid Apple Developer
   Program membership, around USD 99 per year**. There is no free route to
   notifications on iPhone.
4. **A development or production build** of the app on a test phone. Push does not
   work in Expo Go on either platform.

Item 3 is now on the critical path for more than notifications. With no web
storefront, the Apple membership is the only route to iPhone customers ordering at
all. It has a sign-up and review delay and should be started immediately,
alongside the PayMongo merchant application.

## What this deliberately does not build

- **Customer Web Push, a storefront service worker, and the iPhone
  Add-to-Home-Screen prompt.** There are no web customers, so there is nobody to
  notify and no home screen to add anything to.
- **Email notifications.** Spec section 15 channel 3, flag-gated and optional. The
  `notifications` table already carries `channel = 'email'` for it. Not a launch
  blocker and not in this slice.
- **A no-show notification.** No-show handling is being rebuilt around the owner's
  policy answer (section 28 item 5b), which does not exist yet. Inventing the
  message before the policy would mean writing it twice.
- **Retry with backoff.** The columns exist and a sweep is a later addition. Push
  failures are low-stakes while realtime and polling both still work.
- **A `notifications` row for the direct sends.** They would give a send audit
  trail, and that is worth having eventually, but it is not what this slice is
  for.

## Decision log

| Decision | Alternatives | Why |
|---|---|---|
| Reuse `push_subscriptions` with a `transport` column | New tables per transport | The tables exist, unused, with the right shape. `push_subscription_orders` already models one device following several orders, which a per-order device table gets wrong. |
| Reuse `notifications` as the queue | A new `push_outbox` | `notifications` is a more complete outbox than the one being proposed, including the in-flight-versus-stuck distinction. |
| Customer devices follow orders through a join table | Device row keyed to an order | A customer ordering twice in an evening should not need two device registrations. |
| Staff keyed by profile, branch resolved at send | Keyed by branch, device declares its post | A device keyed to a branch keeps buzzing after the account that registered it loses access. |
| Extract `staff_can_access_branch` | A second branch check in the sender | A second definition is what `0024` exists to prevent. |
| Queue the sweep only | Uniform queue, or `pg_net` | Uniform makes the ready path indirect to solve a problem it does not have. `pg_net` inverts the dependency direction and adds an extension plus a shared secret to deliver one low-urgency message. |
| Bodies come from `statusCopy()` | Notification-specific copy | Two voices to the same customer drift, and the rejection reasons are already carefully written. |
| Automated SQL and unit tests | Manual only, as the reference did | The reference had no SQL harness. This project's is the part most likely to catch a grant or scope mistake. |
