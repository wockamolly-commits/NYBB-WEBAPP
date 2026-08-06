"use client";

import { Minus, Plus } from "lucide-react";
import { MAX_QUANTITY, MIN_QUANTITY } from "@/lib/menu/line-pricing";
import { cn } from "@/lib/utils";

/**
 * Minus, a number, plus. One segmented control, on a dark ground.
 *
 * The cart and the configurator each had their own copy of this, and the two
 * had drifted: 40px boxes against 44px, a 36px readout against 40px, and the
 * same glyphs at different optical weights. Same control, two answers, which
 * is the definition of a thing that should be one component.
 *
 * The glyphs are icons rather than typed characters. A hyphen is not a minus
 * sign: it renders short and sits low, so beside a full-height "+" it read as
 * a smaller, weaker control, which is not what it is. Matching Trash2's 16px
 * and 2px stroke also puts the whole cart on one icon family.
 *
 * Disabled is a stated tint, not opacity. At 35% the minus sign measured 3.0:1
 * against the charcoal card, and on a control whose entire label is that one
 * glyph, "faded" and "not rendered" are the same picture.
 */
export function QuantityStepper({
  quantity,
  onChange,
  labelledBy,
  fewerLabel = "One fewer",
  moreLabel = "One more",
  size = "default",
  className,
}: {
  quantity: number;
  onChange: (next: number) => void;
  /** Points the readout at an existing visible label, where there is one. */
  labelledBy?: string;
  fewerLabel?: string;
  moreLabel?: string;
  /** `sm` is the cart line, where the row also carries a price and a remove. */
  size?: "sm" | "default";
  className?: string;
}) {
  const box = size === "sm" ? "size-10" : "size-11";
  const readout = size === "sm" ? "w-9 text-sm" : "w-10 text-base";

  const step = cn(
    "flex items-center justify-center transition-[background-color,color,transform] duration-200 ease-out",
    "hover:bg-nybb-bone/10 active:bg-nybb-bone/15 active:scale-95 active:duration-75 motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:text-nybb-bone/45 disabled:active:scale-100",
    box,
  );

  return (
    <div
      className={cn(
        "border-nybb-bone/25 flex items-center rounded-md border",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= MIN_QUANTITY}
        aria-label={fewerLabel}
        className={cn(step, "rounded-l-[0.3rem]")}
      >
        <Minus aria-hidden className="h-4 w-4" strokeWidth={2} />
      </button>

      <output
        aria-labelledby={labelledBy}
        className={cn("font-mono-tabular text-center", readout)}
      >
        {quantity}
      </output>

      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= MAX_QUANTITY}
        aria-label={moreLabel}
        className={cn(step, "rounded-r-[0.3rem]")}
      >
        <Plus aria-hidden className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}
