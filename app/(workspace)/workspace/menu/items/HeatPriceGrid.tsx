"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceNumberInput } from "@/components/ui/WorkspaceNumberInput";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
import type {
  ManagedItem,
  ManagedOption,
  ManagedOptionGroup,
  ManagedVariation,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { setItemOptionVariationPrices } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";
import { MAX_PRICE_CENTS, pesosToCents } from "./sizeDrafts";

const initialState: MenuActionState = { status: "idle" };

/** Every cell, as `${optionId}:${variationId}` to a peso string, blank included. */
type PriceDrafts = Record<string, string>;

const cellKey = (optionId: string, variationId: string) => `${optionId}:${variationId}`;

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

/** Two price maps, compared as the RPC would see them. */
function sameCents(a: Record<string, number>, b: Record<string, number>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if (a[key] !== b[key]) return false;
  return true;
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
 * The columns are keyed on item.variations, the saved sizes with real ids, not
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

  // The state lives one level down because this component returns early three
  // times before it knows there is a grid to draw, and hooks cannot sit behind
  // a condition.
  return (
    <HeatPriceForm
      idPrefix={idPrefix}
      itemId={item.id}
      activeSizes={activeSizes}
      options={qualifyingOptions}
      savedPrices={item.optionVariationPrices}
    />
  );
}

/**
 * One form, one Save, one status line.
 *
 * WHY NOT A SAVE PER ROW, WHICH IS WHAT THIS USED TO BE.
 *
 * The plan called for a Save on every option row, on the grounds that one save
 * per grid would let a typo in one row block every other row. Five buttons
 * doing one job is its own cost though, and the objection has two answers that
 * did not exist when it was written.
 *
 * The first is that a typo no longer reaches the server. `problem` below names
 * the offending option and size and holds the button until it is fixed, which
 * is better than the old behaviour anyway: a row Save with a bad number used
 * to fail against the database and come back as a sentence about the whole
 * row.
 *
 * The second is that the action does not stop at the first failure. It writes
 * every row it can and names the ones it could not, so a heat level somebody
 * deleted on another screen while this was open costs that row and not the
 * other four. The isolation the row buttons were protecting is kept; only the
 * buttons are gone.
 *
 * WHY ONLY THE CHANGED ROWS ARE SENT.
 *
 * Each row is a separate RPC call, so sending all five to change one would be
 * four writes nobody asked for, four audit reads, and four more chances for an
 * unrelated row to fail. `changedRows` compares the cents each row would send
 * against the cents already saved for it. Both sides are built by the same
 * function over the same key set, which is what stops the comparison and the
 * payload disagreeing about what a row holds.
 */
function HeatPriceForm({
  idPrefix,
  itemId,
  activeSizes,
  options,
  savedPrices,
}: {
  idPrefix: string;
  itemId: string;
  activeSizes: ManagedVariation[];
  options: ManagedOption[];
  savedPrices: ManagedItem["optionVariationPrices"];
}) {
  const [state, action, pending] = useActionState(setItemOptionVariationPrices, initialState);

  const [drafts, setDrafts] = useState<PriceDrafts>(() => {
    const seeded: PriceDrafts = {};
    for (const option of options) {
      const saved = savedPrices[option.id] ?? {};
      for (const size of activeSizes) {
        if (size.id in saved) {
          seeded[cellKey(option.id, size.id)] = seededPesos(saved[size.id] ?? 0);
        }
      }
    }
    return seeded;
  });

  /**
   * What one row would send. A blank input drops that variation's key from the
   * object entirely, which is what clears its price row rather than storing a
   * free price at 0. See staff_set_option_variation_prices (Task 8): an
   * omitted key deletes the row, a key sent as 0 stores a real price of
   * nothing, and those are different outcomes.
   */
  function draftCents(optionId: string): Record<string, number> {
    const prices: Record<string, number> = {};
    for (const size of activeSizes) {
      const raw = (drafts[cellKey(optionId, size.id)] ?? "").trim();
      if (raw !== "") prices[size.id] = pesosToCents(raw);
    }
    return prices;
  }

  /**
   * The same row as the database holds it, over the same columns.
   *
   * Restricted to the active sizes because that is all the payload covers. A
   * price left on a size that has come off the menu is not part of this
   * comparison and is not touched by a save that skips the row.
   */
  function savedCents(optionId: string): Record<string, number> {
    const saved = savedPrices[optionId] ?? {};
    const prices: Record<string, number> = {};
    for (const size of activeSizes) {
      if (size.id in saved) prices[size.id] = saved[size.id] ?? 0;
    }
    return prices;
  }

  const changedRows = options
    .map((option) => ({ optionId: option.id, name: option.name, prices: draftCents(option.id) }))
    .filter((row) => !sameCents(row.prices, savedCents(row.optionId)));

  const payload = JSON.stringify({ itemId, options: changedRows });

  /**
   * What stops this save. Null when nothing does.
   *
   * Both bounds matter and for different reasons. Over the maximum the RPC
   * raises PRICE_RANGE, which would come back naming nothing. Under zero, or
   * as something that is not a number at all, nothing raises: pesosToCents
   * turns it into 0, and 0 is a real price meaning free, so a mistyped price
   * would quietly make a heat level free instead of failing. The number input
   * makes both hard to type and neither impossible.
   */
  const problem = (() => {
    for (const option of options) {
      for (const size of activeSizes) {
        const raw = (drafts[cellKey(option.id, size.id)] ?? "").trim();
        if (raw === "") continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
          return `${option.name} on ${size.shortLabel} is not a price. Use a number, or leave it blank to remove it.`;
        }
        if (pesosToCents(raw) > MAX_PRICE_CENTS) {
          return `${option.name} on ${size.shortLabel} is over PHP 100,000.`;
        }
      }
    }
    return null;
  })();

  const headingCell = "text-nybb-bone/55 type-caps border-nybb-bone/10 border-b py-2 font-normal";

  return (
    <WorkspaceSection
      title="Per size prices"
      description={
        <>
          <p>
            These options have no single price. They cost a different amount on each size, so each
            one is priced here instead of on the options screen.
          </p>
          <p>
            Leave a size blank to remove its price. A price of 0 is kept and means free, it is not
            the same as blank.
          </p>
          <p>
            These columns are the saved sizes on this item. Save the item above before a size you
            just added or renamed shows up or updates here.
          </p>
        </>
      }
    >
      <form action={action}>
        {/* Unconditional, and the only field this form posts. */}
        <input type="hidden" name="payload" value={payload} />

        {/* The page body must never scroll sideways, so a grid with more
            columns than the panel can hold scrolls inside its own box. */}
        <div className="overflow-x-auto">
          {/* Sized to its content rather than to the panel. Stretched to full
              width the option column takes all the slack, which parks the
              inputs a screen away from the name that belongs to them. */}
          <table className="border-separate border-spacing-0 text-left">
            <thead>
              <tr>
                <th scope="col" className={`${headingCell} pr-6`}>
                  Option
                </th>
                {activeSizes.map((size) => (
                  <th key={size.id} scope="col" className={`${headingCell} w-32 pr-3`}>
                    {size.shortLabel}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {options.map((option) => (
                <tr key={option.id}>
                  {/* A row header, not a cell. It is what names every input on
                      the row for a screen reader reading down a column, which
                      is the whole reason this is a table and not a stack of
                      divs. */}
                  <th
                    scope="row"
                    className="border-nybb-bone/10 border-b py-3 pr-6 text-sm font-normal"
                  >
                    {option.name}
                  </th>
                  {activeSizes.map((size) => (
                    <td key={size.id} className="border-nybb-bone/10 border-b py-3 pr-3">
                      <WorkspaceNumberInput
                        id={`${idPrefix}-${option.id}-${size.id}`}
                        shape="pesos"
                        // The column header names the size and the row header
                        // names the option, which is enough for a screen
                        // reader moving through the table. This says both at
                        // once for anything that reads the control on its own,
                        // and it contains the visible header text, satisfying
                        // WCAG 2.5.3.
                        aria-label={`${option.name} price, ${size.shortLabel}`}
                        value={drafts[cellKey(option.id, size.id)] ?? ""}
                        onValueChange={(next) =>
                          setDrafts((current) => ({
                            ...current,
                            [cellKey(option.id, size.id)]: next,
                          }))
                        }
                        disabled={pending}
                        // The numeric face, like every other price in the
                        // workspace. These sit in a column and are read down
                        // it, which is the whole reason The Numbers Are Mono
                        // Rule exists.
                        className="mt-0 font-mono tabular-nums"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            tone="dark"
            variant="primary"
            disabled={pending || problem !== null}
            className="min-h-11"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            Save prices
          </Button>
          {problem ? <p className="text-nybb-bone/55 text-xs">{problem}</p> : null}
        </div>
        <MenuStatusMessage state={state} />
      </form>
    </WorkspaceSection>
  );
}
