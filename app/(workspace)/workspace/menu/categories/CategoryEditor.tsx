"use client";

import { LoaderCircle, Plus, Save } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
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
import type { ManagedCategory, MenuActionState } from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuCategory } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";
import { useDirty } from "../useDirty";

const initialState: MenuActionState = { status: "idle" };

/**
 * THE SHAPE OF THIS SCREEN, AND WHY IT CHANGED.
 * ================================================================
 * Eleven categories, each of which is a name and one line of blurb, used to
 * render as eleven separate charcoal cards stacked down a 2,743px page. Each
 * card carried its own NAME and BLURB labels, its own full size DELETE
 * CATEGORY button, its own orange Save, and this sentence:
 *
 *   "One line under the category header. A description, not marketing copy."
 *
 * printed eleven times, verbatim, once per record. Two fields per record does
 * not need a card, and a rule that applies to every blurb does not need to be
 * restated beside every blurb.
 *
 * It is one table now, exactly the one the option groups screen uses and
 * DESIGN.md documents: column names printed once, rows that genuinely share a
 * set of column positions, the item count as a real column instead of a note
 * squeezed into the label line, delete as the icon-only tier at the row's
 * tail, and Save quiet until that row holds something to save.
 *
 * WHAT DELIBERATELY DID NOT CHANGE.
 * ================================================================
 * Both forms per row, their fields, their hidden inputs and their separate
 * `useActionState`s are untouched, so a failure on one row still cannot clear
 * another. This was a layout and hierarchy pass.
 */

function itemCountLabel(count: number): string {
  return `${count} item${count === 1 ? "" : "s"}`;
}

/**
 * The columns. The item count is a readout rather than a control, so it is
 * narrow and centred under a header that names it, which is where the old
 * layout's right-aligned note inside the NAME label was trying to be.
 */
const COLUMNS = tableColumns(
  "minmax(7rem, 1fr)", // name
  "minmax(10rem, 2.2fr)", // blurb
  "4.5rem", // items
  "2.75rem", // on the menu
  "6.25rem", // save
  "2.75rem", // delete
);

/**
 * One existing category: an inline save form and a guarded delete form,
 * each its own useActionState so a failure on one row, or on one of a row's
 * two forms, never clears the other.
 *
 * The delete form is a sibling holding nothing but its two hidden fields, and
 * the trash control inside the grid reaches it through the `form` attribute.
 * Forms cannot nest and the row is one grid, so this is what lets the
 * destructive action sit in the last column of the row it deletes while still
 * being a separate submission.
 */
function CategoryRow({ category }: { category: ManagedCategory }) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuCategory, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [name, setName] = useState(category.name);
  const [blurb, setBlurb] = useState(category.blurb ?? "");
  const [isActive, setIsActive] = useState(category.isActive);
  const deleteFormId = useId();
  const pending = savePending || deletePending;
  const itemCount = category.items.length;

  const dirty = useDirty({ name, blurb, isActive }, saveState);

  return (
    <div className={tableRowClass("saved")}>
      <form
        action={saveAction}
        className={cn(TABLE_ROW, TABLE_ROW_COLUMNS)}
        style={tableRowStyle(COLUMNS)}
      >
        <input type="hidden" name="id" value={category.id} />
        <div className="min-w-0">
          <TableCellLabel htmlFor={`category-name-${category.id}`}>Name</TableCellLabel>
          <WorkspaceInput
            id={`category-name-${category.id}`}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={80}
            required
            disabled={pending}
            className={TABLE_CELL_INPUT}
          />
        </div>
        <div className="min-w-0">
          <TableCellLabel htmlFor={`category-blurb-${category.id}`}>Blurb</TableCellLabel>
          <WorkspaceInput
            id={`category-blurb-${category.id}`}
            name="blurb"
            value={blurb}
            onChange={(event) => setBlurb(event.target.value)}
            maxLength={200}
            disabled={pending}
            className={TABLE_CELL_INPUT}
          />
        </div>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        {/* The count, the switch, Save and delete are four columns at table
            width and one line on a phone. Left as separate stacked blocks the
            row ran to six lines for two fields of content. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:contents">
          {/* A readout, in the numeric face, because it is a number somebody
              compares down a column. It is also the whole of what the old
              "Has 3 items. Move or delete them first." sentence carried that
              the delete dialog does not already say in its own words. */}
          <p className="text-nybb-bone/65 flex min-h-11 items-center gap-2 font-mono text-sm tabular-nums lg:justify-center">
            <span className={TABLE_MARK_WORD}>Items</span>
            {itemCount}
          </p>
          <label className={cn(TABLE_MARK_CELL, pending ? "cursor-not-allowed" : "cursor-pointer")}>
            <WorkspaceCheckbox
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={pending}
              aria-label={`On the menu: ${category.name}`}
            />
            <span className={TABLE_MARK_WORD}>On the menu</span>
          </label>
          {/* The two buttons take a line of their own on a phone. Four
              controls will not fit across 326px, and left to wrap on their own
              the trash landed alone on a second line while Save stretched
              across the first. `w-full` puts the break where it reads, and
              `lg:contents` dissolves the wrapper back into the grid. */}
          <div className="flex w-full items-center gap-2.5 lg:contents">
            <Button
              type="submit"
              tone="dark"
              variant={dirty ? "primary" : "secondary"}
              disabled={pending}
              aria-label={dirty ? `Save changes to ${category.name}` : `Save ${category.name}`}
              className="min-h-11 flex-1 px-3 lg:flex-none"
            >
              {savePending ? (
                <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Save aria-hidden className="size-4" />
              )}
              Save
            </Button>
            <ConfirmDeleteButton
              form={deleteFormId}
              iconOnly
              label="Delete category"
              triggerLabel={`Delete category: ${category.name}`}
              name={category.name}
              meta={itemCountLabel(itemCount)}
              consequence="The category goes and nothing else does. A category holding items cannot be deleted at all, so move them first if the count above is not zero."
              disabled={pending}
              pending={deletePending}
            />
          </div>
        </div>
      </form>

      {/* Carries only the two fields its action reads. The button that submits
          it lives in the grid above and finds it by id. */}
      <form id={deleteFormId} action={deleteAction}>
        <input type="hidden" name="entity" value="category" />
        <input type="hidden" name="id" value={category.id} />
      </form>

      <MenuStatusMessage state={saveState} />
      <MenuStatusMessage state={deleteState} />
    </div>
  );
}

/** A blank row at the end that adds a category. No delete, nothing to count. */
function NewCategoryRow() {
  const [state, action, pending] = useActionState(saveMenuCategory, initialState);
  const [isActive, setIsActive] = useState(true);

  return (
    <div className={tableRowClass("new")}>
      <form action={action} className={cn(TABLE_ROW, TABLE_ROW_COLUMNS)} style={tableRowStyle(COLUMNS)}>
        <div className="min-w-0">
          <TableCellLabel htmlFor="new-category-name">New category</TableCellLabel>
          <WorkspaceInput
            id="new-category-name"
            name="name"
            placeholder="New category"
            minLength={2}
            maxLength={80}
            required
            disabled={pending}
            className={TABLE_CELL_INPUT}
          />
        </div>
        <div className="min-w-0">
          <TableCellLabel htmlFor="new-category-blurb">Blurb</TableCellLabel>
          <WorkspaceInput
            id="new-category-blurb"
            name="blurb"
            maxLength={200}
            disabled={pending}
            className={TABLE_CELL_INPUT}
          />
        </div>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:contents">
          {/* Holds the count column open. A category that does not exist yet
              has nothing in it, and a zero here would read as a fact rather
              than as the absence of one. */}
          <div aria-hidden className="hidden lg:block" />
          <label className={cn(TABLE_MARK_CELL, pending ? "cursor-not-allowed" : "cursor-pointer")}>
            <WorkspaceCheckbox
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={pending}
              aria-label="On the menu"
            />
            <span className={TABLE_MARK_WORD}>On the menu</span>
          </label>
          <Button
            type="submit"
            tone="dark"
            variant="primary"
            disabled={pending}
            className="min-h-11 flex-1 px-3 lg:col-span-2 lg:flex-none"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Plus aria-hidden className="size-4" />
            )}
            Add
          </Button>
        </div>
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}

export function CategoryEditor({ categories }: { categories: ManagedCategory[] }) {
  return (
    <div className="bg-nybb-charcoal mt-7 rounded-md p-4 sm:p-5">
      <TableHead columns={COLUMNS}>
        <span>Name</span>
        <span>Blurb</span>
        <span className="text-center">Items</span>
        <span className="text-center">On</span>
        <span />
        <span />
      </TableHead>
      {categories.map((category) => (
        <CategoryRow key={category.id} category={category} />
      ))}
      <NewCategoryRow />
      {/* Said once for the table. It was printed under all eleven rows, which
          is eleven copies of a rule that has never varied by category. */}
      <p className="text-nybb-bone/65 mt-3 text-xs">
        The blurb is the one line under the category header on the storefront. A description, not
        marketing copy.
      </p>
    </div>
  );
}
