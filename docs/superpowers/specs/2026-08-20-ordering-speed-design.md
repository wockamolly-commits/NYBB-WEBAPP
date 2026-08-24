# Streamlining the customer ordering flow

Date: 2026-08-20
Status: approved in brainstorming, not yet implemented

## 1. Why

The four screens of spec section 11 work. What they do not do is get a returning
customer, or a customer who knows what they want, to a placed order quickly.

Three findings drove this design.

**Two thirds of the menu has nothing to configure.** Of 31 seeded items, 21 have
one size and no option groups at all, and 9 more have only a size. Exactly one
item, Chicken Wings, has the required flavour and optional heat that the
configurator was built for. For 21 items the product page is a detour: open it,
look at it, press one button.

**A returning customer has no faster path than a new one.** `/account` lists past
orders, and its "Order again" button links to `/menu`, which is where they would
have started anyway. For a wings shop whose regulars order the same thing, this
is the largest single speed win available.

**The product page tells every customer that checkout is shut.** Under the Add to
cart button, unconditionally:

> Build your order now. Checkout opens once pickup times are published; until
> then, call the branch you want to collect from.

`/menu` had the same bug and it was fixed there, with a comment recording why:
the sentence "was true on the day it was typed and false in whichever
environment did not match it". The fix never reached the item page, so the one
screen where a customer commits is the screen that tells them to phone instead.

## 2. Constraints this design accepts

- **Migrations are frozen at 0050.** Nothing here adds a migration.
- **The server prices everything.** Section 30 is explicit. Nothing here sends,
  computes or restores a price the server did not give it.
- **Snapshots are not the menu.** `get_order_by_tracking` deliberately returns
  the `*_snapshot` columns and refuses to join back to `menu_items`, so a
  receipt keeps saying what was sold. This design reads the snapshots and
  matches them against the menu separately; it does not change that function.
- **Open owner question 5b (no-show policy) is untouched.** Nothing here depends
  on it.
- The storefront's PayMongo key is pulled on purpose. All of this ships dark
  until trading opens, which is fine and changes nothing about the work.

## 3. Workstream A: reorder

### 3.1 What the customer sees

An "Order this again" button on:

- each past order on `/account`, for signed-in customers;
- `/order/[code]` for an order in a terminal state, which is the only place a
  guest's order exists.

Pressing it fills the cart, navigates to `/cart`, and shows one notice naming
anything that could not come back. A line whose price has moved comes back
normally and is flagged by the cart's own existing repricing marker, not by this
notice; see 3.7. The customer reviews and presses Checkout themselves. Reorder
never places an order and never skips the cart.

### 3.2 Why matching is on names

The cart identifies a line by slug. Order lines store both database ids and text
snapshots. The ids cannot be used:

- menu tables are staff-only under RLS, and the storefront reads the menu
  through the `get_storefront_menu()` security-definer function, so a customer's
  query cannot join an order line to `menu_items` to find a slug;
- `MenuItem` carries no id, only a slug, so there is no lookup on the client
  either;
- guests cannot read `order_items` at all. The policy requires
  `orders.user_id = auth.uid()`, and a guest order has a null `user_id`.

Closing any of those means a new database function, and migrations are frozen.
Names are available on both paths today, so names are what this matches on.

The cost is renames: rename an item and its past orders stop matching it. The
failure is safe rather than dangerous, because it degrades into the
"unavailable" case this feature must handle anyway. It never yields the wrong
food. If renames become common, a function returning slugs is a clean later
upgrade that changes nothing a customer sees.

### 3.3 The matching rule

Verified against `place_order` and migration 0011:

| Order snapshot | Live menu field |
| --- | --- |
| `order_items.item_name_snapshot` | `MenuItem.name` |
| `order_items.variation_label_snapshot` | `MenuVariation.name` |
| `order_item_options.group_name_snapshot` | `MenuOptionGroup.name` |
| `order_item_options.name_snapshot` | `MenuOption.name` |

Comparison is exact after trimming and case folding. No fuzzy matching: a near
match on a menu of nine similarly named flavours is a way to sell somebody the
wrong wings.

### 3.4 The rebuild, line by line

For each past line, in order:

1. Find the item by name. Miss: report `item`, stop.
2. Find the variation by name within that item. Miss: report `variation`, stop.
3. For each saved option, find its group by name, then the option by name within
   that group. Any miss: report `option`, stop.
4. Build a `CartLine` with the resolved slugs, `quantity` clamped to the cart's
   limits, and `unitPriceCents` read from the live menu.
5. Run `selectionProblem(item, selection)`. A failure means the restored
   selection no longer satisfies a required group, which happens when a required
   flavour has left the menu. Report `option`, stop.

Step 5 is the one that stops a half-built wings line reaching the cart.

### 3.5 Where the code lives

- `lib/cart/reorder.ts` — pure. Takes `MenuCategory[]` plus a list of past lines
  in a source-neutral shape and returns `{ lines: CartLine[]; skipped: SkippedLine[] }`.
  No React, no browser, no Supabase, so it is directly testable. This is the
  same split `lib/cart/lines.ts` and `lib/staff/board.ts` already use.
- `lib/orders/past-lines.ts` — server. Reads a past order's lines into that
  neutral shape, from either source:
  - signed in: a PostgREST select on `order_items` and `order_item_options`,
    which RLS already permits for the caller's own orders;
  - guest: the items array `get_order_by_tracking` already returns.
- `app/actions/reorder.ts` — a Server Action taking a short code and, for
  guests, the tracking token the page already holds in `?t=`. Returns the
  rebuilt lines and the skip report. It writes nothing.

  The token is a bearer credential: whoever holds it can read a name, a phone
  number and the pickup code. The tracking page already operates on exactly
  that trust boundary, and this action reads the same order the same holder is
  already looking at, so it widens nothing. Two rules carry over unchanged and
  are not negotiable: the token never reaches a log line, and it travels in the
  action's POST body rather than in any URL.
- `components/order/ReorderButton.tsx` — client. Calls the action, merges the
  returned lines into the cart, stashes the report, navigates to `/cart`.

The cart lives in `localStorage`, so only the client may write it. The action
returns lines; it never touches the cart.

### 3.6 Merge, not replace

Restored lines go through the existing `addToCart`, which merges by `lineKey`
and respects `MAX_LINES`. A cart that already holds something keeps it.

Replacing would be the faster read of "fills the cart", but it silently destroys
work the customer did on purpose, and the cart is the one place in this flow
holding uncommitted effort. If `addToCart` refuses a line because the cart is
full, that line is reported like any other skip.

### 3.7 Carrying the notice to `/cart`

The report is written to `sessionStorage` under a single key, then read and
cleared by the cart screen on mount. Not a query parameter: the report is a list
whose length varies, it is meaningless to anyone the URL is shared with, and
section 22's rule against putting order detail in URLs points the same way.

The notice states, in plain words, how many lines came back and what happened to
each one that did not. Prices are not part of it: `resolveCart` already marks a
repriced line on the cart screen, and a second mechanism saying the same thing
in different words is how the two drift apart.

### 3.8 What it does not do

No favourites, no saved orders, no "usual". Reorder reads history that already
exists. Anything that stores a preference is a new table, which is a migration,
which is out of scope.

## 4. Workstream B: quick add from the menu

An add control on the tile for any item with exactly one variation and no option
groups: 21 of 31 items today. The test is on the data, never a slug list, for
the same reason `ItemConfigurator` decides its layout from the data: the menu is
owner-editable from Phase 4, and an item that grows a size must stop being
quick-addable the day it does, without a code change.

Items with a size choice, and the wings configurator, keep going to their own
page. There is a real decision on those screens.

The tile stays a link to the product page. The add control sits inside it as its
own button, so the default action of the tile is unchanged and the fast path is
additive. Confirmation reuses the pattern already in `ItemConfigurator`: a live
region tied to what was added, not a toast on a timer.

## 5. Workstream C: friction on the existing screens

1. **The stale sentence on the product page.** Replace the hardcoded copy with
   the answer `onlineOrderingOpen()` and the store selection already give, which
   is exactly what `/menu`, `/cart`, `/checkout`, `/stores` and the landing page
   already do. The item page declares `generateStaticParams` and
   `dynamicParams = false`, so the live answer arrives through the Suspense
   boundary the page already has rather than by a read at the top level of the
   page.

   Corrected during implementation, 2026-08-24. This section originally said
   the product pages are statically generated and that static generation is
   preserved. Neither is true, and neither was true when it was written:
   `app/layout.tsx` calls `await connection()` in the root layout, on purpose
   and with a comment explaining that the CSP nonce requires it, and because
   that layout wraps every route it stops prerendering everywhere. The route
   was already dynamic. What the Suspense placement actually buys is therefore
   narrower than claimed, and still worth having: the ordering read stays
   scoped to the fragment that needs it, streaming behind the fallback the page
   already renders, instead of blocking the whole page shell.
2. The remaining four screens get the same read the Workspace got: empty,
   loading, error, disabled and confirmation states, touch targets, and contrast.
   Findings are fixed as found; anything that turns out to need a business
   decision stops and is raised rather than guessed.

## 6. How this gets built

Implementation runs through the `ui-ux-pro-max` and `impeccable` skills rather
than as functional changes with default styling. Concretely that means every
screen this touches is judged on the checks the Workspace pass used: contrast
against the real ground it sits on, 44px touch targets, focus states, keyboard
order, `prefers-reduced-motion`, and behaviour at 375, 768, 1024 and 1440
pixels wide. The storefront's light amber ground has its own palette rules,
recorded in `Button.tsx`: brand orange measures 1.8:1 on amber and is
unreadable there, so the primary action on this ground is an ink fill. New
controls use the existing `Button` recipe and the existing tiles rather than
introducing a second visual language into a flow the customer is already
halfway through.

## 7. Error handling

- Every reorder failure is a skipped line with a reason, never a thrown error.
  A past order that restores nothing shows the notice and an unchanged cart.
- The Server Action returns a typed result. An unreadable order, a bad token, or
  an order belonging to somebody else returns "that order could not be read",
  and the button says so in place.
- Reorder is a read. It cannot place an order, cannot change one, and cannot
  charge anybody.

## 8. Testing

Unit, against `lib/cart/reorder.ts`, which is pure:

- a clean past order restores every line, with quantities preserved;
- a renamed item is skipped as `item`, not silently matched to a neighbour;
- a withdrawn size is skipped as `variation`;
- a withdrawn flavour on wings is skipped as `option`, via `selectionProblem`,
  rather than restored without one;
- a price that moved still restores, and carries the live price;
- matching is exact: "Salted Egg" does not match "Salted Eggs";
- a cart at `MAX_LINES` reports the overflow rather than dropping it silently.

Quick-add eligibility gets its own tests: one variation and no groups qualifies;
two variations does not; one variation with an optional group does not.

`npm run build` is part of the loop, per AGENTS.md, because the Server Action
boundary only fails there.

## 8b. Recorded and deliberately not fixed: the cart's 44px floor

Found by the design pass on 2026-08-24, raised with the owner, and left alone on purpose.

The cart line's quantity stepper measures 40x40px and its line-remove button 42x42px, both under
the 44px minimum interactive height this project states for itself in `DESIGN.md` ("everywhere")
and in the `Button` size table. Measured live on a populated cart, not inferred: every stepper
button reported `{width:40, height:40}`, and `Button`'s `icon` size is `size-[2.625rem]`, which is
42px.

Neither number is an accident. `QuantityStepper.tsx`'s doc comment records that the control exists
to reconcile an earlier drift between 40px and 44px boxes and settled on 40px for the cart-row
variant, and `Button.tsx`'s `icon` comment records that its 42px is chosen to equal the stepper's
40px plus a 1px border on each side. Two files, one coordinated decision, with the reasoning
written down.

Not fixed here for three reasons. It overturns that documented decision rather than correcting an
oversight. The fix to `Button`'s `icon` size reaches every icon button in the application, not only
this flow. And a separate Workspace UX branch is in flight against the same design system, so a
unilateral token change from this branch invites a collision.

It is a real gap and it is the most repeated control in the ordering flow, which is why it is
written down here rather than dropped. It still clears the WCAG 2.5.8 AA target minimum of 24px;
what it misses is this project's own stricter floor. Whoever picks it up should treat the stepper
and the remove button as one change, since the second is sized from the first, and re-check the
cart row at 320 to 375px afterwards.

## 8c. Recorded: Label in Name on the quick-add button

Introduced deliberately on 2026-08-24 while fixing a worse problem, and recorded here rather than
left for someone to find.

`QuickAddButton` carries a stable `aria-label` of "Add {item} to your cart" in every state, while
its visible label changes from "Add" to "Added" after a successful press. In that second state the
accessible name no longer contains the visible label text, which is a narrow miss against WCAG
2.5.3 Label in Name (Level A). A voice control user saying "click Added" would not match it.

The stable label was chosen to fix something worse. Previously the accessible name followed the
visible label into the past tense, so the control announced itself as "Added French Fries to your
cart" while still being a live button that would add another. That is a statement about a completed
action serving as the name of an action still available, which is more misleading than the naming
mismatch that replaced it.

Two ways out if this is ever worth revisiting, both design decisions rather than technical ones:
keep the visible label as "Add" permanently and let the check icon and the live region carry the
confirmation, which satisfies 2.5.3 cleanly, or word the visible and accessible labels so one
contains the other. The first is probably right. It was not taken here because changing the visible
confirmation for sighted users is a product decision, not a defect fix, and this pass was scoped to
approved findings.

## 9. Out of scope

- Any migration, including a slug-returning function for reorder.
- Favourites, saved orders, loyalty.
- A guest's order history being a single URL they can lose. Real, raised, and a
  separate piece of work needing an owner decision.
- Menu search. Quick-add addresses the same "I know what I want" case more
  directly on a 31-item menu; search earns its place on a longer one.
