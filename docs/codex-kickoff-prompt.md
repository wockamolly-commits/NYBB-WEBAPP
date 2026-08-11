# Kickoff prompt for Codex

Paste everything below the divider. It assumes Codex is starting cold on a repository that already
has Phase 1a and Phase 2a built, with the availability and customer-arrival work landed.

---

You are picking up **NYBB Order**, a pickup-only ordering platform for New York Buffalo Brad's Hot
Wings in Cebu. Most of Phase 1 and Phase 2 already exist. **Your first job is to understand what is
here, not to build.**

## Read first, in this order

1. `AGENTS.md`, the standing rules. Next.js 16, no em dashes, `C:\dev\zombeans-web` is read-only.
2. `docs/codex-order-workflow-brief.md`, how orders actually work and what not to build.
3. `docs/IMPLEMENTATION-PROMPT.md` sections 17 (payment) and 27 (build phases). Both were rewritten
   on 2026-08-11 and supersede anything older in that file.

Do not paste the spec into chat, it is roughly 1,800 lines. Read it from disk.

## State of the repository as of 2026-08-11

The availability/settings work is committed as `45ae127`, and the customer-arrival work, including
authorization and idempotency tests, is committed as `fd60e78`. Migrations `0001` through `0029`
pass the local suite. Still run `npm run build`, `npm run lint`, and `npm test` yourself before
starting Phase 1b. Do not assume staging has migrations past `0025` applied.

## What is already built. Do not rebuild it.

- **Storefront and menu**, from the database, with the wings configurator, heat meter, and
  variation-dependent option pricing.
- **Cart, pickup slots, checkout, and `place_order`**, with idempotency and rate limiting.
- **Order tracking** with the pickup code, and customer email OTP sign-in.
- **The staff workspace**: auth, roles with per-user permission overrides, the realtime orders
  board with the three-tap flow, pickup-code claim, order history, store availability and hours,
  and a branch-scoped audit log.
- Migrations `0001` through `0029`.

If you think one of these is missing, you have not found it yet. Search before you build.

## What changed underneath all of that

**Owner ruling, 2026-08-11: pickup orders are strictly payment first.** The customer pays online
before the order is processed. No pay at counter, no pay later, no cash on collection. An order does
not reach the branch until payment clears.

The shipped checkout does the opposite. It marks the order due at the counter, and that was correct
under the old plan. It is not any more. Specifically:

- `lib/checkout/schema.ts:97` pins `payment_method` to `'counter'`.
- `supabase/migrations/0013_place_order.sql:260` rejects every non-counter method while
  `app_settings.paymongo_enabled` is false, which it is by default.
- `lib/paymongo` does not exist. The online payment layer was never ported.
- The claim RPCs capture counter payment at `0018_staff_order_ops.sql:99` and
  `0024_order_ops_resolved_permission.sql:114`.

**None of that shipped work was wasted and none of it should be unwound.** The payment step
changes. Everything around it stands.

## The plan you are working to

Section 27 was replanned around the ruling:

- **Phase 1b, payment. The launch blocker.** Port the PayMongo layer from the reference project,
  QR Ph first. Checkout moves to prepay. The order stays `pending` until the webhook confirms.
  An expiry job releases slots held by abandoned payments.
- **Phase 2b, money out. Also a launch blocker.** Staff refunds, full and partial, because the
  business now holds customer money before the food is made and can owe it back.
- Phases 3 and 4 are unchanged.

## Before Phase 1b

1. Run `npm run build`, `npm run lint`, and `npm test`. `npm run build` is part of the test loop,
   not just `tsc`, because React Server Component boundary errors surface only there.
2. Read the latest `docs/HANDOFF.md` and sections 17 and 27 of the implementation prompt.
3. Follow the approved Phase 1b sequence. Build the prepay path beside counter payment, and switch
   pickup checkout only after the test-mode flow works end to end.

One constraint on that plan, decided already: **build the prepay path alongside the counter path
and switch checkout over last.** Do not disable counter payment first. It is the only working rail,
and turning it off before its replacement works closes ordering entirely. The counter path stays in
the schema afterwards, unreachable from pickup checkout, not deleted.

Note that Phase 1b cannot go live until PayMongo approves the merchant account, which is a business
process outside this repository. Build and test against PayMongo test mode. Approval gates
launching, not building.

## Do not

- Build any pay-at-counter, cash, change, or drawer interface.
- Delete the `'counter'` payment method or the counter branches in the claim RPCs.
- Write ZenPOS HTTP code. Ten discovery questions are outstanding in `docs/zenpos-questions.md`,
  and the vendor publishes no API documentation. `ManualRekeyAdapter` only.
- Remove the orders board on the theory that a POS integration replaces it. It does not. It owns
  cooking start, ready, pickup-code handover, and no-shows.
- Build dine-in, delivery, loyalty, or anything Loyverse.
- Invent answers to open business questions. The no-show and refund policy under payment first is
  unanswered, and so is kitchen capacity per fifteen minutes. If you need one, do everything that
  does not depend on it, then ask.

## How to report back

Tell me what you changed, what you ran and what the result was, what you assumed, and what you
could not finish and why. If a test fails, show the output rather than describing it. If you
disagree with something in the plan, say so before building, not after.
