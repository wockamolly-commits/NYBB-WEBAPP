"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { HeatMeter } from "@/components/menu/HeatMeter";
import { NoPhotoTile } from "@/components/menu/NoPhotoTile";
import { lineKey } from "@/lib/cart/lines";
import { addToCart } from "@/lib/cart/store";
import { optionPriceCents } from "@/lib/catalog/pricing";
import { formatPeso, formatPesoCompact } from "@/lib/format";
import {
  MAX_QUANTITY,
  MIN_QUANTITY,
  defaultSelection,
  lineTotalCents,
  selectionProblem,
  toggleOption,
  unitPriceCents,
} from "@/lib/menu/line-pricing";
import { previewImage } from "@/lib/menu/preview";
import type { MenuItem, MenuOption, MenuOptionGroup } from "@/lib/menu/types";
import { cn } from "@/lib/utils";

/**
 * The product screen, and for wings the configurator the spec asks for.
 *
 * It is one component rather than a bespoke wings page plus a generic one, and
 * the bespoke feeling comes from the data instead of from a slug check:
 *
 *   - a group whose options all carry photography renders as a visual grid,
 *     which is what makes the nine wing flavours the screen rather than a
 *     dropdown on it;
 *   - a group whose options carry a heat percentage renders on the heat meter,
 *     with the upcharge for the size currently selected;
 *   - anything else renders as a plain priced list.
 *
 * That matters beyond tidiness. The menu is owner-editable from Phase 4, so a
 * tenth flavour or a sixth heat level has to arrive as a row, not as a code
 * change, and a component keyed on `slug === "wing-flavour"` would quietly
 * stop being bespoke the day somebody renamed the group.
 *
 * Pricing here is for display only. Every peso a customer is actually charged
 * is resolved by `place_order` in Postgres from the ids this screen collects.
 */

function isVisualGroup(group: MenuOptionGroup): boolean {
  return group.options.length > 0 && group.options.every((option) => option.image);
}

function isHeatGroup(group: MenuOptionGroup): boolean {
  return group.options.some((option) => typeof option.heatPercent === "number");
}

/** "+30", or nothing at all when the option is free. */
function upcharge(option: MenuOption, variationSlug: string): string | null {
  const cents = optionPriceCents(option, variationSlug);
  return cents > 0 ? `+${formatPesoCompact(cents)}` : null;
}

export function ItemConfigurator({
  item,
  details,
}: {
  item: MenuItem;
  /**
   * The name, price and description, rendered on the server and passed in.
   *
   * The preview and the controls have to share one piece of state, so this
   * component owns both columns. The static copy stays a server component and
   * arrives here as a slot rather than being re-implemented on the client.
   */
  details?: React.ReactNode;
}) {
  const searchParams = useSearchParams();

  const [selection, setSelection] = useState(() => {
    const base = defaultSelection(item);

    // Landing here from a flavour tile should land on that flavour. The
    // parameter is validated against the menu rather than trusted, so a
    // hand-edited URL cannot put an option on screen that this item does not
    // sell.
    const requested = searchParams.get("flavour");
    if (!requested) return base;

    for (const group of item.optionGroups) {
      if (group.options.some((option) => option.slug === requested)) {
        return { ...base, optionSlugs: { ...base.optionSlugs, [group.slug]: [requested] } };
      }
    }

    return base;
  });

  const unitCents = useMemo(() => unitPriceCents(item, selection), [item, selection]);
  const totalCents = useMemo(() => lineTotalCents(item, selection), [item, selection]);
  const problem = useMemo(() => selectionProblem(item, selection), [item, selection]);

  const chosen = (group: MenuOptionGroup) => selection.optionSlugs[group.slug] ?? [];

  // The frame follows the selection. Picking Salted Egg and still looking at
  // Classic Buffalo makes this read as a form rather than as a preview.
  const { image: preview, option: previewOption } = useMemo(
    () => previewImage(item, selection.optionSlugs),
    [item, selection.optionSlugs],
  );

  // An item with one price and no add-ons has nothing above the quantity row,
  // so the divider there would be a rule with nothing to divide.
  const hasChoices = item.variations.length > 1 || item.optionGroups.length > 0;

  // The confirmation is tied to the line that was added, not to a timer. Change
  // the flavour and it goes, because "Added to cart" sitting under a different
  // configuration is a claim about wings the customer is not looking at.
  const [added, setAdded] = useState<{ key: string; ok: boolean; quantity: number } | null>(
    null,
  );
  const currentKey = lineKey({
    itemSlug: item.slug,
    variationSlug: selection.variationSlug,
    optionSlugs: selection.optionSlugs,
  });
  const confirmation = added?.key === currentKey ? added : null;

  function add() {
    const { ok } = addToCart({
      itemSlug: item.slug,
      variationSlug: selection.variationSlug,
      optionSlugs: selection.optionSlugs,
      quantity: selection.quantity,
      // Display only, and refreshed from the menu every time the cart page
      // resolves. See lib/cart/lines.ts.
      unitPriceCents: unitCents,
    });

    setAdded({ key: currentKey, ok, quantity: selection.quantity });
    // Back to one, so a second tap on a screen that already says "3 added"
    // does not quietly make it six.
    if (ok) setSelection((current) => ({ ...current, quantity: MIN_QUANTITY }));
  }

  function choose(group: MenuOptionGroup, optionSlug: string) {
    setSelection((current) => ({
      ...current,
      optionSlugs: {
        ...current.optionSlugs,
        [group.slug]: toggleOption(group, current.optionSlugs[group.slug] ?? [], optionSlug),
      },
    }));
  }

  function setQuantity(next: number) {
    setSelection((current) => ({
      ...current,
      quantity: Math.min(Math.max(next, MIN_QUANTITY), MAX_QUANTITY),
    }));
  }

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:gap-12">
      <div>
        <div className="tile-orange relative aspect-square overflow-hidden rounded-md">
          {preview ? (
            <Image
              // Keyed on the source so React swaps the element rather than
              // mutating one, which is what lets the new photograph fade in
              // instead of popping. globals.css zeroes the duration under
              // prefers-reduced-motion, so this needs no guard of its own.
              key={preview.src}
              src={preview.src}
              alt={
                previewOption
                  ? `${previewOption.name} ${item.name.toLowerCase()}`
                  : item.name
              }
              fill
              sizes="(min-width: 1024px) 44vw, 92vw"
              placeholder="blur"
              blurDataURL={preview.blurDataURL}
              priority
              className="animate-in fade-in object-cover duration-300"
            />
          ) : (
            <NoPhotoTile name={item.name} className="absolute inset-0" />
          )}
        </div>

        {details}
      </div>

      <div className="bg-nybb-charcoal text-nybb-bone h-fit rounded-md p-5 sm:p-7">
      {/* Size. A single-variation item has nothing to choose, so the control
          does not appear at all rather than appearing with one dead button. */}
      {item.variations.length > 1 ? (
        <fieldset>
          <legend className="font-display text-sm tracking-[0.08em]">Size</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {item.variations.map((variation) => {
              const active = variation.slug === selection.variationSlug;
              return (
                <button
                  key={variation.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setSelection((current) => ({ ...current, variationSlug: variation.slug }))
                  }
                  className={cn(
                    "flex min-h-16 flex-col items-start justify-center rounded-md px-4 py-3 text-left transition-colors",
                    active
                      ? "bg-nybb-orange text-nybb-ink"
                      : "border-nybb-bone/25 hover:border-nybb-bone/60 border",
                  )}
                >
                  <span className="font-display text-base leading-none">
                    {variation.shortName}
                  </span>
                  <span
                    className={cn(
                      "mt-1.5 text-xs",
                      active ? "text-nybb-ink/75" : "text-nybb-bone/60",
                    )}
                  >
                    {variation.name}
                  </span>
                  <span className="font-mono-tabular mt-1.5 text-sm">
                    {formatPesoCompact(variation.priceCents)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {item.optionGroups.map((group) => (
        <fieldset key={group.slug} className="mt-7">
          <legend className="font-display text-sm tracking-[0.08em]">
            {group.name}
            <span className="text-nybb-bone/50 ml-2 font-sans text-xs tracking-normal">
              {group.minSelect > 0 ? "Required" : "Optional"}
              {group.maxSelect > 1 ? `, up to ${group.maxSelect}` : ""}
            </span>
          </legend>

          {isVisualGroup(group) ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {group.options.map((option) => {
                const active = chosen(group).includes(option.slug);
                return (
                  <li key={option.slug}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(group, option.slug)}
                      className={cn(
                        "w-full overflow-hidden rounded-md text-left transition-shadow",
                        active
                          ? "ring-nybb-orange ring-2"
                          : "ring-nybb-bone/15 hover:ring-nybb-bone/40 ring-1",
                      )}
                    >
                      <span className="tile-orange relative block aspect-square">
                        {option.image ? (
                          <Image
                            src={option.image.src}
                            alt=""
                            fill
                            sizes="(min-width: 1024px) 12vw, (min-width: 640px) 18vw, 42vw"
                            placeholder="blur"
                            blurDataURL={option.image.blurDataURL}
                            className="object-cover"
                          />
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          // min-h so a flavour that wraps to two lines does not
                          // make its tile taller than the rest of the row.
                          "flex min-h-11 items-center px-2 py-2 text-xs leading-tight",
                          active ? "bg-nybb-orange text-nybb-ink" : "text-nybb-bone/85",
                        )}
                      >
                        {option.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="mt-3 space-y-2">
              {group.options.map((option) => {
                const active = chosen(group).includes(option.slug);
                const price = upcharge(option, selection.variationSlug);

                return (
                  <li key={option.slug}>
                    <button
                      type="button"
                      aria-pressed={active}
                      onClick={() => choose(group, option.slug)}
                      className={cn(
                        "flex min-h-14 w-full items-center justify-between gap-4 rounded-md px-4 py-2.5 text-left transition-colors",
                        active
                          ? "border-nybb-orange bg-nybb-orange/10 border"
                          : "border-nybb-bone/20 hover:border-nybb-bone/50 border",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="font-display block text-base leading-none">
                          {option.name}
                        </span>
                        {isHeatGroup(group) && typeof option.heatPercent === "number" ? (
                          <HeatMeter percent={option.heatPercent} size="sm" className="mt-2" />
                        ) : option.description ? (
                          <span className="text-nybb-bone/60 mt-1 block text-xs">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono-tabular text-nybb-orange shrink-0 text-sm">
                        {/* Recomputed from the selected size on every render,
                            which is the point of the whole screen: heat costs
                            PHP 30 on a half and PHP 40 on a full. */}
                        {price ?? "Free"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>
      ))}

      {/* Quantity and total */}
      <div className={cn(hasChoices && "border-nybb-bone/15 mt-8 border-t pt-6")}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span id="quantity-label" className="font-display text-sm tracking-[0.08em]">
              Quantity
            </span>
            <div className="border-nybb-bone/25 flex items-center rounded-md border">
              <button
                type="button"
                onClick={() => setQuantity(selection.quantity - 1)}
                disabled={selection.quantity <= MIN_QUANTITY}
                aria-label="One fewer"
                className="hover:bg-nybb-bone/10 flex h-11 w-11 items-center justify-center text-lg transition-colors disabled:opacity-35"
              >
                -
              </button>
              <output
                aria-labelledby="quantity-label"
                className="font-mono-tabular w-10 text-center text-base"
              >
                {selection.quantity}
              </output>
              <button
                type="button"
                onClick={() => setQuantity(selection.quantity + 1)}
                disabled={selection.quantity >= MAX_QUANTITY}
                aria-label="One more"
                className="hover:bg-nybb-bone/10 flex h-11 w-11 items-center justify-center text-lg transition-colors disabled:opacity-35"
              >
                +
              </button>
            </div>
          </div>

          <p className="text-right">
            <span className="text-nybb-bone/55 block text-xs tracking-[0.14em] uppercase">
              Total
            </span>
            <span className="font-mono-tabular text-nybb-orange text-2xl" aria-live="polite">
              {formatPeso(totalCents)}
            </span>
            {selection.quantity > 1 ? (
              <span className="text-nybb-bone/55 block text-xs">
                {formatPeso(unitCents)} each
              </span>
            ) : null}
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={add}
            disabled={problem !== null}
            className={cn(
              "font-display min-h-12 w-full rounded-md text-sm tracking-[0.06em] transition-colors duration-200",
              problem
                ? "bg-nybb-bone/15 text-nybb-bone/55 cursor-not-allowed"
                : "bg-nybb-orange text-nybb-ink hover:bg-nybb-orange-lit",
            )}
          >
            {problem ? `Pick a ${problem.group.name.toLowerCase()}` : "Add to cart"}
          </button>

          {/* One live region rather than a message that appears and disappears,
              so a screen reader hears the confirmation without the paragraph
              itself coming and going under the button.

              What is true today: the cart works, checkout does not. Pickup
              times need the pilot branch and its hours, which are still with
              the owner, so this says so instead of pretending. */}
          <p
            aria-live="polite"
            className="text-nybb-bone/55 mt-3 text-xs leading-relaxed"
          >
            {confirmation === null ? (
              <>
                Build your order now. Checkout opens once pickup times are
                published; until then,{" "}
                <Link
                  href="/contact"
                  className="text-nybb-bone underline decoration-current/40 underline-offset-4 hover:decoration-current"
                >
                  call the branch
                </Link>{" "}
                you want to collect from.
              </>
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
        </div>
        </div>
      </div>
    </div>
  );
}
