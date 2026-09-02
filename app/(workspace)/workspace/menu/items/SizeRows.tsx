"use client";

import { Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WorkspaceRadio } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  TABLE_CELL_INPUT,
  TABLE_MARK_CELL,
  TABLE_MARK_WORD,
  TABLE_ROW,
  TABLE_ROW_COLUMNS,
  TableCellLabel,
  TableHead,
  tableColumns,
  tableRowClass,
  tableRowStyle,
} from "@/components/ui/WorkspaceTable";
import { cn } from "@/lib/utils";
import { MAX_PRICE_CENTS, sizeName, type SizeDraft } from "./sizeDrafts";

/**
 * The Sizes section of the item editor: the list of rows, the strip a removed
 * row leaves behind, and the button that adds one.
 *
 * Presentational, under ruling R25. It owns no state. The list, the default
 * and the announcement all live in ItemEditor, because the payload and the
 * pre-submit gate read them, and the focus moves belong there too since only
 * it knows which row it has just changed.
 *
 * WHY IT IS A TABLE.
 * ================================================================
 * This was a wrapping flex row per size, which had the two faults every
 * form-per-record layout has and one of its own. The two: no two rows could
 * align, and "SIZE NAME", "SHORT NAME FOR THE TICKET" and "PRICE (PHP)" were
 * printed above every row. The third was worse to look at than either, because
 * the longest of those labels wrapped to two lines while its neighbours did
 * not, so the label line above each row was visibly ragged and the columns it
 * was meant to name looked misaligned even where they were not.
 *
 * It takes the Workspace table now, the same one the option groups and
 * categories screens use. See components/ui/WorkspaceTable.tsx.
 *
 * Every row's controls stay named after their size. "Default", "Remove" and
 * "Undo" repeat down the list and nothing but position tells them apart on
 * screen, which is no help to somebody who cannot see the screen and is about
 * to change which size the storefront item page opens on. Each accessible
 * name starts with the visible text, so speaking the visible label still
 * matches it (WCAG 2.5.3). The Default radio and the Remove button lose their
 * visible words at table width, where the column headers carry them, and their
 * accessible names do not shrink with them.
 */

const COLUMNS = tableColumns(
  "minmax(8rem, 2fr)", // size name
  "minmax(6rem, 1fr)", // short name
  "6.5rem", // price
  "5rem", // default, wide enough that its own column header fits in it
  "2.75rem", // remove
);

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
  return (
    <>
      {/* Removing a size swaps a row of inputs for a strip, and the focused
          button ceases to exist. Focus is moved by ItemEditor; this is what
          says out loud that anything happened. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>

      <fieldset>
        <legend className="sr-only">Sizes, one of which is the default</legend>

        <TableHead columns={COLUMNS}>
          <span>Size name</span>
          <span>Short name</span>
          <span>Price</span>
          <span className="text-center">Default</span>
          <span />
        </TableHead>

        <ul>
          {sizes.map((size, index) => {
            const name = sizeName(size, index);

            if (!size.isActive) {
              // A removed size is not a row of this table any more, so it does
              // not take the table's columns. It is one strip spanning the
              // width, which is what makes "this is not currently a size" read
              // at a glance rather than as a row with its fields missing.
              return (
                <li key={size.key} className={tableRowClass("saved")}>
                  <div className="bg-nybb-bone/5 border-nybb-bone/15 flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed px-3.5 py-2.5">
                    <p className="text-sm">
                      {size.shortLabel || size.label || "This size"}
                      <span className="text-nybb-bone/65 ml-2 text-xs">
                        {size.wasActive
                          ? "Removed. It comes off the menu when you save."
                          : "Off the menu."}
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
                  </div>
                </li>
              );
            }

            return (
              <li
                key={size.key}
                className={cn(tableRowClass("saved"), TABLE_ROW, TABLE_ROW_COLUMNS)}
                style={tableRowStyle(COLUMNS)}
              >
                <div className="min-w-0">
                  <TableCellLabel htmlFor={`${idPrefix}-${size.key}-label`}>
                    Size name
                  </TableCellLabel>
                  <WorkspaceInput
                    id={`${idPrefix}-${size.key}-label`}
                    value={size.label}
                    onChange={(event) => onUpdate(size.key, { label: event.target.value })}
                    maxLength={60}
                    placeholder="Half, 6 pieces"
                    disabled={disabled}
                    className={TABLE_CELL_INPUT}
                  />
                </div>
                <div className="min-w-0">
                  <TableCellLabel htmlFor={`${idPrefix}-${size.key}-short`}>
                    Short name
                  </TableCellLabel>
                  <WorkspaceInput
                    id={`${idPrefix}-${size.key}-short`}
                    value={size.shortLabel}
                    onChange={(event) => onUpdate(size.key, { shortLabel: event.target.value })}
                    maxLength={20}
                    placeholder="HALF"
                    disabled={disabled}
                    className={TABLE_CELL_INPUT}
                  />
                </div>
                <div className="min-w-0">
                  <TableCellLabel htmlFor={`${idPrefix}-${size.key}-price`}>
                    Price (PHP)
                  </TableCellLabel>
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
                    aria-label={`Price in pesos: ${name}`}
                    className={cn(TABLE_CELL_INPUT, "font-mono tabular-nums")}
                  />
                </div>
                <div className="flex items-center gap-2.5 lg:contents">
                  <label
                    className={cn(
                      TABLE_MARK_CELL,
                      disabled ? "cursor-not-allowed" : "cursor-pointer",
                    )}
                  >
                    <WorkspaceRadio
                      // A shared name is what makes these one group for the
                      // keyboard. The action reads `payload` only, so the
                      // field this puts in FormData is ignored.
                      name={radioName}
                      aria-label={`Default: ${name}`}
                      checked={size.key === effectiveDefaultKey}
                      onChange={() => onDefaultChange(size.key)}
                      disabled={disabled}
                    />
                    <span className={TABLE_MARK_WORD}>Default</span>
                  </label>
                  <Button
                    type="button"
                    tone="dark"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove: ${name}`}
                    onClick={() => onRemove(size.key)}
                    disabled={disabled}
                    className="min-h-11"
                  >
                    <X aria-hidden className="size-4" />
                  </Button>
                </div>
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
    </>
  );
}
