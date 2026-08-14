# Push notifications: the device checklist

Everything in this file is something no test run in this repository can answer. The suite proves
that the right row is queued, that the right payload is built, that the claim cannot double-send
and that the two ends of the deep link agree on one URL shape. It cannot prove that a phone lying
face down on a table lights up, which is the only thing a customer actually experiences.

Work through this on real hardware before telling anyone notifications are done.

---

## Before any of it: four things this repository cannot provide

None of these are code. Every one of them blocks the entire customer half, and three of them have
lead times measured in days.

| Prerequisite | What it blocks | Notes |
| --- | --- | --- |
| **Expo project id** (`extra.eas.projectId` in `apps/customer/app.json`) | Every customer notification, on both platforms. | `getExpoPushTokenAsync()` throws without it, and `registerForOrder` swallows the throw by design, so the symptom is silence rather than an error. Nothing reaches the server. |
| **FCM server key** (Firebase, uploaded to Expo) | Android delivery. | The token mints without it; delivery just never happens. |
| **APNs key** (Apple Developer, uploaded to Expo) | iOS delivery. | Requires a paid Apple Developer membership. |
| **A real build** (EAS development or production build) | Everything. | Expo Go cannot receive push for a project it does not own, and the Android channel is created by the app, not by the store listing. |

**The Apple Developer membership is on the critical path for iPhone customers ordering at all, not
only for notifying them.** Without it there is no iOS build to install, so an iPhone customer has
no app. Treat it as a launch dependency with a lead time, in the same class as PayMongo merchant
approval, and start it before it is needed.

Staff Web Push has its own prerequisite, and it is cheap: a VAPID key pair
(`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). `npx web-push
generate-vapid-keys` produces one in a second. Without it the opt-in on the orders board says the
feature is not configured on this deployment, which is the intended behaviour and not a fault.

### Installing the production pair

1. Set all three on the host. The private key is a secret and belongs nowhere else; the public one
   is not, and ships inside the site's own JavaScript by design.
2. **Redeploy.** `NEXT_PUBLIC_` values are inlined when the site is built, not read per request, so
   setting the variable without rebuilding changes nothing at all.
3. Open `/workspace/orders` on the deployed site. The opt-in reading "Order alerts are not
   configured on this deployment" means the public key did not reach the build, which is the
   distinction step 2 exists for.
4. Tap it, then confirm a row in `push_subscriptions` with `audience = 'staff'` and
   `transport = 'web'`.

**Generate the pair once and keep it.** A browser binds its subscription to the public key that
created it, so replacing the pair does not rotate a credential, it orphans every device already
registered: each keeps a subscription the server can no longer reach, silently, until somebody taps
the opt-in again. If you ever must replace it, plan on re-registering every tablet the same day.

Use a different pair for local development, so a laptop can never send to a real counter tablet.

As of 2026-08-14 there is no deployment: the Vercel account holds no NYBB project. A production
pair has been generated and is waiting for one.

---

## Customer, on the phone

Each of these needs a real order, because `register_customer_push_device` refuses a terminal one
and the queue only fills on a real status change.

- [ ] **Locked Android.** Place an order, put the phone to sleep, mark the order ready from the
      workspace. The notification appears on the lock screen, with the NYBB icon and the small
      monochrome badge, and it vibrates.
- [ ] **Locked iPhone.** The same. iOS is the one that will fail first if the APNs key is wrong,
      and it fails silently.
- [ ] **App killed, not backgrounded.** Swipe the app out of the task switcher, then trigger the
      notification. This is a different delivery path from a backgrounded app on both platforms,
      and it is the ordinary state of a phone in a pocket half an hour after ordering.
- [ ] **Tapping through opens the right order.** From a cold start (app killed), tap the
      notification. The app must open on that order, not the menu.
- [ ] **Tapping a notification for a DIFFERENT order than the one on screen.** Have order A open,
      receive a notification about order B, tap it, land on B. `tests/unit/order-deep-link.test.ts`
      proves the URL parses to the right order; nothing proves the screen follows it.
      This is the case most likely to be broken by a later change to `App.tsx`.
- [ ] **The app is open, on a screen that is not the order screen.** Browse the menu with a live
      order, then have it go ready. The notification must appear. `expo-notifications` discards a
      foreground notification when no handler is set, so this is a real failure mode with a real
      fix, and it is invisible to every automated check.
- [ ] **Two devices on one order.** Register a second phone against the same order (place the order
      on one, open it on the other with the same tracking token). Both must be told. The queue
      fans out per subscription, and `push_subscription_orders` keys on endpoint plus order code
      specifically so this works.
- [ ] **Permission revoked mid-order.** Place an order, turn notifications off in OS settings, then
      trigger the status change. Nothing should arrive and nothing should crash. Re-opening the
      order screen must not produce a second permission prompt, because the OS will not show one.
- [ ] **A returning device, on a new order.** Order once, then order again a week later on the same
      phone without reinstalling. The second order's alerts must arrive. This is the reference
      project's actual shipped bug: it skipped registration when permission was already granted, so
      the device stayed registered only for the first order it ever placed.
- [ ] **The three customer events, not just one.** `ready`, `rejected` and `cancelled` all notify.
      Force a `cancelled` by leaving a payment to time out. That path is the only thing that tells
      somebody their order was dropped for non-payment, and it is the one nobody remembers to test.

## Before concluding anything is broken

Two settings outside this project can swallow every alert while leaving no trace
anywhere in it. Both cost real time on 2026-08-14. Check them first.

- **The operating system's own notification switch.** On Windows: Settings,
  System, Notifications, and Chrome has to be switched on there as well as
  having permission on the site. With it off, the alert is delivered, accepted,
  and discarded before anyone sees it. Every log in this project says success,
  because as far as this project is concerned it was. Windows Do Not Disturb
  does the same thing.
- **Chrome's "Continue running background apps when Google Chrome is closed"**
  (Settings, System). A desktop Chrome that fully quits is not listening, so no
  alert can reach it while closed. Confirm by closing every Chrome window and
  looking for a Chrome icon in the notification area beside the clock: no icon
  means no delivery, whatever the setting says.

  **This is a desktop quirk and does not apply to the Android counter tablet**,
  where the operating system receives the message and wakes the browser. A
  laptop failing this test predicts nothing about the tablet, which is why the
  tablet test below cannot be substituted with a laptop.

## Staff, on the counter tablet

- [ ] **The workspace closed entirely.** Close the browser, not just the tab, then place an order.
      The tablet must ring. This is the entire reason the staff half is Web Push and not a socket
      on the orders board, so a pass on a tablet with the board open proves nothing.
- [ ] **Opt in, in the production build.** `next dev` is not a valid environment for this: run
      `npm run build && npx next start -p 3001`, sign in, tap "Tell me about new orders" on the
      orders board, and confirm a `push_subscriptions` row appears with `audience = 'staff'` and
      `transport = 'web'`.
- [ ] **The browser console shows no CSP violation.** `worker-src 'self' blob:` and
      `manifest-src 'self'` are already in the policy, so a violation means something else. The
      specific thing to watch for: `/sw.js` is served through the proxy and therefore carries the
      page's `script-src 'self' 'nonce-...' 'strict-dynamic'`. If the worker is blocked, the fix is
      to add `sw.js` to the matcher exclusion list in `proxy.ts`.
- [ ] **Tapping the notification focuses the workspace instead of opening a second copy of it.**
      A tablet that ends a shift with nine workspace tabs is a tablet somebody signs out of by
      accident.
- [ ] **A redeployed worker takes over without closing the tab.** Deploy a change to `public/sw.js`,
      reload the board, confirm the new worker is active. `skipWaiting` plus `clients.claim` plus
      the no-store header plus `updateViaCache: "none"` are four separate things that all have to
      be right, and the counter tablet is never closed, which is when the old worker would
      otherwise run forever.
- [ ] **A staff member without `orders:view` cannot subscribe.** The button is not on their page at
      all, and the endpoint refuses them if they reach it directly.
- [ ] **The tablet installed to the home screen.** The manifest asks for landscape and a standalone
      window, and Android is the platform that honours the orientation lock. Confirm it opens on
      the orders board and not the storefront.

---

## What a pass here does and does not mean

A pass means the pipe works end to end on the hardware in the room. It does not cover volume: every
figure in this project's queue design assumes the order rate of one branch, and nothing here has
been run against a busy Saturday. It also does not cover the retry that does not exist yet. A row
that fails to send today is not retried, and `docs/HANDOFF.md` records why.
