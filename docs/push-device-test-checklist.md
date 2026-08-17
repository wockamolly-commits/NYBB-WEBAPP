# Push notifications: the device checklist

Everything in this file is something no test run in this repository can answer. The suite proves
that the right payload is built and that the right people are looked up. It cannot prove that a
tablet sitting closed on a counter lights up, which is the only thing anybody actually experiences.

Work through this on real hardware before telling anyone notifications are done.

**This is now a staff-only checklist.** It used to open with four Expo prerequisites (a project id,
an FCM server key, an APNs key with a paid Apple Developer membership behind it, and a real EAS
build), all of which blocked the customer half and three of which had lead times measured in days.
The mobile app was dropped on 2026-08-17 and the customer notification path went with it, so none
of that is on the critical path any more. If customer notifications come back they will be Web
Push in the browser, which needs no Apple membership and reuses the VAPID pair below.

---

## The one prerequisite, and it is cheap

Staff Web Push needs a VAPID key pair (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
`VAPID_SUBJECT`). `npx web-push generate-vapid-keys` produces one in a second. Without it the
opt-in on the orders board says the feature is not configured on this deployment, which is the
intended behaviour and not a fault.

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
