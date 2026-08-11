# Briefing prompt: how orders actually work on NYBB Order

Paste the section below to Codex (or any agent) before it touches ordering, payment, the workspace
orders board, or POS code. It exists to stop plausible-looking work that this project does not
want.

---

You are working on **NYBB Order**, a pickup-only ordering platform for New York Buffalo Brad's Hot
Wings in Cebu. Before writing code, read `AGENTS.md`, then sections 13, 16 and 17 of
`docs/IMPLEMENTATION-PROMPT.md`. That spec is the source of truth. If reality contradicts it, say
so and update it rather than diverging quietly.

## The one rule that overrides your assumptions

**Pickup orders are strictly payment first.** The customer pays online before the order is
processed. There is no pay at counter, no cash on collection, and no pay later. An order does not
reach the branch, and does not consume kitchen capacity, until payment has cleared. This is an
owner ruling dated 2026-08-11 and it supersedes decision D4 in the spec.

Consequence: **every order a staff member sees is already paid.** No screen, action, or database
path should offer to take money at the counter.

## What is actually built right now, which contradicts that rule

Do not assume the ruling is implemented. It is not. As of this briefing:

- `lib/paymongo` does not exist. The online payment layer was never ported from the reference
  project.
- `app_settings.paymongo_enabled` defaults to `false`.
- `place_order` rejects every non-counter payment method while that flag is off
  (`supabase/migrations/0013_place_order.sql:260`).
- `lib/checkout/schema.ts:97` pins `payment_method` to `'counter'` deliberately.

So counter payment is currently the only working rail, and turning it off before online prepay
exists would close ordering entirely. Section 27 was replanned around this on 2026-08-11. Online
prepay is now **Phase 1b**, a launch blocker rather than a Phase 5 option, and refunds are
**Phase 2b**, also a launch blocker, because holding customer money before the food is made means
the business can owe it back. Phase 1b additionally depends on PayMongo merchant approval, which is
a business process outside the repo. Read section 27 before proposing a build order.

**If you are asked to enforce payment first, the work is to build the prepay path, not to delete
the counter path.** Keep `'counter'` in the `payment_method` enum and leave the counter capture
branches in `0018_staff_order_ops.sql:99` and `0024_order_ops_resolved_permission.sql:114` in
place but unreachable from pickup checkout. They are not dead weight, they are the record of a
decision, and ripping them out makes the migration history lie.

## The actual order lifecycle

Statuses in the database are `pending`, `accepted`, `preparing`, `ready`, `claimed`, `rejected`,
`cancelled`, `no_show`. Customer-facing and staff-facing wording is New, Preparing, Ready, Claimed.

1. Customer orders on the website, pays online, order is created.
2. Payment clears. Only then does the order become work for the branch.
3. It appears on the workspace orders board (`app/(workspace)/workspace/orders/page.tsx`).
4. Staff work it in **three taps, not six**:
   - **Start** sets `accepted` and `preparing` together.
   - **Ready** sets `ready` and notifies the customer.
   - **Claim** prompts for the four-digit pickup code, verifies it, sets `claimed`. Under payment
     first it collects nothing. It is verification only.
5. A no-show after the pickup window releases the slot.

The three-tap collapse is deliberate. The reference project learned that a six-status workflow
means six taps per order during a rush and cashiers stop using it. Do not add statuses, do not add
confirmation dialogs to the happy path, and do not split Start into two actions.

## Do not build these

Each of these looks reasonable and is wrong for this project:

- **Any pay-at-counter or cash UI.** No change calculation, no drawer, no "collect PHP 450" prompt,
  no cash reconciliation screen.
- **A "sign in to pay at counter" affordance.** The rail it gated no longer exists. Guests can
  order, because guests can prepay.
- **Automatic pushing of orders into ZenPOS.** ZenPOS publishes no API, no webhooks, and no
  developer documentation. Ten discovery questions are outstanding
  (`docs/zenpos-questions.md`). Ship `ManualRekeyAdapter` behind the `PosAdapter` interface and
  leave `ZenPosAdapter.send()` throwing `NotImplementedError`. Do not write ZenPOS HTTP code before
  questions 2 and 3 have written answers.
- **Removing the orders board because a POS integration would replace it.** It would not. The board
  owns when to start cooking, when food is ready, the pickup code check at handover, and no-shows.
  A POS records a sale. It does not text a customer that their wings are ready. POS sync removes
  the re-typing, not the board.
- **Dine-in features.** No table state, no split bills, no running tabs. ZenPOS owns dine-in and
  this platform owns pickup. Do not build a second system that fights the POS.
- **Delivery.** Not in scope for this platform. Do not port the reference project's delivery
  subsystem.
- **Anything Loyverse.** Wrong POS, different company. Only the mapping concept survives.
- **Loyalty, recommendations, or reorder** unless explicitly asked. Phase 5 at the earliest.

## What payment first newly puts in scope

Do not build these unprompted either, but know they are consequences rather than nice-to-haves:

- **Refunds.** Money is taken before food is made, so a sold-out item, a kitchen failure, or an
  unexpected closure now creates a refund obligation. This is real work with a real workflow.
- **A refund policy page.** Previously card-payment paperwork, now genuinely required.
- **Unpaid-order expiry.** An online payment intent that never completes must expire and release
  its pickup slot.

## Open questions. Do not invent answers.

Section 28 of the spec lists what only the business can decide. Relevant here:

- **No-show policy under payment first.** The customer paid and did not collect. Held, remade,
  refunded, part-refunded, or forfeited is a money decision, not a technical one. Unanswered.
- **Prep time and kitchen capacity per fifteen minutes.** Unanswered. Do not seed a guess.
- **ZenPOS technical contact.** Unanswered.

If your work needs one of these, do everything that does not depend on it, then state the
assumption or ask. Do not pick a plausible number and move on.

## House rules that trip up agents

- This is **Next.js 16**, not 15. Middleware is `proxy.ts`. Read `node_modules/next/dist/docs/`
  before touching routing, caching, Server Actions, `after()`, or images. Do not write Next 13/14
  idioms from memory.
- `npm run build` is part of the test loop, not just `tsc`. A `"use server"` file may only export
  async functions, and exporting a constant or type from an actions file passes type-checking and
  unit tests, then fails the build.
- **No em dashes anywhere.** Not in code comments, commit messages, documentation, or UI copy. Use
  commas, periods, or parentheses.
- `C:\dev\zombeans-web` is a **read-only** reference. Read it freely. Never write to it, never run
  its migrations, never start its dev server. Inherit its patterns, not its brand, copy, colors, or
  theming.
- The client never sends a price. Every order write goes through a `SECURITY DEFINER` Postgres
  function. Every table has RLS.
