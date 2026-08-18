# Vercel: deployments, and the commits that cannot make one

Written 2026-08-17, corrected 2026-08-18 after the dashboard contradicted it.

## What is actually wrong, and what this file first said

**The `nybb-order` project exists, is connected to this repository, and deploys.** Two production
deployments are live and green.

The first version of this file said no project existed. That was wrong, and the way it went wrong
is worth keeping. The Vercel API listed only `pesoconnect` and `peso-connect` for the team, and
`.vercel/project.json` pointed at a project id that returns 404, so the conclusion looked
supported. It was not: the same token had already answered `403 Forbidden` on `list_deployments`,
which was evidence the view was PARTIAL. An empty listing from a partial view is not proof of
absence, and it was read as one.

**The real cause is commit attribution, and the discriminator is the COMMITTER, not the author.**
Every commit in this repository is authored by `mollywocka@gmail.com`. The two that deployed
successfully carry a different committer, `wockamolly@gmail.com`, because GitHub itself created
them while performing a rebase merge and stamped them with the merging account's verified address.
Every commit pushed straight from the CLI carries `mollywocka@gmail.com` in both fields and is
refused, reported as "GitHub couldn't verify an account for the commit" on a branch and
"Deployment was blocked" on `main`.

So the pattern is: **merge through GitHub and it deploys; push directly and it does not.**

### Fixing it, two ways

1. **Add `mollywocka@gmail.com` to the GitHub account** (Settings, Emails) and verify it, so Vercel
   can attribute commits carrying it. Keeps the existing git identity.
2. **Set `git config user.email wockamolly@gmail.com`** so future commits carry the address Vercel
   already accepts. Does not fix commits already pushed.

Either is a decision about an account, so neither belongs to an assistant.

Nothing in the application was ever wrong. `npm run build`, `npm run lint`, `npm run typecheck` and
the full test suite were green throughout.

## Where this stands, 2026-08-18

- The git identity is corrected. Commits had been signed `mollywocka@gmail.com`, which is
  `wockamolly@gmail.com` with the two halves of the name transposed, so Vercel could not attribute
  them and refused every one. It is a machine-wide setting and it was a typo, not a second account.
  Verified: the first commit pushed after the correction deployed green.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were set on 2026-08-18, using the
  newer **publishable** key (`sb_publishable_...`) rather than the legacy `anon` JWT. `supabase-js`
  is 2.112.0 and accepts either, and nothing in `lib/supabase/` assumes a key format. If the
  publishable key ever misbehaves, the legacy `anon` key is the proven fallback, so do not press
  "Disable JWT-based API keys" in Supabase while that fallback still matters.
- **Setting them was not enough, and this is trap 1 arriving in real life.** Vercel does not
  rebuild when an environment variable changes. The values sat unused through a deployment that
  reported success, and the bundle still contained no Supabase URL. A redeploy is what applies them.
- The VAPID pair is still unset, so customer and staff push are both inert.
- **The franchise form stores a lead, confirmed by a real submission on 2026-08-18.** The
  `noindex` that covered the site while it could not is removed, so the site is findable again.
  Proving the connection without submitting anything is worth knowing for next time: request
  `/order/<any-code>`. "We cannot find an order for that link" means the database was reached and
  answered, because `lib/orders/reader.ts` returns `unavailable`, with different wording, for an
  unconfigured or failing connection. Scanning the client bundle for the Supabase URL does NOT
  work, because `NEXT_PUBLIC_` values are only inlined into pages that use them from the browser,
  and neither the landing page nor `/franchise` does.

## The one decision to make before starting

**An env-less deployment is a legitimate first deploy here, not a broken one.** Every reader in
`lib/menu/` falls back to the static catalog when `supabaseConfigured()` is false, and the landing
page already carries honest copy saying online ordering opens soon. So a project created with no
environment variables produces a working brand site: the menu, the item pages, the about and
contact pages, and the franchise inquiry page's layout.

What it does **not** produce is a working franchise form (it writes to `franchise_inquiries`),
sign-in, ordering, or the workspace. Those need Supabase.

Decide which of those two you are shipping before you point a domain at it.

---

## Step 1: create and connect the project

In the Vercel dashboard, add a new project from the `wockamolly-commits/NYBB-WEBAPP` repository.
There is no `vercel.json` in this repo, so let Vercel auto-detect: it will find Next.js and use
`npm run build` with the default output. Do not add a custom build command.

Node version: nothing is pinned in `package.json` (no `engines`, no `packageManager`), so Vercel
picks its current default. The project builds on Node 20 and 22 locally. If a build ever fails on a
Vercel default bump, pin it in the project settings rather than adding a `vercel.json` for it
alone.

## Step 2: the environment variables

Seventeen names appear in `.env.example`. They are not equal in urgency and they are not all safe
to paste into a chat window.

### Set these yourself, in the Vercel dashboard, and nowhere else

These are credentials. Do not put them in a file in the repo, do not paste them into a terminal
that logs, and do not hand them to an assistant.

| Variable | Why it is sensitive |
| --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses row level security completely. |
| `PAYMONGO_SECRET_KEY` | Moves real money. |
| `PAYMONGO_WEBHOOK_SECRET` | Forging it lets somebody mark an order paid. |
| `VAPID_PRIVATE_KEY` | Signs pushes to every registered tablet. |
| `CRON_SECRET` | The only guard on `/api/cron/expire-orders`. |
| `ZENPOS_API_KEY` | Leave unset. Section 16.2 discovery is unanswered. |
| `RESEND_API_KEY` | Optional, and dark until `app_settings` enables email. |

### Safe to set, and required for anything beyond the brand site

| Variable | Value | Scope |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | The project URL | Production **and Preview** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | The anon key | Production **and Preview** |
| `NEXT_PUBLIC_SITE_URL` | The canonical origin, no trailing slash | Production only |
| `SUPER_ADMIN_EMAIL` | The one account allowed to hold Super Admin | Production |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | The 87 character public key | Production |
| `VAPID_SUBJECT` | `mailto:` address | Production |
| `NEXT_PUBLIC_PAYMONGO_PUBLIC_KEY` | Only when going live with payments | Production |
| `RESEND_FROM` | Only alongside `RESEND_API_KEY` | Production |

### Do not set

`MOCK_PAYMENTS_ENABLED`. `mockPaymentsEnabled()` in `lib/paymongo/mock.ts` is hard gated on
`NODE_ENV !== "production"`, so the value is inert in a Vercel production build. Setting it to
`true` there does nothing, which is worse than it sounds: it reads as though the simulator is on.

---

## Step 3: four traps, each of which has already cost somebody time

**1. `NEXT_PUBLIC_*` is baked in at build time, not read per request.** Setting one of these on the
host without redeploying changes nothing at all. This is called out in `.env.example` for the VAPID
key and it applies to every `NEXT_PUBLIC_` name in the table. After changing one, redeploy.

**2. The Supabase pair must exist in the Preview scope, not only Production.** `next.config.ts`
builds its `images.remotePatterns` from `NEXT_PUBLIC_SUPABASE_URL` **at build time**. If it is
missing when a preview builds, that deployment has no remote pattern for the storage bucket and
every menu photograph served from Supabase fails to load. The page renders, the images do not.

**3. `siteUrl()` falls back to `NEXT_PUBLIC_VERCEL_URL`, not `VERCEL_URL`.** Read
`lib/site-url.ts`. An explicit `NEXT_PUBLIC_SITE_URL` wins, and that is what production should
have. Previews have no such value, so they depend on `NEXT_PUBLIC_VERCEL_URL` existing, which
requires Vercel's "Automatically expose System Environment Variables" setting to be on. **If it is
off, previews silently fall back to `http://localhost:3000`**, which becomes the `metadataBase` and
the PayMongo return URL. Verify it rather than assuming: deploy a preview and check that a page's
canonical link is not localhost.

**4. Generate the VAPID pair once and keep it.** A browser binds its subscription to the public key
that created it. Replacing the pair does not rotate a credential, it orphans every registered
tablet: each keeps a subscription the server can no longer reach, silently, until somebody taps the
opt-in again. Use a different pair for local development so a laptop can never ring a real counter
tablet. `docs/push-device-test-checklist.md` has the install procedure and the way to confirm the
public key actually reached the build.

---

## Step 4: after the first successful deploy

- [ ] The franchise page renders and **the form submits**, landing a row in `franchise_inquiries`.
      This is the site's headline job, so it is the first thing to prove, and it is the first thing
      that fails without Supabase.
- [ ] The menu renders from the **database** rather than the static fallback. Both look identical,
      which is the trap: seeing a menu proves nothing. Prove it the way the README describes, by
      writing a string into a category blurb that exists nowhere in `lib/catalog/` and finding it in
      the served HTML.
- [ ] `/workspace/login` reaches Supabase and the Super Admin can sign in.
- [ ] No CSP violations in the browser console. Every route is server rendered on purpose
      (`await connection()` in `app/layout.tsx`), because a nonce CSP and prerendering are mutually
      exclusive. If a deployed page hydrates nothing while `next dev` looked fine, read handoff
      trap 11 before touching anything.
- [ ] The staff push opt-in on `/workspace/orders` does **not** say "not configured on this
      deployment". If it does, the public VAPID key did not reach the build. See trap 1.

## Step 5: the cron endpoint, which is not a Vercel Cron

There is no `vercel.json` and therefore no Vercel Cron entry. That is deliberate. The expiry sweep
runs inside Supabase on `pg_cron` every five minutes, because cancelling an unpaid order must not
depend on Vercel being reachable. `/api/cron/expire-orders` is the manual handle on the same
function, guarded by a constant-time bearer comparison against `CRON_SECRET`
(`lib/cron/authorization.ts`).

If you want `pg_cron` to be able to call the route through `pg_net`, it needs the deployed origin
and the same secret. Confirm the sweep is scheduled in Supabase before assuming expiry works in
production; a green deploy says nothing about it.

**The cancellation is what money depends on, and it happens regardless.** The sweep cancels an
unpaid order from inside `pg_cron`, on its own, whether or not this route is ever called. That part
was never in question. What this route adds is the notification: it drains whatever `notifications`
rows the sweep queued and sends them as Web Push. That drain was an Expo path that went with the
mobile app on 2026-08-17, and for a while the queued rows really did sit unread. This branch
restored it: `drainPushQueue` (`lib/push/drain.ts`) runs at the end of this handler again, so a
customer whose order was cancelled for non-payment is told, not just the counter. See section 15 of
`docs/IMPLEMENTATION-PROMPT.md`.

## If the GitHub check still fails after all this

The Vercel App reports against the repository, so a red check with no project attached is expected
and means the connection in step 1 did not complete. Once a project exists and is connected, the
status reflects a real build. If it still refuses with "couldn't verify an account for the commit",
that is Vercel declining to attribute the commit author to a Vercel user: check that the git author
email on the commit is one your Vercel account recognizes. This repository's commits are authored
as `mollywocka@gmail.com`, while the GitHub account's own address appears as `wockamolly@gmail.com`
in the merge commits GitHub generates. Those are different addresses, and that mismatch is worth
ruling out first.
