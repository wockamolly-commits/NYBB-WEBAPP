"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { formatPeso } from "@/lib/format";
import { MAX_PRICE_CENTS, pesosToCents, sizeName, type SizeDraft } from "./sizeDrafts";

/**
 * The Sizes section of the item editor: the list of rows, the strip a removed
 * row leaves behind, and the button that adds one.
 *
 * Presentational, under ruling R25. It owns no state. The list, the default
 * and the announcement all live in ItemEditor, because the payload and the
 * pre-submit gate read them, and the focus moves belong there too since only
 * it knows which row it has just changed.
 *
 * Every row's controls are named after their size. "Default", "Remove" and
 * "Undo" repeat down the list and nothing but position tells them apart on
 * screen, which is no help to somebody who cannot see the screen and is about
 * to change which size the storefront item page opens on. Each accessible
 * name starts with the visible text, so speaking the visible label still
 * matches it (WCAG 2.5.3).
 */
export function SizeRows({
  idPrefix,
  radioName,
  sizes,
  effectiveDefaultKey,
  announcement,
  disabled,
  onUpdate,
  onDefaultChange,
  onRemove,
  onRestore,
  onAdd,
}: {
  idPrefix: string;
  radioName: string;
  sizes: SizeDraft[];
  effectiveDefaultKey: string;
  announcement: string;
  disabled: boolean;
  onUpdate: (key: string, patch: Partial<SizeDraft>) => void;
  onDefaultChange: (key: string) => void;
  onRemove: (key: string) => void;
  onRestore: (key: string) => void;
  onAdd: () => void;
}) {
  const activeCount = sizes.filter((size) => size.isActive).length;

  return (
    <section className="bg-nybb-charcoal mt-4 rounded-md p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="type-caps text-nybb-bone/55">Sizes</p>
        <p className="text-nybb-bone/55 text-xs">
          {activeCount} size{activeCount === 1 ? "" : "s"} on the menu
        </p>
      </div>
      <p className="text-nybb-bone/55 mt-2 text-xs">
        The size name is what a customer picks, like &quot;Half, 6 pieces&quot;. The short name is
        what the kitchen ticket prints, like &quot;HALF&quot;. They are two separate fields and
        neither is worked out from the other. One size is the default, which is the one the item
        page opens on.
      </p>

      {/* Removing a size swaps a row of inputs for a strip, and the focused
          button ceases to exist. Focus is moved by ItemEditor; this is what
          says out loud that anything happened. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <fieldset className="mt-4">
        <legend className="sr-only">Sizes, one of which is the default</legend>
        <ul className="space-y-3">
          {sizes.map((size, index) => {
            const name = sizeName(size, index);

            if (!size.isActive) {
              return (
                <li
                  key={size.key}
                  className="bg-nybb-bone/5 border-nybb-bone/15 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3.5 py-3"
                >
                  <p className="text-sm">
                    {size.shortLabel || size.label || "This size"}
                    <span className="text-nybb-bone/55 ml-2 text-xs">
                      {size.wasActive ? "Removed. It comes off the menu when you save." : "Off the menu."}
                    </span>
                  </p>
                  <Button
                    type="button"
                    id={`${idPrefix}-${size.key}-undo`}
                    tone="dark"
                    variant="ghost"
                    aria-label={size.wasActive ? `Undo: ${name}` : `Put it back: ${name}`}
                    onClick={() => onRestore(size.key)}
                    disabled={disabled}
                    className="min-h-11"
                  >
                    <RotateCcw aria-hidden className="size-4" />
                    {size.wasActive ? "Undo" : "Put it back"}
                  </Button>
                </li>
              );
            }

            return (
              <li key={size.key} className="border-nybb-bone/15 rounded-md border px-3.5 py-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-48 flex-[2]">
                    <WorkspaceFieldLabel htmlFor={`${idPrefix}-${size.key}-label`}>
                      Size name
                    </WorkspaceFieldLabel>
                    <WorkspaceInput
                      id={`${idPrefix}-${size.key}-label`}
                      value={size.label}
                      onChange={(event) => onUpdate(size.key, { label: event.target.value })}
                      maxLength={60}
                      placeholder="Half, 6 pieces"
                      disabled={disabled}
                    />
                  </div>
                  <div className="w-36">
                    <WorkspaceFieldLabel htmlFor={`${idPrefix}-${size.key}-short`}>
                      Short name for the ticket
                    </WorkspaceFieldLabel>
                    <WorkspaceInput
                      id={`${idPrefix}-${size.key}-short`}
                      value={size.shortLabel}
                      onChange={(event) => onUpdate(size.key, { shortLabel: event.target.value })}
                      maxLength={20}
                      placeholder="HALF"
                      disabled={disabled}
                    />
                  </div>
                  <div className="w-32">
                    <WorkspaceFieldLabel htmlFor={`${idPrefix}-${size.key}-price`}>
                      Price (PHP)
                    </WorkspaceFieldLabel>
                    <WorkspaceInput
                      id={`${idPrefix}-${size.key}-price`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={MAX_PRICE_CENTS / 100}
                      step="0.01"
                      value={size.pesos}
                      onChange={(event) => onUpdate(size.key, { pesos: event.target.value })}
                      disabled={disabled}
                    />
                  </div>
                  <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
                    <input
                      type="radio"
                      // A shared name is what makes these one group for the
                      // keyboard. The action reads `payload` only, so the
                      // field this puts in FormData is ignored.
                      name={radioName}
                      aria-label={`Default: ${name}`}
                      checked={size.key === effectiveDefaultKey}
                      onChange={() => onDefaultChange(size.key)}
                      disabled={disabled}
                    />
                    <span className="text-sm">Default</span>
                  </label>
                  <Button
                    type="button"
                    tone="dark"
                    variant="ghost"
                    aria-label={`Remove: ${name}`}
                    onClick={() => onRemove(size.key)}
                    disabled={disabled}
                    className="min-h-11"
                  >
                    <X aria-hidden className="size-4" />
                    Remove
                  </Button>
                </div>
                {size.pesos ? (
                  <p className="text-nybb-bone/55 mt-2 text-xs">
                    Sells for {formatPeso(pesosToCents(size.pesos))}.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </fieldset>

      <Button
        type="button"
        id={`${idPrefix}-add-size`}
        tone="dark"
        variant="secondary"
        onClick={onAdd}
        disabled={disabled}
        className="mt-4 min-h-11"
      >
        <Plus aria-hidden className="size-4" />
        Add a size
      </Button>
    </section>
  );
}
