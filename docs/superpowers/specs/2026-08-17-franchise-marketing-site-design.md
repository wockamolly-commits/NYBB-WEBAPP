# Franchise-led marketing site, design

Written 2026-08-17. Covers spec section 7 (information architecture), N9 (franchise
inquiry form), and the repurposing of the customer web surface.

## What this is

The company gave two directions that sounded like a conflict and are not one.

- The **Marketing Head** wants the website to focus on franchise inquiries.
- The **IT Head** wants a customer ordering app.

These describe two different surfaces. The app has been the customer ordering
channel since 2026-08-12 and is already built through Phase M1. The website is
losing its ordering job anyway, per the retirement approved 2026-08-13. So the
website is not being taken away from anyone: it is changing from a second
ordering channel into a brand and lead-generation site, which is the job
Marketing is asking it to do.

Three surfaces, one backend:

```
app/(marketing)     franchise-led public web, SEO facing
app/(workspace)     staff browser tools, unchanged
app/api/mobile/v1   the app's contract, unchanged
apps/customer       Expo, the only customer ordering channel
lib/customer/       framework-neutral services, shared
supabase/           one database, one RLS boundary, + franchise_inquiries
```

Marketing gets the web, IT gets the app, and neither waits on the other.

## Decisions taken, and where they came from

| Decision | Made by | Note |
|---|---|---|
| The franchise inquiry form lives on this platform | Marketing Head, 2026-08-17 | This resolves open question 7 in both `PRODUCT.md` and spec section 28. |
| The public website becomes franchise-led, not a storefront | Marketing Head, 2026-08-17 | Full sales site, not just a form. See "Scope of the sales site". |
| Delivery stays deferred | Owner, 2026-08-12, reaffirmed 2026-08-17 | The IT Head said "pickup and delivery". The deferral has not been reopened by the owner, so this is treated as loose phrasing. See "Deferred, with triggers". |
| The transactional web routes are frozen, not deleted | Owner, 2026-08-17 | They stay standing and reachable. They receive no work. See "Frozen means frozen". |
| Static generation and the CSP change are dropped from this scope | This design, 2026-08-17 | Their justification depended on deleting those routes. See "Why everything stays dynamic". |
| Repurpose `app/(storefront)` in place rather than building a second app | This design, 2026-08-17 | The design system is the expensive part and it already exists. |

## Why the surfaces do not collide

Retirement kills the transactional half of the website and leaves exactly the
half Marketing wants.

| Web route | Fate under retirement | Wanted by Marketing |
|---|---|---|
| `/cart`, `/checkout`, `/order/[code]`, `/account`, `/login` | Deleted eventually, frozen for now | No |
| `/menu`, `/menu/[category]`, `/menu/[category]/[item]` | Kept as brand content, not as an ordering path | Yes, as menu showcase |
| `/`, `/about`, `/contact` | Kept | Yes |
| `/franchise` and its children | Never existed | Yes, this is the ask |

## Scope of the sales site

A form alone was the original N9 scope. Marketing asked for more than that, so
the site carries the investment case as content:

- The offer: what a franchisee gets, support, supply, territory
- The numbers: PHP 1,000,000 franchise fee, PHP 9,000,000 capital investment
  (spec section 3)
- The process and timeline, from inquiry to opening
- Branch showcase, using the existing verified image archive
- FAQ
- The inquiry form as the call to action on every one of these pages

The consumer brand becomes supporting material rather than the lead. The heat
scale, the wing photography and the sports-lounge angle stay, because they are
what makes the franchise credible, but they no longer own the landing page.

**Marketing must supply the copy and any franchise-specific photography.** The
investment figures above are the only franchise sales content currently on hand.
Everything else in the list is a content dependency, not an engineering one. Do
not invent claims about support, territory or returns: those are business
representations and some of them are legally binding.

## Phase F0, the rename

`app/(storefront)` becomes `app/(marketing)`. A Next route group in parentheses
groups files under a shared layout without adding anything to the URL, so this
renames no page and breaks no link. It is a one-commit change that makes the
directory say what it is now for, and it should land before the new pages so
they are not written into a folder called "storefront".

The frozen transactional routes move with it. They keep working, unchanged, at
the same URLs.

## Phase F1, lead capture

Ships first, alone, because it is small, fully specified, and starts earning
leads while the rest of the site is still being written.

**Schema.** Migration `0045`, forward-only, following the house pattern:
`franchise_inquiries` with the submitted fields, a timestamp, and the source
page. RLS on, no `anon` read, insert through a `SECURITY DEFINER` RPC rather
than a direct table grant, matching how every other public write in this schema
works. Remember that Supabase's default privilege grants `EXECUTE` to `anon`, so
the new function needs the same explicit revoke that `0015` established, and the
SQL harness will catch it if it is missed.

**The form.** A `/franchise` page posting through a Server Action. Zod validation
on the server. Rate limited by IP through the existing limiter, using
`addressRateKey("franchise", address)`; the namespacing in
[`lib/rate-limit/address.ts`](../../../lib/rate-limit/address.ts) was written in
anticipation of exactly this caller, so no new limiter code is needed. Honeypot
field, no CAPTCHA, per N9.

**The notification.** Email to `franchise@5bdf.ph` on successful insert, sent
under `after()` so a mail failure never fails the submission. The lead is in the
database either way, which is the point of storing it rather than only mailing it.

**Testing.** Unit tests for validation and the honeypot, SQL tests for the RLS
and grant behaviour, and one end-to-end submission. The existing suites are the
model.

## Phase F2, the sales pages

`/franchise` grows children for the content listed above. Static content,
server-rendered, using `components/site/` for the shell. Blocked on Marketing's
copy, not on engineering.

## Phase F3, landing page restructure

`/` changes its primary call to action from ordering to franchise inquiry, with
app download secondary. The existing franchise strip at
`app/(marketing)/page.tsx` becomes the hero rather than one quiet amber line
near the bottom.

The `mailto:franchise@5bdf.ph` links in the footer, the contact page and the
landing page all repoint at `/franchise`. Keep the address visible as text on
the contact page, because some franchise inquiries will always arrive by email
and the business should not look like it hides its address.

## Frozen means frozen

The transactional web routes stay standing and reachable. They get no work.

- A bug in the browser cart, checkout, tracking page, account or login is a note
  on the deletion ticket, not a fix.
- They are not a supported fallback ordering channel. The owner retired that role
  on 2026-08-13 and this design does not reinstate it.
- Changes to `lib/customer/` are judged against the app and the mobile API. If a
  change breaks a frozen web route, that is acceptable and is not a blocker.
- They do not appear in the definition of done for the app pilot.

This matches the standing instruction at
[`docs/mobile-app-transition.md`](../../mobile-app-transition.md), which already
says to treat a bug in them as a reason to delete sooner rather than as work.

## Why everything stays dynamic

`proxy.ts` mints a fresh nonce per request and `app/layout.tsx` calls
`connection()` in the root layout, which stops prerendering for every route in
the app at once. A marketing site would normally prefer static generation for
speed and crawlability.

Making only the marketing routes static would require splitting the CSP by path
in `proxy.ts` and pushing `connection()` down into each route group's layout.
That is surgery on the one thing spec section 22 calls Tier 1 and
non-negotiable, in code that has already shipped broken once in the specific way
`next dev` cannot reproduce: the nonce was missing from prerendered HTML,
`strict-dynamic` discarded the `'self'` allowlist, and nothing on the production
site hydrated at all.

Its security justification was that once the transactional routes were gone,
nothing left on the web took a payment or a session. Those routes are staying, so
that justification is gone too.

The cost of leaving it alone is HTML rendering per request, not database work:
the menu still caches by tag behind `getStorefrontMenu()`. Search engines index
server-rendered pages without difficulty. This is a time-to-first-byte cost, not
a visibility cost.

## Deferred, with triggers

| Deferred | Reopens when |
|---|---|
| Delivery | The **owner**, not IT, reopens it. It is not a screen: it is addresses, zones, a fee model, a changed order lifecycle, and either riders or an aggregator handoff. Spec section 9 argues Foodpanda already serves it. |
| Deleting the transactional routes | The owner lifts the hold. |
| Static generation and the CSP split | The transactional routes are actually deleted. Not before. |
| ZenPOS system integration | Unchanged, per the 2026-08-12 deferral. |

## Documents this contradicts, and how to fix them

Update these as part of this work rather than diverging silently, per AGENTS.md
rule 3.

- **`PRODUCT.md` item 7** and **spec section 28 item 7**: open question 7 is
  resolved. The franchise form lives on this platform.
- **`docs/mobile-app-transition.md`**: its closing line lists franchise inquiry
  handling as still open. It is now decided.
- **Spec section 7**: the information architecture lists `/franchise` as a single
  page and the customer routes as live. Record that the customer routes are
  frozen and that `/franchise` has children.
- **`README.md`**: the status section should say what the website is now for.

## Definition of done

- A franchise inquiry submitted on `/franchise` lands in `franchise_inquiries`
  and an email reaches `franchise@5bdf.ph`.
- The form cannot be submitted faster than the rate limit allows, and the
  honeypot discards bot submissions without storing them.
- `anon` cannot read `franchise_inquiries`, proved by an SQL test rather than by
  inspection.
- A mail-provider failure loses the email and keeps the lead.
- The landing page leads with franchise, with app download secondary.
- No `mailto:franchise@5bdf.ph` link remains as the only route to inquiring.
- Nothing in this work adds a delivery field, screen, or endpoint.
- `npm run build`, `npm run lint` and `npm test` are green.

## Open, and owned by other people

- Marketing supplies franchise copy, the process and timeline, and any
  franchise-specific photography.
- The owner confirms whether delivery is genuinely reopening.
- Everything already open in `PRODUCT.md` items 4, 5 and 6 is untouched by this
  design and still blocks the pilot.
