# Ordering Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a returning customer rebuild a past order in one tap, let the two thirds of the menu with nothing to configure be added without opening a product page, and stop the product page telling every customer that checkout is shut.

**Architecture:** Reorder matches a past order's saved text snapshots against the live menu, because the database ids on those rows cannot be resolved to slugs from a customer session. A pure module does the matching and is unit tested; a Server Action reads the order and returns rebuilt lines; a client component writes them into the `localStorage` cart and navigates to `/cart`. Quick-add is gated on menu data shape, never a slug list. No migration, no new table.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Supabase (PostgREST + RPC), Tailwind v4, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-20-ordering-speed-design.md`

## Global Constraints

- **No migrations.** Migrations are frozen at 0050. Nothing in this plan adds, edits or applies one.
- **No em dashes** anywhere: not in code comments, commit messages, documentation, or shipped UI copy. Use commas, periods, or parentheses.
- **The client never computes a price that is charged.** `unitPriceCents` on a cart line is display only and is refreshed by `resolveCart`. Never send a price to the server.
- **Next.js 16, not from memory.** Before touching routing, caching, Server Actions or `after()`, read the relevant guide in `node_modules/next/dist/docs/`.
- **`"use server"` files may only export async functions.** Exporting a constant or a type from an actions file passes typecheck and unit tests, then fails `npm run build`.
- **`npm run build` is part of the test loop**, not just `tsc`. React Server Component boundary errors appear only there.
- **The tracking token is a bearer credential.** It never reaches a log line and never travels in a URL this code constructs.
- **Storefront ground is amber.** Brand orange measures 1.8:1 on it and is unreadable. On `tone="light"` the primary action is an ink fill. Use the existing `Button` recipe from `components/ui/Button.tsx`; do not write raw colour classes for controls.
- **Touch targets are 44px minimum.** `min-h-11` in this codebase.
- **Never nest a `<button>` inside an `<a>`.** It is invalid HTML and behaves unpredictably.
- Full verification command set, run before every commit that ends a task:
  `npm run typecheck && npm run lint && npx vitest run tests/unit && npm run build`

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/cart/reorder.ts` | Pure. Match past line snapshots to the live menu, produce `CartLine[]` plus a skip report. No React, no browser, no Supabase. |
| `lib/orders/past-lines.ts` | Server. Read a past order's lines into one neutral shape from either the signed-in table read or the guest tracking RPC. |
| `app/actions/reorder.ts` | Server Action. Short code (plus token for guests) in, rebuilt lines and skip report out. Writes nothing. |
| `components/order/ReorderButton.tsx` | Client. Calls the action, merges lines into the cart, stashes the report, navigates to `/cart`. |
| `lib/cart/reorder-report.ts` | Pure + browser. The `sessionStorage` key, write, and read-and-clear for the reorder report. |
| `components/cart/ReorderNotice.tsx` | Client. Reads the report once on mount and renders it above the cart. |
| `lib/menu/quick-add.ts` | Pure. Decide whether an item can be added without opening its page. |
| `components/menu/QuickAddButton.tsx` | Client. The add control that sits on a tile. |
| `components/menu/ProductTile.tsx` | Modified. Restructured to a stretched link so a sibling button is legal. |
| `app/(marketing)/menu/[category]/[item]/page.tsx` | Modified. Pass the live ordering answer to the configurator through the existing Suspense boundary. |
| `components/menu/ItemConfigurator.tsx` | Modified. Take `canOrder` and stop asserting checkout is shut. |

---

## Task 1: The product page stops saying checkout is shut

**Files:**
- Modify: `components/menu/ItemConfigurator.tsx`
- Modify: `app/(marketing)/menu/[category]/[item]/page.tsx`
- Test: `tests/unit/item-configurator-copy.test.ts` (create)

**Interfaces:**
- Consumes: `onlineOrderingOpen()` from `lib/checkout/payment-settings`, `getStoreSelection()` from `lib/branches/selection`. Both already used by `app/(marketing)/menu/page.tsx`.
- Produces: `ItemConfigurator` gains a required prop `canOrder: boolean`. Task 8 does not touch this component.

**Context the implementer needs.** `app/(marketing)/menu/page.tsx` already computes this exact answer:

```tsx
const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);
```

Both halves are required: a counter that can cook is worth nothing without a payment rail, and a rail with no live counter has nothing to sell.

The item page uses `generateStaticParams` with `dynamicParams = false`. The page already has a `<Suspense>` boundary around the configurator; the live answer is fetched inside a small async server component rendered within it, so the read stays scoped to the fragment that needs it instead of blocking the page shell.

Corrected 2026-08-24: this paragraph used to say "do not make the page dynamic" and "the static shell is preserved". The route is already dynamic and was before this task. `app/layout.tsx` calls `await connection()` in the root layout for the CSP nonce, which stops prerendering on every route in the app. The Suspense placement is still the right structure, for the narrower reason given above.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/item-configurator-copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { orderingCopy } from "@/lib/menu/ordering-copy";

describe("what the product page says under Add to cart", () => {
  it("does not tell a customer to phone when checkout works", () => {
    const copy = orderingCopy(true);
    expect(copy.canOrder).toBe(true);
    expect(copy.message).not.toMatch(/call the branch/i);
    expect(copy.message).not.toMatch(/opens once/i);
  });

  it("says so plainly when no order can be completed", () => {
    const copy = orderingCopy(false);
    expect(copy.canOrder).toBe(false);
    expect(copy.message).toMatch(/not open/i);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run tests/unit/item-configurator-copy.test.ts`
Expected: FAIL, cannot resolve `@/lib/menu/ordering-copy`.

- [ ] **Step 3: Create the copy module**

Create `lib/menu/ordering-copy.ts`:

```ts
/**
 * What the product screen says beneath its Add to cart button.
 *
 * Lifted out of the component so the sentence is a tested value rather than a
 * literal typed into JSX. The literal it replaces read "Checkout opens once
 * pickup times are published", unconditionally, on the one screen where a
 * customer commits to an order. /menu had the same bug and it was fixed there
 * with a comment recording why: the sentence was true on the day it was typed
 * and false in whichever environment did not match it.
 */
export type OrderingCopy = {
  canOrder: boolean;
  message: string;
};

export function orderingCopy(canOrder: boolean): OrderingCopy {
  return {
    canOrder,
    message: canOrder
      ? "Add what you want, then choose a pickup window at checkout."
      : "Online ordering is not open on this site yet, so call the counter you want to collect from.",
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run tests/unit/item-configurator-copy.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Give the configurator the prop**

In `components/menu/ItemConfigurator.tsx`, add `canOrder` to the props type and destructuring:

```tsx
export function ItemConfigurator({
  item,
  details,
  canOrder,
}: {
  item: MenuItem;
  details?: React.ReactNode;
  /** Whether an order can actually be completed on this deployment right now. */
  canOrder: boolean;
}) {
```

Add the import at the top of the file:

```tsx
import { orderingCopy } from "@/lib/menu/ordering-copy";
```

- [ ] **Step 6: Replace the hardcoded sentence**

In the same file, find the `aria-live="polite"` paragraph and replace the `confirmation === null` branch. The whole paragraph becomes:

```tsx
<p
  aria-live="polite"
  className="text-nybb-bone/65 mt-3 text-sm leading-relaxed"
>
  {confirmation === null ? (
    orderingCopy(canOrder).canOrder ? (
      orderingCopy(canOrder).message
    ) : (
      <>
        {orderingCopy(canOrder).message}{" "}
        <Link
          href="/contact"
          className="text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
        >
          Branch numbers
        </Link>
      </>
    )
  ) : confirmation.ok ? (
    <>
      <span className="text-nybb-bone">
        {confirmation.quantity > 1
          ? `${confirmation.quantity} added to your cart.`
          : "Added to your cart."}
      </span>{" "}
      <Link
        href="/cart"
        className="text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
      >
        View cart
      </Link>
    </>
  ) : (
    <span className="text-nybb-bone">
      Your cart is full. Remove something from it before adding more.
    </span>
  )}
</p>
```

- [ ] **Step 7: Fetch the answer on the item page**

In `app/(marketing)/menu/[category]/[item]/page.tsx`, add these imports:

```tsx
import { getStoreSelection } from "@/lib/branches/selection";
import { onlineOrderingOpen } from "@/lib/checkout/payment-settings";
```

Add this async server component at the bottom of the file:

```tsx
/**
 * The live ordering answer, resolved inside the page's existing Suspense
 * boundary, so the read stays scoped to the fragment that needs it.
 *
 * Reading the payment rails at the top level would block the whole page shell
 * on a request the rest of the page does not need, to render one sentence, so
 * the sentence waits here and streams in behind the fallback instead.
 */
async function ConfiguratorWithOrdering({
  item,
  details,
}: {
  item: MenuItem;
  details: React.ReactNode;
}) {
  const [selection, orderingOpen] = await Promise.all([
    getStoreSelection(),
    onlineOrderingOpen(),
  ]);
  // Both halves, the same test every other screen in this flow applies.
  const canOrder = orderingOpen && selection.stores.some((store) => store.orderable);

  return <ItemConfigurator item={item} details={details} canOrder={canOrder} />;
}
```

Add the `MenuItem` type import if it is not already present:

```tsx
import type { MenuItem } from "@/lib/menu/types";
```

- [ ] **Step 8: Render it inside the existing Suspense boundary**

In the same file, replace the existing `<ItemConfigurator ... />` usage inside `<Suspense>` with `<ConfiguratorWithOrdering ... />`, passing exactly the same `item` and `details`. Leave the `fallback` unchanged.

- [ ] **Step 9: Verify**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit && npm run build`
Expected: all pass.

This step used to require that `/menu/[category]/[item]` still be listed as static (`○`) in the build output. That check is unattainable and always was: the root layout's `connection()` call makes every route dynamic (`ƒ`). What to check instead is structural, and the build cannot tell you: the ordering read must live inside the Suspense child, not at the top level of the page component.

- [ ] **Step 10: Commit**

```bash
git add lib/menu/ordering-copy.ts tests/unit/item-configurator-copy.test.ts components/menu/ItemConfigurator.tsx "app/(marketing)/menu/[category]/[item]/page.tsx"
git commit -m "fix: stop the product page telling every customer that checkout is shut"
```

---

## Task 2: The pure reorder matcher

**Files:**
- Create: `lib/cart/reorder.ts`
- Test: `tests/unit/cart-reorder.test.ts`

**Interfaces:**
- Consumes: `CartLine` from `lib/cart/types`, `MenuCategory`/`MenuItem` from `lib/menu/types`, `selectionProblem`, `unitPriceCents`, `MIN_QUANTITY`, `MAX_QUANTITY` from `lib/menu/line-pricing`.
- Produces, relied on by Tasks 3, 4 and 5:
  - `type PastOrderLine = { name: string; variationLabel: string; quantity: number; options: { group: string; name: string }[] }`
  - `type SkipReason = "item" | "variation" | "option"`
  - `type SkippedLine = { name: string; variationLabel: string; reason: SkipReason }`
  - `type ReorderResult = { lines: CartLine[]; skipped: SkippedLine[] }`
  - `function rebuildCartLines(categories: MenuCategory[], past: PastOrderLine[]): ReorderResult`

**Context the implementer needs.** The four matching fields were verified against `place_order` (migration 0013) and `get_storefront_menu` (migration 0011):

| Order snapshot | Live menu field |
| --- | --- |
| `item_name_snapshot` | `MenuItem.name` |
| `variation_label_snapshot` | `MenuVariation.name` (the `label` column, not `short_label`) |
| `group_name_snapshot` | `MenuOptionGroup.name` |
| `name_snapshot` | `MenuOption.name` |

`selectionProblem` returns `null` early when the variation is missing, so the variation must be checked before relying on it.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/cart-reorder.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { rebuildCartLines, type PastOrderLine } from "@/lib/cart/reorder";
import type { MenuCategory } from "@/lib/menu/types";

const wings: MenuCategory = {
  slug: "chicken-wings",
  name: "Chicken Wings",
  blurb: "",
  items: [
    {
      slug: "chicken-wings",
      name: "Chicken Wings",
      categorySlug: "chicken-wings",
      featured: true,
      image: null,
      variations: [
        { slug: "half", name: "Half, 6 pieces", shortName: "HALF", priceCents: 25000 },
        { slug: "full", name: "Full, 10 pieces", shortName: "FULL", priceCents: 40000 },
      ],
      optionGroups: [
        {
          slug: "wing-flavour",
          name: "Wing Flavour",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { slug: "salted-egg", name: "Salted Egg", priceCents: 0, variationPriceCents: {} },
            { slug: "cheezy", name: "Cheezy", priceCents: 0, variationPriceCents: {} },
          ],
        },
      ],
    },
  ],
};

const fries: MenuCategory = {
  slug: "sides",
  name: "Sides",
  blurb: "",
  items: [
    {
      slug: "french-fries",
      name: "French Fries",
      categorySlug: "sides",
      featured: false,
      image: null,
      variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 8000 }],
      optionGroups: [],
    },
  ],
};

const menu = [wings, fries];

function pastWings(overrides: Partial<PastOrderLine> = {}): PastOrderLine {
  return {
    name: "Chicken Wings",
    variationLabel: "Half, 6 pieces",
    quantity: 2,
    options: [{ group: "Wing Flavour", name: "Salted Egg" }],
    ...overrides,
  };
}

describe("rebuilding a past order into cart lines", () => {
  it("restores a clean order with its quantities", () => {
    const result = rebuildCartLines(menu, [pastWings()]);
    expect(result.skipped).toEqual([]);
    expect(result.lines).toEqual([
      {
        itemSlug: "chicken-wings",
        variationSlug: "half",
        optionSlugs: { "wing-flavour": ["salted-egg"] },
        quantity: 2,
        unitPriceCents: 25000,
      },
    ]);
  });

  it("restores an item that has no options at all", () => {
    const result = rebuildCartLines(menu, [
      { name: "French Fries", variationLabel: "Regular", quantity: 1, options: [] },
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.lines[0]?.itemSlug).toBe("french-fries");
  });

  it("skips a renamed item rather than matching a neighbour", () => {
    const result = rebuildCartLines(menu, [pastWings({ name: "Chicken Wing" })]);
    expect(result.lines).toEqual([]);
    expect(result.skipped).toEqual([
      { name: "Chicken Wing", variationLabel: "Half, 6 pieces", reason: "item" },
    ]);
  });

  it("skips a size that is no longer sold", () => {
    const result = rebuildCartLines(menu, [pastWings({ variationLabel: "Bucket, 30 pieces" })]);
    expect(result.skipped[0]?.reason).toBe("variation");
  });

  it("skips a withdrawn flavour rather than restoring wings without one", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ options: [{ group: "Wing Flavour", name: "Honey Garlic" }] }),
    ]);
    expect(result.lines).toEqual([]);
    expect(result.skipped[0]?.reason).toBe("option");
  });

  it("matches exactly, so a near name is a miss and not a substitution", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ options: [{ group: "Wing Flavour", name: "Salted Eggs" }] }),
    ]);
    expect(result.skipped[0]?.reason).toBe("option");
  });

  it("ignores surrounding space and case, which are not menu changes", () => {
    const result = rebuildCartLines(menu, [
      pastWings({ name: "  chicken wings ", variationLabel: "HALF, 6 PIECES" }),
    ]);
    expect(result.skipped).toEqual([]);
    expect(result.lines[0]?.itemSlug).toBe("chicken-wings");
  });

  it("carries today's price, never the price that was paid", () => {
    const result = rebuildCartLines(menu, [pastWings()]);
    expect(result.lines[0]?.unitPriceCents).toBe(25000);
  });

  it("clamps a quantity above the line ceiling", () => {
    const result = rebuildCartLines(menu, [pastWings({ quantity: 999 })]);
    expect(result.lines[0]?.quantity).toBe(20);
  });

  it("restores what it can and reports the rest", () => {
    const result = rebuildCartLines(menu, [
      pastWings(),
      pastWings({ name: "Gone Forever" }),
      { name: "French Fries", variationLabel: "Regular", quantity: 1, options: [] },
    ]);
    expect(result.lines).toHaveLength(2);
    expect(result.skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/unit/cart-reorder.test.ts`
Expected: FAIL, cannot resolve `@/lib/cart/reorder`.

- [ ] **Step 3: Write the module**

Create `lib/cart/reorder.ts`:

```ts
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  selectionProblem,
  unitPriceCents,
} from "@/lib/menu/line-pricing";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";
import type { CartLine } from "./types";

/**
 * Turning a past order back into cart lines.
 *
 * WHY THIS MATCHES ON NAMES AND NOT ON IDS.
 * ================================================================
 * Order rows carry real foreign keys to menu_items, item_variations and
 * menu_options, and none of them are reachable from a customer session. The
 * menu tables are staff only under RLS, the storefront reads the menu through
 * the get_storefront_menu security definer function, and the menu shape that
 * reaches the browser carries slugs but no ids. A guest cannot read order_items
 * at all, because that policy requires orders.user_id = auth.uid().
 *
 * Closing any of those needs a new database function, and migrations are
 * frozen at 0050. The *_snapshot columns are on both paths today, so the
 * snapshots are what this matches.
 *
 * The cost is renames, and the cost is paid safely. A renamed item stops
 * matching and is reported as unavailable, which is a case this feature has to
 * handle anyway for withdrawn items. It never yields the wrong food, and that
 * is the only property worth protecting here: a fuzzy match across nine
 * similarly named wing flavours would sell somebody the wrong order.
 */

/** One line of a past order, in the shape both sources can produce. */
export type PastOrderLine = {
  /** `order_items.item_name_snapshot`. */
  name: string;
  /** `order_items.variation_label_snapshot`. */
  variationLabel: string;
  quantity: number;
  /** `order_item_options`, group name then option name. */
  options: { group: string; name: string }[];
};

export type SkipReason =
  /** The item is not on the menu under that name. */
  | "item"
  /** The item is, but not in that size. */
  | "variation"
  /** An option is gone, or what is left no longer satisfies a required group. */
  | "option";

export type SkippedLine = {
  name: string;
  variationLabel: string;
  reason: SkipReason;
};

export type ReorderResult = {
  lines: CartLine[];
  skipped: SkippedLine[];
};

/** Trimmed and case folded. Neither is a menu change. */
function same(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
}

function findItem(categories: MenuCategory[], name: string): MenuItem | null {
  for (const category of categories) {
    for (const item of category.items) {
      if (same(item.name, name)) return item;
    }
  }
  return null;
}

function clampQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return MIN_QUANTITY;
  return Math.min(Math.max(Math.trunc(quantity), MIN_QUANTITY), MAX_QUANTITY);
}

export function rebuildCartLines(
  categories: MenuCategory[],
  past: PastOrderLine[],
): ReorderResult {
  const lines: CartLine[] = [];
  const skipped: SkippedLine[] = [];

  for (const line of past) {
    const skip = (reason: SkipReason) => {
      skipped.push({ name: line.name, variationLabel: line.variationLabel, reason });
    };

    const item = findItem(categories, line.name);
    if (!item) {
      skip("item");
      continue;
    }

    const variation = item.variations.find((candidate) =>
      same(candidate.name, line.variationLabel),
    );
    if (!variation) {
      skip("variation");
      continue;
    }

    const optionSlugs: Record<string, string[]> = {};
    let optionMissing = false;
    for (const saved of line.options) {
      const group = item.optionGroups.find((candidate) => same(candidate.name, saved.group));
      const option = group?.options.find((candidate) => same(candidate.name, saved.name));
      if (!group || !option) {
        optionMissing = true;
        break;
      }
      optionSlugs[group.slug] = [...(optionSlugs[group.slug] ?? []), option.slug];
    }
    if (optionMissing) {
      skip("option");
      continue;
    }

    // The variation is known good by here, which matters: selectionProblem
    // returns null early when it cannot find one, so asking it first would
    // report a missing size as a valid selection.
    const selection = { variationSlug: variation.slug, optionSlugs };
    if (selectionProblem(item, selection) !== null) {
      // A required group is now unsatisfied. This is the wings case: the
      // flavour that was ordered has left the menu, and wings without a
      // flavour are not a thing anybody can collect.
      skip("option");
      continue;
    }

    lines.push({
      itemSlug: item.slug,
      variationSlug: variation.slug,
      optionSlugs,
      quantity: clampQuantity(line.quantity),
      // Today's price, from today's menu. Display only either way: resolveCart
      // refreshes it, and place_order is the only thing that prices an order.
      unitPriceCents: unitPriceCents(item, selection),
    });
  }

  return { lines, skipped };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/cart-reorder.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit`

```bash
git add lib/cart/reorder.ts tests/unit/cart-reorder.test.ts
git commit -m "feat: rebuild a past order into cart lines against the live menu"
```

---

## Task 3: Reading a past order's lines

**Files:**
- Create: `lib/orders/past-lines.ts`

**Interfaces:**
- Consumes: `PastOrderLine` from `lib/cart/reorder`.
- Produces, relied on by Task 4:
  - `function pastLinesForSignedInOrder(shortCode: string): Promise<PastOrderLine[] | null>`
  - `function pastLinesForTrackedOrder(shortCode: string, token: string): Promise<PastOrderLine[] | null>`
  - Both return `null` when the order cannot be read, and `[]` only when it genuinely has no lines.

**Context the implementer needs.** Two sources, one shape.

Signed in: RLS policy `customer reads own order items` permits a `select` on `order_items` and `order_item_options` where the parent order's `user_id` matches `auth.uid()`. Use the storefront session client the same way `getAccountOrders` in `lib/auth/session.ts` does. Read `lib/auth/session.ts` first and follow its `getStorefrontSession()` pattern exactly.

Guest: `getOrderByTracking` in `lib/orders/reader.ts` already returns the order with an `items` array whose entries carry `name`, `variationLabel`, `quantity` and `options: { group, name }[]`. That is already `PastOrderLine`. Read `lib/orders/reader.ts` and reuse its return type rather than re-deriving it.

- [ ] **Step 1: Read the two existing readers**

Run: `sed -n '1,120p' lib/auth/session.ts` and `sed -n '1,80p' lib/orders/reader.ts`

Note the exact name of the session helper, the exact shape `getOrderByTracking` returns, and whether its items already match `PastOrderLine`. The code below assumes `getStorefrontSession()` and `getOrderByTracking(code, token)`; correct the names if they differ.

- [ ] **Step 2: Write the module**

Create `lib/orders/past-lines.ts`:

```ts
import "server-only";

import { z } from "zod";
import type { PastOrderLine } from "@/lib/cart/reorder";
import { getStorefrontSession } from "@/lib/auth/session";
import { getOrderByTracking } from "@/lib/orders/reader";

/**
 * A past order's lines, in the one shape `rebuildCartLines` takes.
 *
 * Two sources, because the two kinds of customer reach their own order by
 * different routes and neither route can serve the other. A signed-in customer
 * reads the rows directly, which RLS permits for their own orders. A guest has
 * no readable rows at all and reaches the order through the tracking token,
 * which is precisely why reorder matches on names: the tracking function
 * returns snapshots and deliberately refuses to join back to the menu.
 */

const optionRowSchema = z.object({
  group_name_snapshot: z.string(),
  name_snapshot: z.string(),
});

const lineRowSchema = z.object({
  item_name_snapshot: z.string(),
  variation_label_snapshot: z.string(),
  qty: z.number().int().positive(),
  order_item_options: z.array(optionRowSchema).nullable(),
});

const lineRowsSchema = z.array(lineRowSchema);

export async function pastLinesForSignedInOrder(
  shortCode: string,
): Promise<PastOrderLine[] | null> {
  const session = await getStorefrontSession();
  if (!session) return null;

  const { data, error } = await session.supabase
    .from("order_items")
    .select(
      "item_name_snapshot, variation_label_snapshot, qty, orders!inner(short_code, user_id), order_item_options(group_name_snapshot, name_snapshot)",
    )
    .eq("orders.short_code", shortCode)
    .eq("orders.user_id", session.user.id);

  if (error) {
    console.error("[reorder] past line read failed:", error.message);
    return null;
  }

  const parsed = lineRowsSchema.safeParse(data);
  if (!parsed.success) {
    console.error("[reorder] past lines had an unreadable shape", parsed.error.issues);
    return null;
  }

  return parsed.data.map((row) => ({
    name: row.item_name_snapshot,
    variationLabel: row.variation_label_snapshot,
    quantity: row.qty,
    options: (row.order_item_options ?? []).map((option) => ({
      group: option.group_name_snapshot,
      name: option.name_snapshot,
    })),
  }));
}

export async function pastLinesForTrackedOrder(
  shortCode: string,
  token: string,
): Promise<PastOrderLine[] | null> {
  // The token is a bearer credential. It is passed straight through and never
  // logged, here or anywhere this call fails.
  const lookup = await getOrderByTracking(shortCode, token);
  if (!lookup || !lookup.order) return null;

  return lookup.order.items.map((item) => ({
    name: item.name,
    variationLabel: item.variationLabel,
    quantity: item.quantity,
    options: item.options.map((option) => ({ group: option.group, name: option.name })),
  }));
}
```

- [ ] **Step 3: Reconcile with the real reader shapes**

Run: `npm run typecheck`

`getOrderByTracking`'s real return shape will almost certainly differ from the guess above (it may return `{ order, reason }`, or the order directly, and `items` may be nested). Fix the mapping to match what the file actually returns. Do not change `lib/orders/reader.ts`. If its item options do not carry a `group`, stop and report it, because reorder cannot match options without one.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add lib/orders/past-lines.ts
git commit -m "feat: read a past order's lines for both signed-in and guest customers"
```

---

## Task 4: The reorder Server Action

**Files:**
- Create: `app/actions/reorder.ts`

**Interfaces:**
- Consumes: `rebuildCartLines`, `ReorderResult` from `lib/cart/reorder`; `pastLinesForSignedInOrder`, `pastLinesForTrackedOrder` from `lib/orders/past-lines`; `getStorefrontMenu` from `lib/menu`.
- Produces, relied on by Task 5:
  - `async function reorder(input: { shortCode: string; token?: string }): Promise<ReorderActionResult>`
  - `type ReorderActionResult = { ok: true; lines: CartLine[]; skipped: SkippedLine[] } | { ok: false; error: string }`

**Context the implementer needs.** A `"use server"` file may only export async functions. `ReorderActionResult` must therefore be declared in a separate non-action file. Put it in `lib/cart/reorder.ts` alongside the other reorder types, and import it here.

- [ ] **Step 1: Add the result type to the pure module**

Append to `lib/cart/reorder.ts`:

```ts
/**
 * What the reorder Server Action hands back.
 *
 * Declared here rather than in the actions file because a "use server" module
 * may export nothing but async functions. A type exported from one passes
 * typecheck and unit tests, then fails npm run build.
 */
export type ReorderActionResult =
  | { ok: true; lines: CartLine[]; skipped: SkippedLine[] }
  | { ok: false; error: string };
```

- [ ] **Step 2: Write the action**

Create `app/actions/reorder.ts`:

```ts
"use server";

import { z } from "zod";
import { rebuildCartLines, type ReorderActionResult } from "@/lib/cart/reorder";
import { getStorefrontMenu } from "@/lib/menu";
import {
  pastLinesForSignedInOrder,
  pastLinesForTrackedOrder,
} from "@/lib/orders/past-lines";

/**
 * Rebuild a past order into cart lines.
 *
 * A read, start to finish. It places no order, changes no order, charges
 * nobody, and does not touch the cart: the cart lives in localStorage, so only
 * the browser may write it. This hands back lines and a report, and the client
 * decides what to do with them.
 */

const inputSchema = z.object({
  shortCode: z.string().min(1).max(32),
  token: z.string().min(1).max(256).optional(),
});

export async function reorder(input: {
  shortCode: string;
  token?: string;
}): Promise<ReorderActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That order could not be read." };
  }

  const { shortCode, token } = parsed.data;

  // Signed in first. A signed-in customer holding their own tracking link
  // should still be answered as themselves rather than through the token.
  const past = token
    ? ((await pastLinesForSignedInOrder(shortCode)) ??
      (await pastLinesForTrackedOrder(shortCode, token)))
    : await pastLinesForSignedInOrder(shortCode);

  if (!past) {
    // Deliberately one message for "no such order", "not yours" and "the read
    // failed". Telling a caller which of those it was is how a short code
    // becomes something worth guessing at.
    return { ok: false, error: "That order could not be read." };
  }
  if (past.length === 0) {
    return { ok: false, error: "That order has nothing in it to bring back." };
  }

  const { categories } = await getStorefrontMenu();
  const { lines, skipped } = rebuildCartLines(categories, past);

  return { ok: true, lines, skipped };
}
```

- [ ] **Step 3: Verify the boundary**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all pass. The build is the step that matters here: it is the only one that rejects a non-async export from a `"use server"` file.

- [ ] **Step 4: Commit**

```bash
git add app/actions/reorder.ts lib/cart/reorder.ts
git commit -m "feat: add the reorder server action"
```

---

## Task 5: The reorder report, stored and read

**Files:**
- Create: `lib/cart/reorder-report.ts`
- Test: `tests/unit/cart-reorder-report.test.ts`

**Interfaces:**
- Consumes: `SkippedLine` from `lib/cart/reorder`.
- Produces, relied on by Tasks 6 and 7:
  - `const REORDER_REPORT_KEY: string`
  - `type ReorderReport = { restored: number; skipped: SkippedLine[] }`
  - `function stashReorderReport(report: ReorderReport, storage?: Storage): void`
  - `function takeReorderReport(storage?: Storage): ReorderReport | null` (reads once, then clears)
  - `function describeSkip(skipped: SkippedLine): string`

**Context the implementer needs.** `sessionStorage`, not a query parameter: the report is a variable-length list, it is meaningless to anyone the URL is shared with, and spec section 22 forbids order detail in URLs. The storage argument exists so the module is testable without a browser.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/cart-reorder-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  describeSkip,
  stashReorderReport,
  takeReorderReport,
} from "@/lib/cart/reorder-report";

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

describe("carrying the reorder report to the cart", () => {
  it("hands the report back once and then forgets it", () => {
    const storage = fakeStorage();
    stashReorderReport({ restored: 2, skipped: [] }, storage);

    expect(takeReorderReport(storage)).toEqual({ restored: 2, skipped: [] });
    // A report that survived a refresh would explain a cart the customer has
    // since edited.
    expect(takeReorderReport(storage)).toBeNull();
  });

  it("returns null when nothing was stashed", () => {
    expect(takeReorderReport(fakeStorage())).toBeNull();
  });

  it("survives unreadable stored content without throwing", () => {
    const storage = fakeStorage();
    storage.setItem("nybb.reorder-report", "not json");
    expect(takeReorderReport(storage)).toBeNull();
  });

  it("says what happened to a skipped line in words a customer can act on", () => {
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "item" }))
      .toBe("Chicken Wings is not on the menu any more.");
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "variation" }))
      .toBe("Chicken Wings is no longer sold in Half, 6 pieces.");
    expect(describeSkip({ name: "Chicken Wings", variationLabel: "Half, 6 pieces", reason: "option" }))
      .toBe("Chicken Wings cannot be rebuilt because one of its choices has changed.");
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/unit/cart-reorder-report.test.ts`
Expected: FAIL, cannot resolve `@/lib/cart/reorder-report`.

- [ ] **Step 3: Write the module**

Create `lib/cart/reorder-report.ts`:

```ts
import type { SkippedLine } from "./reorder";

/**
 * What the cart screen says about the reorder that just filled it.
 *
 * Read once and cleared, because it explains one arrival. A report that
 * survived a refresh would be describing a cart the customer has since edited,
 * which is worse than saying nothing.
 */

export const REORDER_REPORT_KEY = "nybb.reorder-report";

export type ReorderReport = {
  restored: number;
  skipped: SkippedLine[];
};

function session(storage?: Storage): Storage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    // Safari in private mode, and any browser with storage disabled. The
    // reorder still worked; only its explanation is lost.
    return null;
  }
}

export function stashReorderReport(report: ReorderReport, storage?: Storage): void {
  const store = session(storage);
  if (!store) return;
  try {
    store.setItem(REORDER_REPORT_KEY, JSON.stringify(report));
  } catch {
    // Quota, or a disabled store. Not worth failing a reorder over.
  }
}

export function takeReorderReport(storage?: Storage): ReorderReport | null {
  const store = session(storage);
  if (!store) return null;

  const raw = store.getItem(REORDER_REPORT_KEY);
  if (raw === null) return null;
  store.removeItem(REORDER_REPORT_KEY);

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as ReorderReport).restored !== "number" ||
      !Array.isArray((parsed as ReorderReport).skipped)
    ) {
      return null;
    }
    return parsed as ReorderReport;
  } catch {
    return null;
  }
}

/** One skipped line, in words rather than in a reason code. */
export function describeSkip(skipped: SkippedLine): string {
  switch (skipped.reason) {
    case "item":
      return `${skipped.name} is not on the menu any more.`;
    case "variation":
      return `${skipped.name} is no longer sold in ${skipped.variationLabel}.`;
    case "option":
      return `${skipped.name} cannot be rebuilt because one of its choices has changed.`;
  }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/cart-reorder-report.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit`

```bash
git add lib/cart/reorder-report.ts tests/unit/cart-reorder-report.test.ts
git commit -m "feat: carry the reorder report to the cart screen"
```

---

## Task 6: The reorder button, wired into both screens

**Files:**
- Create: `components/order/ReorderButton.tsx`
- Modify: `app/(marketing)/account/page.tsx`
- Modify: `app/(marketing)/order/[code]/page.tsx`

**Interfaces:**
- Consumes: `reorder` from `app/actions/reorder`; `addToCart` from `lib/cart/store`; `stashReorderReport` from `lib/cart/reorder-report`.
- Produces: `<ReorderButton shortCode={string} token={string | undefined} label={string} tone="light" | "dark" />`

**Context the implementer needs.** The design system lives in `components/ui/Button.tsx`. Read its header comment before writing any control. On the amber storefront ground use `tone="light"`; inside a charcoal panel use `tone="dark"`. Never write raw colour classes for a button.

`addToCart` returns `{ ok: boolean }` and merges by line identity. A refusal means the cart hit `MAX_LINES`.

- [ ] **Step 1: Write the component**

Create `components/order/ReorderButton.tsx`:

```tsx
"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reorder } from "@/app/actions/reorder";
import { Button } from "@/components/ui/Button";
import { stashReorderReport } from "@/lib/cart/reorder-report";
import { addToCart } from "@/lib/cart/store";
import type { SkippedLine } from "@/lib/cart/reorder";

/**
 * "Order this again".
 *
 * The action is a read and hands back lines; this writes them, because the
 * cart lives in localStorage and only the browser may touch it. It merges
 * rather than replacing: the cart is the one place in this flow holding work
 * the customer did on purpose, and silently throwing it away to make room for
 * history is a worse failure than adding to it.
 *
 * It always lands on /cart. Reorder never places an order and never skips the
 * review, because a menu that has moved under a saved order is exactly the
 * situation a customer needs to see before paying.
 */
export function ReorderButton({
  shortCode,
  token,
  label = "Order this again",
  tone = "light",
}: {
  shortCode: string;
  token?: string;
  label?: string;
  tone?: "light" | "dark";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const result = await reorder({ shortCode, token });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      let restored = 0;
      const skipped: SkippedLine[] = [...result.skipped];
      for (const line of result.lines) {
        if (addToCart(line).ok) {
          restored += 1;
        } else {
          // The cart is full. Reported like any other line that could not come
          // back, rather than disappearing.
          skipped.push({
            name: line.itemSlug,
            variationLabel: line.variationSlug,
            reason: "item",
          });
        }
      }

      stashReorderReport({ restored, skipped });
      router.push("/cart");
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" tone={tone} variant="secondary" onClick={run} disabled={pending}>
        {pending ? (
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <RotateCcw aria-hidden className="size-4" />
        )}
        {pending ? "Bringing it back" : label}
        <span className="sr-only"> (order {shortCode})</span>
      </Button>
      {error ? (
        <p role="alert" className="text-nybb-ink/75 max-w-64 text-xs leading-snug">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Add it to the account page**

In `app/(marketing)/account/page.tsx`, import the component:

```tsx
import { ReorderButton } from "@/components/order/ReorderButton";
```

The past orders are currently rendered as a `<Link>` wrapping the whole row. A button cannot go inside that link. Change each `<li>` to hold the link and the button as siblings:

```tsx
<li key={order.shortCode} className="flex flex-wrap items-center justify-between gap-3 py-1">
  <Link
    href={`/order/${encodeURIComponent(order.shortCode)}`}
    className="hover:bg-nybb-ink/5 focus-visible:bg-nybb-ink/5 grid min-h-20 flex-1 grid-cols-[1fr_auto] items-center gap-4 rounded-md px-3 py-4 transition-colors sm:grid-cols-[9rem_1fr_auto]"
  >
    <span className="font-mono-tabular text-sm font-semibold">{order.shortCode}</span>
    <span className="text-nybb-ink/60 col-start-1 text-sm sm:col-start-2">
      {orderDate.format(new Date(order.placedAt))}
    </span>
    <span className="row-span-2 text-right sm:row-span-1">
      <span className="font-display block text-sm">{statusLabel[order.status]}</span>
      <span className="font-mono-tabular text-nybb-ink/60 mt-1 block text-xs">
        {formatPeso(order.totalCents)}
      </span>
    </span>
  </Link>
  <ReorderButton shortCode={order.shortCode} tone="light" />
</li>
```

- [ ] **Step 3: Add it to the tracking page**

In `app/(marketing)/order/[code]/page.tsx`, import the component. The page already reads `const token = query[TRACKING_TOKEN_PARAM]`. Render the button only for an order in a terminal state, so it does not sit beside an order still being cooked:

```tsx
{TERMINAL_STATUSES.includes(order.status) ? (
  <div className="mt-8">
    <ReorderButton
      shortCode={order.shortCode}
      token={typeof token === "string" ? token : undefined}
      tone="light"
    />
  </div>
) : null}
```

Import `TERMINAL_STATUSES` from `lib/orders/status`. Run `grep -n "TERMINAL_STATUSES" lib/orders/status.ts` first and use whatever it actually exports; if it exports a helper such as `isTerminal(status)` instead, use that.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 5: Commit**

```bash
git add components/order/ReorderButton.tsx "app/(marketing)/account/page.tsx" "app/(marketing)/order/[code]/page.tsx"
git commit -m "feat: let a customer bring a past order back into the cart"
```

---

## Task 7: The cart explains what came back

**Files:**
- Create: `components/cart/ReorderNotice.tsx`
- Modify: `app/(marketing)/cart/page.tsx`

**Interfaces:**
- Consumes: `takeReorderReport`, `describeSkip` from `lib/cart/reorder-report`.
- Produces: `<ReorderNotice />`, self-contained, renders nothing when there is no report.

**Context the implementer needs.** This reads `sessionStorage`, so it must be a client component and must not read during render on the server. Reading in an effect is correct here: it is a browser store being pulled into React, which is exactly what effects are for.

Corrected 2026-08-24, during implementation: this paragraph used to claim that the `react-hooks/set-state-in-effect` lint rule "permits it because the value is not derivable from props". It does not. The rule rejects a bare `setReport(...)` in an effect body regardless of where the value comes from. The codebase already has the pattern that satisfies it, in `HeroVideo.tsx` and `StaffPushOptIn.tsx`: wrap the call in a local function and invoke that. Follow those rather than the claim this plan originally made.

Prices are not mentioned. `resolveCart` already marks a repriced line on this screen, and a second mechanism saying the same thing in other words is how the two drift apart.

- [ ] **Step 1: Write the component**

Create `components/cart/ReorderNotice.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import {
  describeSkip,
  takeReorderReport,
  type ReorderReport,
} from "@/lib/cart/reorder-report";

/**
 * What happened to the order that was just brought back.
 *
 * Read once from sessionStorage and cleared, so it explains this arrival and
 * not a cart the customer has since edited. Renders nothing at all when the
 * customer got here any other way, which is most of the time.
 */
export function ReorderNotice() {
  const [report, setReport] = useState<ReorderReport | null>(null);

  useEffect(() => {
    // A browser store being pulled into React on mount, which cannot be
    // derived from props and must not run during render.
    setReport(takeReorderReport());
  }, []);

  if (!report) return null;

  const restoredLabel =
    report.restored === 0
      ? "Nothing from that order could be brought back."
      : report.restored === 1
        ? "One line from that order is back in your cart."
        : `${report.restored} lines from that order are back in your cart.`;

  return (
    <section
      role="status"
      aria-label="Reorder result"
      className="border-nybb-ink/30 bg-nybb-ink/5 mb-6 rounded-md border p-4 sm:p-5"
    >
      <p className="text-sm leading-relaxed font-medium">{restoredLabel}</p>
      {report.skipped.length > 0 ? (
        <>
          <p className="text-nybb-ink/75 mt-2 text-sm leading-relaxed">
            The menu has changed since, so these could not come back:
          </p>
          <ul className="text-nybb-ink/75 mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {report.skipped.map((skipped, index) => (
              <li key={`${skipped.name}-${skipped.variationLabel}-${index}`}>
                {describeSkip(skipped)}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Render it on the cart page**

In `app/(marketing)/cart/page.tsx`, import the component and render it immediately above `<CartView ... />`, inside the same container:

```tsx
import { ReorderNotice } from "@/components/cart/ReorderNotice";
```

```tsx
<ReorderNotice />
<CartView ... />
```

Leave every existing `CartView` prop exactly as it is.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm run build`

- [ ] **Step 4: Commit**

```bash
git add components/cart/ReorderNotice.tsx "app/(marketing)/cart/page.tsx"
git commit -m "feat: tell the customer what a reorder could and could not bring back"
```

---

## Task 8: Quick-add eligibility

**Files:**
- Create: `lib/menu/quick-add.ts`
- Test: `tests/unit/menu-quick-add.test.ts`

**Interfaces:**
- Consumes: `MenuItem` from `lib/menu/types`.
- Produces, relied on by Task 9:
  - `function canQuickAdd(item: MenuItem): boolean`
  - `function quickAddLine(item: MenuItem): CartLine | null`

**Context the implementer needs.** 21 of 31 seeded items have one variation and no option groups. The test is on the data and never on a list of slugs: the menu becomes owner-editable in Phase 4, so an item that grows a second size has to stop being quick-addable the day it does, without a code change.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/menu-quick-add.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canQuickAdd, quickAddLine } from "@/lib/menu/quick-add";
import type { MenuItem } from "@/lib/menu/types";

function item(overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    slug: "french-fries",
    name: "French Fries",
    categorySlug: "sides",
    featured: false,
    image: null,
    variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 8000 }],
    optionGroups: [],
    ...overrides,
  };
}

describe("which items can be added without opening their page", () => {
  it("allows one size and no choices", () => {
    expect(canQuickAdd(item())).toBe(true);
  });

  it("refuses an item with a size to pick", () => {
    expect(
      canQuickAdd(
        item({
          variations: [
            { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 15600 },
            { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 15900 },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("refuses an item with any option group, even an optional one", () => {
    // An optional group is still a decision worth showing. Quietly adding the
    // bare item is how somebody gets wings with no heat they meant to order.
    expect(
      canQuickAdd(
        item({
          optionGroups: [
            { slug: "level-of-hotness", name: "Level of Hotness", minSelect: 0, maxSelect: 1, options: [] },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("refuses an item with no variation at all", () => {
    expect(canQuickAdd(item({ variations: [] }))).toBe(false);
  });

  it("builds the line the tile would add", () => {
    expect(quickAddLine(item())).toEqual({
      itemSlug: "french-fries",
      variationSlug: "regular",
      optionSlugs: {},
      quantity: 1,
      unitPriceCents: 8000,
    });
  });

  it("builds nothing for an item that is not eligible", () => {
    expect(quickAddLine(item({ variations: [] }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run tests/unit/menu-quick-add.test.ts`
Expected: FAIL, cannot resolve `@/lib/menu/quick-add`.

- [ ] **Step 3: Write the module**

Create `lib/menu/quick-add.ts`:

```ts
import { MIN_QUANTITY } from "@/lib/menu/line-pricing";
import type { CartLine } from "@/lib/cart/types";
import type { MenuItem } from "./types";

/**
 * Whether an item can go into the cart without opening its own page.
 *
 * Twenty-one of the thirty-one seeded items have one size and no options, so
 * for two thirds of the menu the product page is a detour: open it, look at
 * it, press one button.
 *
 * The test is on the shape of the data and never on a list of slugs. The menu
 * is owner-editable from Phase 4, so an item that grows a second size has to
 * stop being quick-addable the day it does rather than the day somebody
 * remembers to edit this file. It is the same rule ItemConfigurator uses to
 * decide its own layout.
 *
 * An optional group counts as a choice. Quietly adding wings with no heat
 * because heat was not compulsory is a wrong order arriving at a counter.
 */
export function canQuickAdd(item: MenuItem): boolean {
  return item.variations.length === 1 && item.optionGroups.length === 0;
}

export function quickAddLine(item: MenuItem): CartLine | null {
  if (!canQuickAdd(item)) return null;
  const variation = item.variations[0];
  if (!variation) return null;

  return {
    itemSlug: item.slug,
    variationSlug: variation.slug,
    optionSlugs: {},
    quantity: MIN_QUANTITY,
    // Display only, refreshed by resolveCart. With no options this is simply
    // the variation price, so unitPriceCents is not needed here.
    unitPriceCents: variation.priceCents,
  };
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run tests/unit/menu-quick-add.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit`

```bash
git add lib/menu/quick-add.ts tests/unit/menu-quick-add.test.ts
git commit -m "feat: decide which menu items can skip their product page"
```

---

## Task 9: The quick-add control on the tile

**Files:**
- Create: `components/menu/QuickAddButton.tsx`
- Modify: `components/menu/ProductTile.tsx`

**Interfaces:**
- Consumes: `canQuickAdd`, `quickAddLine` from `lib/menu/quick-add`; `addToCart` from `lib/cart/store`.
- Produces: `<QuickAddButton item={MenuItem} />`, renders nothing when the item is not eligible.

**Context the implementer needs, and the trap in this task.** `ProductTile` currently wraps the entire tile in a `<Link>`. A `<button>` inside an `<a>` is invalid HTML and behaves unpredictably across browsers. The tile must be restructured to the stretched-link pattern before the button can exist:

- the `<article>` becomes `relative`;
- the `<Link>` keeps its content but gains an `absolute inset-0` overlay via a pseudo-element, so the whole tile stays clickable;
- the button becomes a **sibling** of the link, positioned above it with `relative z-10`.

Tailwind has no built-in stretched-link utility here, so use an explicit overlay span inside the link.

- [ ] **Step 1: Write the button**

Create `components/menu/QuickAddButton.tsx`:

```tsx
"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
import { canQuickAdd, quickAddLine } from "@/lib/menu/quick-add";
import { addToCart } from "@/lib/cart/store";
import type { MenuItem } from "@/lib/menu/types";

/**
 * Add straight from the menu board.
 *
 * Only for items with nothing to decide. Anything with a size or an option
 * still goes to its own page, because there is a real choice on that screen.
 *
 * Confirmation follows the pattern ItemConfigurator already uses: a live region
 * tied to what was added, not a toast on a timer. It resets on the next add so
 * a second press is not answered by a message about the first.
 */
export function QuickAddButton({ item }: { item: MenuItem }) {
  const [state, setState] = useState<"idle" | "added" | "full">("idle");

  if (!canQuickAdd(item)) return null;

  function add() {
    const line = quickAddLine(item);
    if (!line) return;
    setState(addToCart(line).ok ? "added" : "full");
  }

  return (
    <div className="relative z-10">
      <button
        type="button"
        onClick={add}
        // 44px, and its own stacking context above the stretched link beneath
        // it, so the tap that lands here does not also follow the tile.
        className="bg-nybb-bone/10 text-nybb-bone hover:bg-nybb-orange hover:text-nybb-ink focus-visible:bg-nybb-orange focus-visible:text-nybb-ink focus-visible:outline-nybb-bone inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {state === "added" ? (
          <Check aria-hidden className="size-4" />
        ) : (
          <Plus aria-hidden className="size-4" />
        )}
        {state === "added" ? "Added" : "Add"}
        <span className="sr-only"> {item.name} to your cart</span>
      </button>
      <span aria-live="polite" className="sr-only">
        {state === "added"
          ? `${item.name} added to your cart.`
          : state === "full"
            ? "Your cart is full. Remove something before adding more."
            : ""}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Restructure the tile**

In `components/menu/ProductTile.tsx`, add the import:

```tsx
import { QuickAddButton } from "./QuickAddButton";
```

Change the `<article>` to be positioned, and add the overlay span inside the link plus the button as a sibling. The `<article>` opening tag becomes:

```tsx
<article className={cn("group relative h-full", className)}>
```

Inside the `<Link>`, immediately before its closing tag, add the overlay:

```tsx
{/* The stretched link. The whole tile stays the target, while leaving room
    for a real sibling button that a nested <button> could never be. */}
<span aria-hidden className="absolute inset-0" />
```

After the `</Link>`, add:

```tsx
{/* Sibling, never a child. A button inside an anchor is invalid HTML and
    every browser guesses differently about which one a tap meant. */}
<div className="absolute right-2 bottom-2 sm:right-3 sm:bottom-3">
  <QuickAddButton item={item} />
</div>
```

- [ ] **Step 3: Stop the price colliding with the button**

Still in `ProductTile.tsx`, the price sits at the bottom of the plate and the button now overlaps that corner. Give the price room by adding right padding to its paragraph:

```tsx
<p className="font-mono-tabular text-nybb-orange mt-auto pt-2 pr-16 text-sm">
  {formatPesoRange(fromCents, toCents)}
</p>
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit && npm run build`

- [ ] **Step 5: Check it in the browser**

Start the preview with `preview_start` and open `/menu`. Confirm all of:

- the Add button appears on French Fries and not on Chicken Wings;
- tapping Add does not navigate to the product page;
- tapping anywhere else on the tile does navigate;
- the cart count in the header goes up;
- at 375px the button does not sit on top of the price;
- keyboard Tab reaches the tile link and the Add button as two separate stops.

Fix anything that fails before committing.

- [ ] **Step 6: Commit**

```bash
git add components/menu/QuickAddButton.tsx components/menu/ProductTile.tsx
git commit -m "feat: add straight from the menu board for items with nothing to choose"
```

---

## Task 10: The design and accessibility pass

**Files:**
- Modify: whichever of the four ordering screens the findings land in.

**Context the implementer needs.** This is the pass the Workspace got, applied to `/menu`, `/menu/[category]/[item]`, `/cart` and `/checkout`, plus the two screens this plan touched. It is a review task, not a redesign: preserve existing behaviour and the existing design system.

- [ ] **Step 1: Load the design skills**

Invoke the `ui-ux-pro-max` skill and the `impeccable` skill. Use them to guide the review below rather than making purely functional changes.

- [ ] **Step 2: Walk each screen against this checklist**

For `/menu`, `/menu/[category]/[item]`, `/cart`, `/checkout`, `/account` and `/order/[code]`:

- text contrast against the ground it actually sits on, 4.5:1 minimum for body text. On the amber storefront ground `nybb-ink` at 75% and above passes; below that it does not. On charcoal panels the floor is `nybb-bone/50`.
- every interactive control at least 44px in both directions;
- a visible focus ring on every control, reachable in an order matching the visual one;
- empty, loading, error, success, disabled and confirmation states all present and worded plainly;
- no colour-only status indicator;
- `prefers-reduced-motion` respected by every animation;
- no horizontal scroll at 375, 768, 1024 and 1440 pixels.

- [ ] **Step 3: Fix what is clearly a bug or a usability problem**

Fix in place, following the existing patterns. Anything that would need a business decision rather than a technical one: stop, and report it rather than guessing.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit && npm run build`

- [ ] **Step 5: Commit**

```bash
git commit -am "fix: accessibility and responsive corrections across the ordering flow"
```

---

## Plan Self-Review

**Spec coverage.** Section 3 (reorder) is Tasks 2 to 7. Section 4 (quick add) is Tasks 8 and 9. Section 5.1 (stale copy) is Task 1. Section 5.2 (the wider pass) is Task 10. Section 6 (how this gets built) is Task 10 step 1 plus the Global Constraints. Section 7 (error handling) is covered by `ReorderActionResult` in Task 4 and the skip reporting in Tasks 2 and 6. Section 8 (testing) is Tasks 2, 5 and 8. No spec section is unimplemented.

**Type consistency.** `PastOrderLine`, `SkippedLine`, `SkipReason`, `ReorderResult` and `ReorderActionResult` are all declared in Task 2 or Task 4 step 1 and used with the same names and shapes in Tasks 3, 4, 5, 6 and 7. `canQuickAdd` and `quickAddLine` are declared in Task 8 and used in Task 9. `ReorderReport`, `stashReorderReport`, `takeReorderReport` and `describeSkip` are declared in Task 5 and used in Tasks 6 and 7.

**Known soft spots, flagged rather than hidden.** Task 3 guesses at the exact return shape of `getOrderByTracking` and at the name of the storefront session helper; its step 1 and step 3 exist precisely to reconcile that against the real files, and step 3 says to stop and report if the tracking options carry no group name, because reorder cannot match options without one. Task 6 step 3 does the same for `TERMINAL_STATUSES`.
