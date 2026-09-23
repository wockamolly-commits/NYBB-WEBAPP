"use client";

import { Check, TicketPercent } from "lucide-react";
import { PromoStub } from "@/components/promos/PromoStub";
import { Button } from "@/components/ui/Button";
import { formatPeso } from "@/lib/format";
import { promoHeadline, type Promo } from "@/lib/promos/schema";
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
 *
 * THE CODE IS DRAWN AS A TICKET STUB, the same shape the bar and the promos
 * page use, so the customer recognises the code they came in with before they
 * read it.
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
  suggestions = [],
  onUse,
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
  /**
   * Promos running at this counter that this customer has not spent. A tap
   * sends the CODE through the same Apply path as typing it, so a suggestion
   * is never a discount the browser decided on: the server still says whether
   * this cart qualifies.
   */
  suggestions?: readonly Promo[];
  onUse?: (code: string) => void;
}) {
  const trimmed = code.trim();

  if (applied) {
    return (
      <div className="border-nybb-bone/15 mt-4 border-t pt-4">
        <p className="type-caps text-nybb-bone/55">Promo code</p>
        <div className="bg-nybb-graphite mt-2 flex items-stretch rounded-md">
          <PromoStub code={applied.code} />
          <div className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 pl-3">
            <div className="min-w-0 flex-1">
              <p className="text-nybb-bone flex items-center gap-1.5 text-sm">
                <Check aria-hidden className="text-nybb-orange h-4 w-4 shrink-0" />
                Applied
              </p>
              {/* Bone rather than orange. The total below is the one orange
                  figure on this card, and a second would be The One Loud
                  Thing Rule failing by repetition. */}
              <p className="font-mono-tabular text-nybb-bone/70 mt-0.5 text-xs whitespace-nowrap">
                {formatPeso(applied.discountCents)} off
              </p>
            </div>
            {/* Quiet, and not a destructive tone. Removing a code is a normal
                thing to do mid-checkout, not a warning. */}
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              onClick={onRemove}
              disabled={disabled || busy}
              className="shrink-0"
              aria-label={`Remove ${applied.code}`}
            >
              Remove
            </Button>
          </div>
        </div>
        {applied.description ? (
          <p className="text-nybb-bone/55 mt-2 text-xs leading-relaxed">{applied.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="border-nybb-bone/15 mt-4 border-t pt-4">
      <label htmlFor="voucher-code" className="type-caps text-nybb-bone/55">
        Promo code
      </label>
      <div className="mt-2 flex gap-2">
        <div className="relative min-w-0 flex-1">
          <TicketPercent
            aria-hidden
            className="text-nybb-bone/55 pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
          />
          <input
            id="voucher-code"
            name="voucherCode"
            value={code}
            onChange={(event) => onCodeChange(event.target.value)}
            // Enter inside a form submits it, and submitting the checkout form
            // is not what somebody pressing Enter in this field means.
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
              // 16px, for the same reason CustomerDetails gives: anything
              // smaller and iOS Safari zooms the page in mid-checkout.
              "w-full rounded-md border bg-transparent py-2.5 pr-3 pl-9 text-base leading-normal",
              "text-nybb-bone placeholder:text-nybb-bone/35 uppercase",
              "transition-[border-color] duration-200 ease-out",
              error
                ? "border-nybb-red"
                : "border-nybb-bone/25 hover:border-nybb-bone/45 focus:border-nybb-bone/60",
            )}
          />
        </div>
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

      {/* THE CODES THE CUSTOMER DID NOT HAVE TO BE TOLD.
          The field above assumes somebody was handed a code. These are the
          ones the owner has published, so a customer who came straight here
          from the cart can take one in a tap instead of leaving checkout to
          find the promos page. Two at most: more than that is a list, and the
          list lives on /promos. */}
      {suggestions.length > 0 && onUse ? (
        <div className="mt-4">
          <p className="text-nybb-bone/70 text-sm">Running at this counter</p>
          <ul className="mt-2 space-y-2">
            {suggestions.slice(0, 2).map((promo) => {
              const { value, scope } = promoHeadline(promo);
              return (
                <li key={promo.code}>
                  <button
                    type="button"
                    onClick={() => onUse(promo.code)}
                    disabled={disabled || busy}
                    aria-label={`Apply ${promo.code}${value ? `, ${value}` : ""}`}
                    className="group border-nybb-bone/40 hover:border-nybb-bone/65 hover:bg-nybb-bone/5 flex min-h-11 w-full items-stretch rounded-md border border-dashed text-left transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <PromoStub code={promo.code} size="sm" className="-my-px -ml-px" />
                    <span className="min-w-0 flex-1 px-3 py-2">
                      {value ? (
                        <span className="text-nybb-bone block text-sm leading-tight">{value}</span>
                      ) : null}
                      <span className="text-nybb-bone/55 block truncate text-xs leading-snug">
                        {scope}
                      </span>
                    </span>
                    <span className="font-display text-nybb-orange group-hover:text-nybb-orange-lit flex shrink-0 items-center pr-3 text-sm tracking-[0.06em] uppercase transition-colors duration-200">
                      Use
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
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
