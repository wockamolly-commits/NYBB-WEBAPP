"use client";

import { Button } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppliedVoucher } from "@/lib/vouchers/preview";

/**
 * The promo code field, inside the order summary.
 *
 * ONE CODE, AND THE SHAPE SAYS SO.
 *
 * The stacking rule is that vouchers never combine, and the cheapest way to
 * honour a rule like that is to build a screen that cannot express breaking it.
 * There is one input and one applied code, so there is no "add another"
 * affordance to disable, no list to explain, and no state where two discounts
 * are on screen at once. Applying a second code replaces the first, the line
 * under the field says so before it happens, and the database backs the same
 * rule with a unique index in case a second write path ever appears.
 *
 * NOTHING HERE COMPUTES A DISCOUNT. The peso figure is whatever the server
 * returned, rendered. A discount worked out in the browser would be a discount
 * a customer could edit, and `place_order` resolves the whole thing again from
 * the vouchers row when the order is actually written.
 *
 * Like CustomerDetails beside it, this validates nothing. It says which code
 * was refused and why, in words, because a rule written here as well would be a
 * second opinion that drifts from the one that decides.
 */
export function VoucherField({
  code,
  onCodeChange,
  applied,
  error,
  busy,
  disabled,
  onApply,
  onRemove,
}: {
  code: string;
  onCodeChange: (code: string) => void;
  /** The server's verdict for the cart as it stands, or null. */
  applied: AppliedVoucher | null;
  error: string | null;
  busy: boolean;
  disabled: boolean;
  onApply: () => void;
  onRemove: () => void;
}) {
  const trimmed = code.trim();

  if (applied) {
    return (
      <div className="border-nybb-bone/15 mt-4 border-t pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="type-caps text-nybb-bone/55">Promo code</p>
            {/* The code in the display face, because it is the thing the
                customer recognises and the thing they would read back over the
                phone if the counter asked. */}
            <p className="font-display text-nybb-bone mt-1 truncate">{applied.code}</p>
            {applied.description ? (
              <p className="text-nybb-bone/55 mt-1 text-xs leading-relaxed">
                {applied.description}
              </p>
            ) : null}
          </div>
          {/* Quiet, and not a destructive tone. Removing a code is a normal
              thing to do mid-checkout, not a warning. */}
          <Button
            type="button"
            tone="dark"
            variant="secondary"
            onClick={onRemove}
            disabled={disabled || busy}
            className="shrink-0"
          >
            Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-nybb-bone/15 mt-4 border-t pt-4">
      <label htmlFor="voucher-code" className="type-caps text-nybb-bone/55">
        Promo code
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="voucher-code"
          name="voucherCode"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          // Enter inside a form submits it, and submitting the checkout form is
          // not what somebody pressing Enter in this field means.
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (trimmed !== "") onApply();
            }
          }}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Enter a code"
          aria-describedby={error ? "voucher-error" : "voucher-hint"}
          aria-invalid={error ? true : undefined}
          className={cn(
            // 16px, for the same reason CustomerDetails gives: anything smaller
            // and iOS Safari zooms the page in mid-checkout.
            "min-w-0 flex-1 rounded-md border bg-transparent px-3 py-2.5 text-base leading-normal",
            "text-nybb-bone placeholder:text-nybb-bone/35 uppercase",
            "transition-[border-color] duration-200 ease-out",
            error
              ? "border-nybb-red"
              : "border-nybb-bone/25 hover:border-nybb-bone/45 focus:border-nybb-bone/60",
          )}
        />
        <Button
          type="button"
          tone="dark"
          variant="secondary"
          onClick={onApply}
          disabled={disabled || busy || trimmed === ""}
          className="shrink-0"
        >
          {busy ? "Checking" : "Apply"}
        </Button>
      </div>

      {error ? (
        // The same device the summary's own failures use: bone letters with the
        // red carried by a rule, because signage red on charcoal measures 4.3:1
        // and an error is the last thing that should be hard to read.
        <p
          id="voucher-error"
          role="alert"
          className="border-nybb-red text-nybb-bone mt-2 border-l-2 pl-3 text-sm leading-relaxed"
        >
          {error}
        </p>
      ) : (
        <p id="voucher-hint" className="text-nybb-bone/55 mt-2 text-xs leading-relaxed">
          One code per order. Codes cannot be combined.
        </p>
      )}
    </div>
  );
}

/**
 * Subtotal, discount and total, drawn so that exactly one number is loud.
 *
 * With no code applied this is the single Subtotal line the summary has always
 * had. With one applied, the loud number moves to the total, because the total
 * is now the thing the customer is being asked to agree to, and the subtotal
 * becomes context. Two large orange figures on one card would be The One Loud
 * Thing Rule failing by repetition.
 *
 * The original subtotal never disappears. A discount the customer cannot check
 * the arithmetic of is a discount they have to take on trust.
 */
export function OrderTotals({
  subtotalCents,
  applied,
}: {
  subtotalCents: number;
  applied: AppliedVoucher | null;
}) {
  if (!applied) {
    return (
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <span className="font-display heading-panel">Subtotal</span>
        <span className="font-mono-tabular text-nybb-orange text-2xl">
          {formatPeso(subtotalCents)}
        </span>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="text-nybb-bone/55">Subtotal</span>
        <span className="font-mono-tabular text-nybb-bone/55">{formatPeso(subtotalCents)}</span>
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-4 text-sm">
        <span className="text-nybb-bone/55 min-w-0 truncate">Promo {applied.code}</span>
        <span className="font-mono-tabular text-nybb-bone shrink-0">
          {/* A minus sign, not a hyphen, because this is a number being reduced
              and the two render at different heights beside tabular figures. */}
          {"−"}
          {formatPeso(applied.discountCents)}
        </span>
      </div>
      <div className="border-nybb-bone/15 mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
        <span className="font-display heading-panel">Total</span>
        <span className="font-mono-tabular text-nybb-orange text-2xl">
          {formatPeso(Math.max(subtotalCents - applied.discountCents, 0))}
        </span>
      </div>
    </div>
  );
}
