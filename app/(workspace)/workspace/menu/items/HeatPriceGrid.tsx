"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import type {
  ManagedItem,
  ManagedOption,
  ManagedOptionGroup,
  ManagedVariation,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { setOptionVariationPrices } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";
import { MAX_PRICE_CENTS, pesosToCents } from "./sizeDrafts";

const initialState: MenuActionState = { status: "idle" };

/**
 * Cents already known to be a real, saved price into what the input should
 * show.
 *
 * This is deliberately not sizeDrafts' centsToPesosInput, which turns a
 * non-positive amount into "" because a size can never legitimately cost
 * nothing there. Here 0 is a real price meaning free, and it must render as
 * "0", not blank: blank is reserved for "no price is set on this size at
 * all". Coalescing them would make the very first render of a genuinely free
 * heat level indistinguishable from an unset one, and saving unchanged would
 * then delete it.
 */
function seededPesos(cents: number): string {
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/**
 * One option's row: its own Server Action and its own useActionState, so a
 * mistake on the Insane row cannot block or clobber the No Heat row's save.
 * Same isolation OptionRow uses in OptionGroupEditor.tsx, and for the same
 * reason the brief gives: one save per grid would make a typo in one row
 * block every other row.
 *
 * `prices` is keyed by variation id and holds exactly what each input shows,
 * a peso string, including blank. Blank is not "0 pesos": the payload below
 * drops a blank variation's key from the object entirely, which is what
 * clears its price row rather than storing a free price at 0. See
 * setOptionVariationPrices and staff_set_option_variation_prices (Task 8):
 * an omitted key deletes the row, a key sent as 0 stores a real price of
 * nothing, and those are different outcomes.
 */
function HeatPriceOptionRow({
  idPrefix,
  itemId,
  option,
  activeSizes,
  savedPrices,
}: {
  idPrefix: string;
  itemId: string;
  option: ManagedOption;
  activeSizes: ManagedVariation[];
  savedPrices: Record<string, number>;
}) {
  const [state, action, pending] = useActionState(setOptionVariationPrices, initialState);
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const seeded: Record<string, string> = {};
    for (const size of activeSizes) {
      if (size.id in savedPrices) seeded[size.id] = seededPesos(savedPrices[size.id] ?? 0);
    }
    return seeded;
  });

  const payload = JSON.stringify({
    itemId,
    optionId: option.id,
    prices: Object.fromEntries(
      activeSizes
        .filter((size) => (prices[size.id] ?? "").trim() !== "")
        .map((size) => [size.id, pesosToCents(prices[size.id] ?? "")]),
    ),
  });

  return (
    <div className="border-nybb-bone/10 first:border-t-0 first:pt-0 border-t pt-4">
      <form action={action} className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="payload" value={payload} />
        <p className="min-w-28 text-sm">{option.name}</p>
        {activeSizes.map((size) => (
          <div className="w-28" key={size.id}>
            <WorkspaceFieldLabel htmlFor={`${idPrefix}-${option.id}-${size.id}`}>
              {size.shortLabel}
            </WorkspaceFieldLabel>
            <WorkspaceInput
              id={`${idPrefix}-${option.id}-${size.id}`}
              type="number"
              inputMode="decimal"
              min={0}
              max={MAX_PRICE_CENTS / 100}
              step="0.01"
              // Overrides the label above: the visible "HALF" alone repeats
              // down every row and across every option, and nothing but
              // position would otherwise tell them apart for anyone not
              // reading the screen. This still contains the visible label
              // text, satisfying WCAG 2.5.3.
              aria-label={`${option.name} price, ${size.shortLabel}`}
              value={prices[size.id] ?? ""}
              onChange={(event) =>
                setPrices((current) => ({ ...current, [size.id]: event.target.value }))
              }
              disabled={pending}
            />
          </div>
        ))}
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden className="size-4" />
          )}
          Save
        </Button>
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}

/**
 * The per size price grid: what each per size priced option costs on each of
 * this item's active sizes.
 *
 * WHY THIS EXISTS.
 *
 * Level of Hotness costs PHP 30 on a half order of wings and PHP 40 on a full
 * one, and INSANE costs PHP 30 and PHP 60. No single number on the option row
 * can express that, which is the entire reason menu_option_variation_prices
 * exists (Task 8). An option with a flat price, including a genuine free at
 * 0, is priced on the options screen instead and never appears here: showing
 * it here would imply this grid overrides it, which it does not.
 *
 * WHICH OPTIONS QUALIFY.
 *
 * Only options whose priceCents is null, drawn from option groups this item
 * links. That is 30 of the 31 seeded items' worth of nothing, so this renders
 * nothing at all, not an empty box, when the item has none.
 *
 * WHY SAVED DATA, NOT THE EDITOR'S DRAFT.
 *
 * The rows are keyed on item.variations, the saved sizes with real ids, not
 * the editor's draft `sizes` state. A size added this session has no id
 * until the item itself saves, and a price keyed to a variation id that does
 * not exist yet cannot be written. Task 9's review caught exactly this trap.
 * The same reasoning is why this renders nothing for an item that has never
 * been saved (`item` null): there is no item id yet for the RPC to write
 * against, and no saved variation ids to key rows on.
 */
export function HeatPriceGrid({
  idPrefix,
  item,
  optionGroups,
}: {
  idPrefix: string;
  item: ManagedItem | null;
  optionGroups: ManagedOptionGroup[];
}) {
  if (!item) return null;

  const activeSizes = item.variations.filter((variation) => variation.isActive);
  const linkedGroupIds = new Set(item.optionLinks.map((link) => link.groupId));
  const qualifyingOptions = optionGroups
    .filter((group) => linkedGroupIds.has(group.id))
    .flatMap((group) => group.options)
    .filter((option) => option.priceCents === null);

  if (activeSizes.length === 0 || qualifyingOptions.length === 0) return null;

  return (
    <section className="bg-nybb-charcoal mt-4 rounded-md p-5">
      <p className="type-caps text-nybb-bone/55">Per size prices</p>
      <p className="text-nybb-bone/55 mt-2 text-xs">
        These options have no single price. They cost a different amount on each size, so each
        one is priced here instead of on the options screen.
      </p>
      <p className="text-nybb-bone/55 mt-1 text-xs">
        Leave a size blank to remove its price. A price of 0 is kept and means free, it is not
        the same as blank.
      </p>
      <div className="mt-4 space-y-4">
        {qualifyingOptions.map((option) => (
          <HeatPriceOptionRow
            key={option.id}
            idPrefix={idPrefix}
            itemId={item.id}
            option={option}
            activeSizes={activeSizes}
            savedPrices={item.optionVariationPrices[option.id] ?? {}}
          />
        ))}
      </div>
    </section>
  );
}
