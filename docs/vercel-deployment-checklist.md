# Vercel: the first deployment

Written 2026-08-17, after finding that the failing "Vercel" check on every push was not a broken
build. There was no project to deploy into.

## What the state actually was

- The Vercel account (`wockamolly-commits' projects`, `team_IsA5SxUzoiYiEJ4MnAeccdIf`) held two
  projects, `pesoconnect` and `peso-connect`. No NYBB project existed.
- `.vercel/project.json` pointed at `prj_IWLSh8iIx3gAEFK57HzmyGQM3Aso`, which returns 404. It had
  been deleted. That stale file has been removed (it is gitignored, so it was local only).
- The Vercel GitHub App is still installed on the repository, so every push receives a commit
  status it cannot satisfy. It reported "GitHub couldn't verify an account for the commit" on a
  branch and "Deployment was blocked" on `main`. Two messages, one cause.

Nothing in the application was wrong. `npm run build`, `npm run lint`, `npm run typecheck` and the
full test suite were green throughout.

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

**Known gap, carried deliberately.** That sweep still inserts `notifications` rows that nothing
drains, because the drain was an Expo path and went with the mobile app on 2026-08-17. They
accumulate as `queued` and are read by nothing. The cancellation itself, which is the part a
customer's money depends on, happens inside the sweep and is unaffected. See section 15 of
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
