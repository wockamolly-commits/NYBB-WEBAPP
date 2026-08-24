"use client";

import { Check, Plus } from "lucide-react";
import { useState } from "react";
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
 * A repeated press with nothing changed in between renders the same message
 * twice, and a plain state update does not touch the DOM the second time
 * (React bails out on Object.is equality), so a screen reader hears the first
 * add and nothing at all for the second, third, or nth. The live region is
 * keyed on an incrementing per-press counter so React remounts a fresh node
 * every time, guaranteeing a DOM mutation regardless of whether the text
 * repeats. ItemConfigurator uses the same counter-keyed approach for the same
 * reason; keep them matching if either changes.
 *
 * The accessible name stays "Add {item.name} to your cart" at all times, via
 * aria-label, rather than following the visible "Added" label into a past
 * tense that describes an action still available to repeat. The live region
 * carries the confirmation instead.
 *
 * The tile it sits on is charcoal, so tone="dark" is the ground this button is
 * read against, not the button's own colour choice. See components/ui/Button.tsx.
 */
export function QuickAddButton({ item }: { item: MenuItem }) {
  const [state, setState] = useState<"idle" | "added" | "full">("idle");
  const [pressCount, setPressCount] = useState(0);

  if (!canQuickAdd(item)) return null;

  function add() {
    const line = quickAddLine(item);
    if (!line) return;
    setState(addToCart(line).ok ? "added" : "full");
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
        ) : (
          <Plus aria-hidden className="size-4" />
        )}
        {state === "added" ? "Added" : "Add"}
      </Button>
      <span aria-live="polite" className="sr-only" key={pressCount}>
        {state === "added"
          ? `${item.name} added to your cart.`
          : state === "full"
            ? "Your cart is full. Remove something before adding more."
            : ""}
      </span>
    </>
  );
}
