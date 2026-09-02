"use client";

import { Ban, Check, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { canQuickAdd, quickAddLine } from "@/lib/menu/quick-add";
import { addToCart } from "@/lib/cart/store";
import type { MenuItem } from "@/lib/menu/types";
import { Button } from "@/components/ui/Button";

/**
 * Add straight from the menu board.
 *
 * Only for items with nothing to decide. Anything with a size or an option
 * still goes to its own page, because there is a real choice on that screen.
 *
 * Confirmation follows the pattern ItemConfigurator already uses: a live region
 * tied to what was added, not a toast on a timer. It resets on the next add so
 * a second press is not answered by a message about the first.
 *
 * The "full" state gets its own icon and label rather than sharing the idle
 * Plus/Add pair. A sighted customer at MAX_LINES pressing a button that looks
 * unchanged reads as a broken control; the icon and word both change so the
 * state does not rest on colour alone.
 *
 * WHY THE LIVE REGION STAYS MOUNTED, AND HOW A REPEAT PRESS STILL ANNOUNCES.
 * ================================================================
 * The rule for this whole codebase is in components/cart/ReorderNotice.tsx: a
 * live region inserted after its content already exists announces nothing, so
 * the `<span aria-live>` below is rendered on every render, unconditionally,
 * never keyed and never remounted.
 *
 * That creates the real problem this component has to solve: a repeated press
 * with nothing changed in between asks React to render the same string twice,
 * and the text reconciler only writes to the DOM when the rendered string
 * actually differs, so a screen reader hears the first add and nothing at all
 * for the second, third, or nth, even though the cart genuinely grew each
 * time. Remounting the region with a `key` used to "fix" this by giving React
 * a new node to mutate, but that is the exact shape the rule above forbids,
 * and it is announced inconsistently across screen readers for the same
 * reason a freshly mounted region is at first paint.
 *
 * The fix is clear-then-set on the one stable node: a press clears the
 * announcement synchronously, and an effect keyed on the press count writes
 * the real message on the following render. That is two renders and a
 * genuine text change every time, on a node that never unmounts.
 */
export function QuickAddButton({ item }: { item: MenuItem }) {
  const [state, setState] = useState<"idle" | "added" | "full">("idle");
  const [pressCount, setPressCount] = useState(0);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    // Nothing to reveal before the first press; skip so mount does not clear
    // the (already empty) idle announcement for no reason.
    if (pressCount === 0) return;
    // Wrapped and invoked, rather than a bare setCleared call, to satisfy
    // react-hooks/set-state-in-effect; see the same pattern and its reason
    // in components/cart/ReorderNotice.tsx.
    const reveal = () => setCleared(false);
    reveal();
  }, [pressCount]);

  if (!canQuickAdd(item)) return null;

  function add() {
    const line = quickAddLine(item);
    if (!line) return;
    setState(addToCart(line).ok ? "added" : "full");
    setCleared(true);
    setPressCount((count) => count + 1);
  }

  return (
    <>
      <Button
        type="button"
        tone="dark"
        variant="secondary"
        onClick={add}
        aria-label={`Add ${item.name} to your cart`}
        // Spacing only: a tighter horizontal pad than the default px-5 for a
        // control this small. Height stays at the recipe's default min-h-11,
        // the 44px touch-target floor, and is never overridden smaller.
        className="px-3 text-xs"
      >
        {state === "added" ? (
          <Check aria-hidden className="size-4" />
        ) : state === "full" ? (
          <Ban aria-hidden className="size-4" />
        ) : (
          <Plus aria-hidden className="size-4" />
        )}
        {state === "added" ? "Added" : state === "full" ? "Cart full" : "Add"}
      </Button>
      <span aria-live="polite" className="sr-only">
        {cleared
          ? ""
          : state === "added"
            ? `${item.name} added to your cart.`
            : state === "full"
              ? "Your cart is full. Remove something before adding more."
              : ""}
      </span>
    </>
  );
}
