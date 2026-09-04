"use client";

import { ChevronDown, LoaderCircle, Plus, Save, Settings2 } from "lucide-react";
import Image from "next/image";
import { useActionState, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceNumberInput } from "@/components/ui/WorkspaceNumberInput";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
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
import type {
  ManagedCategory,
  ManagedOption,
  ManagedOptionGroup,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuOption, saveMenuOptionGroup } from "../actions";
import { ImageField } from "../items/ImageField";
import { pesosToCents } from "../items/sizeDrafts";
import { MenuStatusMessage } from "../MenuStatusMessage";
import { useDirty } from "../useDirty";

const initialState: MenuActionState = { status: "idle" };

/**
 * THE SHAPE OF THIS SCREEN, AND WHY IT CHANGED.
 * ================================================================
 * This page manages two groups holding fifteen options between them, and the
 * first cut rendered every one of them as an independent inline form in a
 * `flex-wrap` row. Measured on the real menu that came to 7,372px on a 1440
 * desktop and 14,832px on a phone, and the height was the least of it:
 *
 *   - The column labels (NAME, DESCRIPTION, PRICING, HEAT %) were printed
 *     fifteen times, once above every field of every row. Three lines of label
 *     text between one option's name and the next is precisely what stops an
 *     eye running down a column, so the one thing a person comes here to do,
 *     find a flavour by name, was the thing the layout prevented.
 *   - Rows could not align with each other even in principle. A wrapping flex
 *     row sizes itself from its own contents, so a row that showed an amount
 *     field sat differently from one that did not.
 *   - Seventeen Save buttons carried the brand orange. DESIGN.md's One Loud
 *     Thing Rule survives one loud control per view, not seventeen; repeated
 *     that many times the colour stops meaning "this is the action" and starts
 *     meaning "this is a form".
 *   - Every option carried a permanently mounted, full size DELETE OPTION
 *     button. The rarest and most destructive action on the screen had the
 *     same weight as Save and appeared fifteen times.
 *   - `showPhoto` opened the crop editor for any option that already had a
 *     photograph, so nine flavour photo editors were open on load. That alone
 *     was about 3,000px, and its stated purpose (let somebody see a photo is
 *     there without clicking) is a job for a thumbnail.
 *   - DELETE GROUP sat between the group's own fields and its options, ruled
 *     off on both sides, which is the most isolated position on the card.
 *
 * So the options are now what they always were, a table: one grid template
 * shared by the header row and every option row, column names printed once,
 * and per-cell labels kept for assistive technology and for the stacked
 * layout below `lg`. The group stopped being a peer of its own rows and became
 * a heading with a summary line, its fields behind a disclosure, and its
 * delete moved to the foot of the card where a destructive action belongs.
 *
 * WHAT DELIBERATELY DID NOT CHANGE.
 * ================================================================
 * Every form's fields, names, hidden inputs and Server Action are untouched,
 * as are the separate `useActionState`s per form that keep one failure from
 * clearing another. This was a layout and hierarchy pass; the wire format is
 * exactly what it was.
 */

/**
 * The three states a price can be in. Never a plain number, because a plain
 * number cannot tell "free" apart from "priced by size": both would have to
 * render as some kind of empty or zero, and they mean opposite things.
 */
type PricingMode = "free" | "flat" | "bySize";

const pricingOptions: readonly WorkspaceSelectOption<PricingMode>[] = [
  { value: "free", label: "Free" },
  { value: "flat", label: "Adds an amount" },
  { value: "bySize", label: "Priced by size" },
];

/**
 * Reads an option's saved price_cents back into the three way choice. Null
 * is "priced by size", never "free": nothing here or downstream may coalesce
 * null to 0. See the comment on ManagedOption.priceCents and on
 * menu_options.price_cents itself.
 */
function pricingModeFor(priceCents: number | null): PricingMode {
  if (priceCents === null) return "bySize";
  if (priceCents === 0) return "free";
  return "flat";
}

/** cents -> the string a pesos input should show. Empty for anything non-positive. */
function centsToPesosInput(cents: number | null): string {
  if (!cents || cents <= 0) return "";
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

function usedByLabel(linkedItemIds: string[], itemNameById: Map<string, string>): string {
  if (linkedItemIds.length === 0) return "Not used by any item yet";
  const names = linkedItemIds.map((id) => itemNameById.get(id) ?? "an item");
  return `Used by ${names.join(", ")}`;
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The group's pricing in one phrase, read off the options rather than
 * declared anywhere. It is the fact a person wants from a group they have not
 * opened: whether this is a free choice like flavour, or one that adds money.
 */
function pricingSummary(options: ManagedOption[]): string | null {
  if (options.length === 0) return null;
  const modes = new Set(options.map((option) => pricingModeFor(option.priceCents)));
  const parts: string[] = [];
  if (modes.has("free")) parts.push("free");
  if (modes.has("flat")) parts.push("adds an amount");
  if (modes.has("bySize")) parts.push("priced by size");
  if (parts.length === 1) return parts[0]!.replace(/^./, (c) => c.toUpperCase());
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`.replace(/^./, (c) => c.toUpperCase());
}

/**
 * This table's columns. The mechanics of a Workspace table, and the reason
 * the header and the rows have to take their widths from one call, are in
 * components/ui/WorkspaceTable.tsx.
 *
 * Heat is a group level decision (see OptionGroupCard's `showHeat`) rather
 * than a per-row one, so every row inside a group agrees about it and the
 * header agrees with them.
 */
function optionColumns({ showAmount, showHeat }: ColumnSet): string {
  return tableColumns(
    "2.75rem", // photograph
    "minmax(6rem, 1.15fr)", // name
    "minmax(8rem, 1.9fr)", // description
    "10rem", // pricing, sized so "Priced by size" is not clipped
    showAmount && "5.5rem", // amount
    showHeat && "4.25rem", // heat
    "2.75rem", // offered
    "6.25rem", // save
    "2.75rem", // delete
  );
}

/**
 * Which of the two optional columns this group is currently showing.
 *
 * Both are group level rather than row level, and they have to be, because a
 * column that appeared on only the rows that used it would not be a column.
 * `showHeat` is a standing decision somebody makes once. `showAmount` follows
 * the data: it is open when any option in the group adds a fixed amount, and
 * it opens the moment somebody picks "Adds an amount" on any row, which is why
 * OptionGroupCard has to hear about that choice rather than each row keeping it
 * to itself. Holding the column open unconditionally was the alternative, and
 * on the flavour group, where nothing will ever charge, it left a permanently
 * empty 88px track with a header over it.
 */
type ColumnSet = { showAmount: boolean; showHeat: boolean };

/**
 * A whole option row's body: the photograph, the six fields, and the slot the
 * caller's Save (or Add) and delete land in.
 *
 * Both priceCents and heatPercent follow the identical pattern: one
 * unconditional hidden input that always reaches FormData under the field's
 * real name, and a visible input, rendered only when relevant, that carries
 * no name of its own and is purely for editing. Whether the visible control
 * is mounted can never change what gets submitted, because only the hidden
 * input has a name. This is deliberate: a heat field that is hidden because
 * the group has no heat yet must still submit whatever value it already
 * holds (usually none), not silently omit the field and have the server
 * read that omission as "clear it".
 *
 * TWO LAYOUTS, ONE DOM.
 * ================================================================
 * The cells are grouped into four wrappers carrying `lg:contents`. Below `lg`
 * those wrappers are real: the thumbnail sits beside the name, the pricing
 * fields share a line, and Offered, Save and delete share the last one, which
 * is what keeps a phone row four lines rather than eight stacked full-width
 * controls with a lone trash button underneath them. From `lg` up,
 * `display: contents` dissolves all four and their children become direct
 * items of the row's grid, in exactly the order the header names them.
 *
 * That is why the row body is one component rather than something the caller
 * assembles: the wrappers only hold if every cell is emitted in one place in
 * grid order, and a caller inserting its own Save between two of them would
 * break the columns for that row alone.
 */
function OptionFieldset({
  idPrefix,
  rowName,
  nameLabel,
  namePlaceholder,
  name,
  onNameChange,
  description,
  onDescriptionChange,
  pricing,
  onPricingChange,
  amount,
  onAmountChange,
  columns,
  heatPercent,
  onHeatPercentChange,
  isActive,
  onIsActiveChange,
  disabled,
  photo,
  actions,
}: {
  idPrefix: string;
  /** How this row names itself on the controls the header labels visually. */
  rowName: string;
  nameLabel: string;
  namePlaceholder?: string;
  name: string;
  onNameChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  pricing: PricingMode;
  onPricingChange: (mode: PricingMode) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  columns: ColumnSet;
  heatPercent: string;
  onHeatPercentChange: (value: string) => void;
  isActive: boolean;
  onIsActiveChange: (checked: boolean) => void;
  disabled: boolean;
  /** The thumbnail control, or the blank that holds its column on a new row. */
  photo: React.ReactNode;
  /** Save or Add, and the delete control when the row has something to delete. */
  actions: React.ReactNode;
}) {
  // Whatever the amount field holds is only meaningful when pricing is
  // "flat". Free and priced-by-size both send a fixed value here instead of
  // whatever the amount state contains, and the server transform ignores
  // this field for both cases anyway, deriving resolvedPriceCents from
  // pricing alone. Two independent guards against the same mistake.
  const priceCentsToSend = pricing === "flat" ? String(pesosToCents(amount)) : "0";

  return (
    <>
      <div className="flex items-end gap-3 lg:contents">
        {photo}
        <div className="min-w-0 flex-1">
          <TableCellLabel htmlFor={`${idPrefix}-name`}>{nameLabel}</TableCellLabel>
          <WorkspaceInput
            id={`${idPrefix}-name`}
            name="name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={namePlaceholder}
            maxLength={100}
            required
            disabled={disabled}
            className={TABLE_CELL_INPUT}
          />
        </div>
      </div>

      <div className="min-w-0">
        <TableCellLabel htmlFor={`${idPrefix}-description`}>Description</TableCellLabel>
        <WorkspaceInput
          id={`${idPrefix}-description`}
          name="description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          maxLength={300}
          disabled={disabled}
          className={TABLE_CELL_INPUT}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2.5 lg:contents">
        <WorkspaceSelect
          id={`${idPrefix}-pricing`}
          name="pricing"
          label="Pricing"
          labelClassName="lg:sr-only"
          controlClassName="mt-1.5 lg:mt-0"
          options={pricingOptions}
          value={pricing}
          onValueChange={(value) => {
            if (value) onPricingChange(value);
          }}
          disabled={disabled}
          className="min-w-40 flex-1 lg:min-w-0 lg:flex-none"
        />
        {/* Rendered whenever the group is showing the column, and holding
            nothing unless this particular option adds money. Letting the cell
            collapse instead would shunt every column after it left on that one
            row, which is the alignment failure the grid exists to remove. */}
        {columns.showAmount ? (
          <div className="w-28 lg:w-auto lg:min-w-0">
            {pricing === "flat" ? (
              <>
                <TableCellLabel htmlFor={`${idPrefix}-amount`}>Amount</TableCellLabel>
                <WorkspaceNumberInput
                  id={`${idPrefix}-amount`}
                  shape="pesos"
                  value={amount}
                  onValueChange={onAmountChange}
                  disabled={disabled}
                  aria-label={`Amount in pesos for ${rowName}`}
                  className={cn(TABLE_CELL_INPUT, "font-mono tabular-nums")}
                />
              </>
            ) : null}
          </div>
        ) : null}
        {columns.showHeat ? (
          <div className="w-24 lg:w-auto lg:min-w-0">
            <TableCellLabel htmlFor={`${idPrefix}-heat`}>Heat %</TableCellLabel>
            <WorkspaceNumberInput
              id={`${idPrefix}-heat`}
              shape="integer"
              value={heatPercent}
              onValueChange={onHeatPercentChange}
              disabled={disabled}
              aria-label={`Heat percent for ${rowName}`}
              className={cn(TABLE_CELL_INPUT, "font-mono tabular-nums")}
            />
          </div>
        ) : null}
      </div>

      {/* Unconditional: see the note above. priceCentsToSend is "0" whenever
          pricing is not "flat", and the server transform never reads this
          field except in that one branch, so this can never send a stray
          amount for a free or priced-by-size option. */}
      <input type="hidden" name="priceCents" value={priceCentsToSend} />
      {/* Unconditional, same reasoning: this must reach FormData whether or
          not the visible control is mounted, or hiding the field (because the
          group has no heat open yet) would read as "clear this option's heat"
          and wipe an already saved value. */}
      <input type="hidden" name="heatPercent" value={heatPercent} />
      <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />

      <div className="flex items-center gap-2.5 lg:contents">
        {/* "Offered" is printed by the column header once, so the fifteen
            boxes under it carry an aria-label naming their own row instead. A
            checkbox in a bordered plate the size of a text input, as this was,
            reads as heavily as the option's name, and a boolean should not
            weigh the same as the thing it is about. The 44px cell keeps the
            target on the floor the system states even though the mark is 22. */}
        <label className={cn(TABLE_MARK_CELL, disabled ? "cursor-not-allowed" : "cursor-pointer")}>
          <WorkspaceCheckbox
            checked={isActive}
            onChange={(event) => onIsActiveChange(event.target.checked)}
            disabled={disabled}
            aria-label={`Offered: ${rowName}`}
          />
          <span className={TABLE_MARK_WORD}>Offered</span>
        </label>
        {actions}
      </div>
    </>
  );
}

/**
 * The column names, printed once above the rows instead of once inside each
 * of them. Only from `lg`, which is the width at which the grid engages.
 */
function OptionsHeaderRow({ columns }: { columns: ColumnSet }) {
  return (
    <TableHead columns={optionColumns(columns)}>
      {/* The photograph column is named by its own cells and not up here. The
          word does not fit a 44px track at the label's tracking, and it ran
          into "Name" in the cell beside it; a column of thumbnails needs no
          caption to be understood anyway. */}
      <span />
      <span>Name</span>
      <span>Description</span>
      <span>Pricing</span>
      {columns.showAmount ? <span>Amount</span> : null}
      {columns.showHeat ? <span>Heat %</span> : null}
      <span className="text-center">On</span>
      <span />
      <span />
    </TableHead>
  );
}

/**
 * The photograph as a 44px square at the head of the row, and the control
 * that opens the crop editor underneath it.
 *
 * This replaces a `showPhoto` that defaulted open for any option that already
 * had one. The intent behind that default was right (nobody should have to
 * click to find out whether a photo exists) and the cost was nine crop
 * editors stacked down the page. A thumbnail answers the same question in
 * 44px, and an empty frame answers the opposite one, which the old default
 * could not do at all: a flavour with no photograph looked identical to a
 * heat level that will never have one.
 */
function PhotoCell({
  image,
  open,
  onToggle,
  optionName,
  panelId,
}: {
  image: ManagedOption["image"];
  open: boolean;
  onToggle: () => void;
  optionName: string;
  panelId: string;
}) {
  return (
    <div className="min-w-0">
      <TableCellLabel htmlFor={`${panelId}-toggle`}>Photo</TableCellLabel>
      <button
        id={`${panelId}-toggle`}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          image
            ? `${open ? "Hide" : "Edit"} the photograph for ${optionName}`
            : `Add a photograph for ${optionName}`
        }
        className={cn(
          "group relative mt-1.5 grid size-11 shrink-0 place-items-center overflow-hidden rounded-md lg:mt-0",
          "transition-[border-color,background-color,transform] duration-200 ease-out",
          "active:scale-[0.98] motion-reduce:active:scale-100",
          image
            ? "bg-nybb-orange"
            : "border-nybb-bone/40 hover:border-nybb-bone/75 border border-dashed bg-transparent",
          open ? "outline-nybb-orange outline-2 outline-offset-2" : null,
        )}
      >
        {image ? (
          <Image src={image.src} alt="" fill sizes="44px" className="object-cover" />
        ) : (
          // A dashed empty frame with a plus, not a crossed-out picture. Six
          // "missing image" glyphs down the heat group would report a fault
          // where there is none: a heat level is never going to carry a
          // photograph, and the frame reads as a slot rather than as a loss.
          <Plus aria-hidden className="text-nybb-bone/45 group-hover:text-nybb-bone size-4" />
        )}
      </button>
    </div>
  );
}

/**
 * One existing option: an inline save form and a guarded delete form, each
 * its own useActionState, matching CategoryRow's established pattern so a
 * failure on one never clears the other.
 *
 * The delete form is a sibling of the save form holding nothing but its two
 * hidden fields, and the trash control inside the grid reaches it through the
 * `form` attribute. Forms cannot nest and the row is one grid, so this is what
 * lets the destructive action occupy the last column of the row it deletes
 * while still being a genuinely separate submission.
 *
 * showHeat is a group level decision (does any option here carry a heat
 * percent, or did the person open "Advanced"), passed down so every row in a
 * group agrees on whether the heat field is worth showing.
 */
function OptionRow({
  option,
  groupId,
  groupName,
  columns,
  onPricingModeChange,
}: {
  option: ManagedOption;
  groupId: string;
  /** Only for the delete confirmation, which names the group the choice sits in. */
  groupName: string;
  columns: ColumnSet;
  /** Tells the group whether this row still wants the amount column. */
  onPricingModeChange: (mode: PricingMode) => void;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuOption, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [name, setName] = useState(option.name);
  const [description, setDescription] = useState(option.description ?? "");
  const [pricing, setPricing] = useState<PricingMode>(() => pricingModeFor(option.priceCents));
  const [amount, setAmount] = useState(() => centsToPesosInput(option.priceCents));
  const [heatPercent, setHeatPercent] = useState(option.heatPercent !== null ? String(option.heatPercent) : "");
  const [isActive, setIsActive] = useState(option.isActive);
  const [showPhoto, setShowPhoto] = useState(false);
  const panelId = useId();
  const deleteFormId = useId();
  const pending = savePending || deletePending;

  const current = { name, description, pricing, amount, heatPercent, isActive };
  const dirty = useDirty(current, saveState);

  function choosePricing(mode: PricingMode) {
    setPricing(mode);
    onPricingModeChange(mode);
  }

  return (
    <div className={tableRowClass("saved")}>
      <form
        action={saveAction}
        className={cn(TABLE_ROW, TABLE_ROW_COLUMNS)}
        style={tableRowStyle(optionColumns(columns))}
      >
        <input type="hidden" name="id" value={option.id} />
        <input type="hidden" name="groupId" value={groupId} />
        <OptionFieldset
          idPrefix={`option-${option.id}`}
          rowName={option.name}
          nameLabel="Name"
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          pricing={pricing}
          onPricingChange={choosePricing}
          amount={amount}
          onAmountChange={setAmount}
          columns={columns}
          heatPercent={heatPercent}
          onHeatPercentChange={setHeatPercent}
          isActive={isActive}
          onIsActiveChange={setIsActive}
          disabled={pending}
          photo={
            <PhotoCell
              image={option.image}
              open={showPhoto}
              onToggle={() => setShowPhoto((value) => !value)}
              optionName={option.name}
              panelId={panelId}
            />
          }
          actions={
            <>
              <RowSaveButton dirty={dirty} pending={savePending} disabled={pending} rowName={option.name} />
              <ConfirmDeleteButton
                form={deleteFormId}
                iconOnly
                label="Delete option"
                triggerLabel={`Delete option: ${option.name}`}
                name={option.name}
                meta={groupName}
                consequence="The choice disappears from this group, and from every item that offers the group. An option any past order references cannot be deleted, so mark it unavailable instead."
                disabled={pending}
                pending={deletePending}
              />
            </>
          }
        />
      </form>

      {/* Carries only the two fields its action reads. The button that submits
          it lives in the grid above and finds it by id. */}
      <form id={deleteFormId} action={deleteAction}>
        <input type="hidden" name="entity" value="option" />
        <input type="hidden" name="id" value={option.id} />
      </form>

      <MenuStatusMessage state={saveState} />
      <MenuStatusMessage state={deleteState} />

      <div id={panelId} hidden={!showPhoto} className="mt-3">
        <ImageField target={{ kind: "option", optionId: option.id }} image={option.image} />
      </div>
    </div>
  );
}

/**
 * Save, at the weight the row currently deserves. See useDirty.
 *
 * The words stay whatever happens, because this is the commit and an icon
 * alone would make the one irreversible-feeling control on the row ambiguous.
 * Only the fill moves.
 */
function RowSaveButton({
  dirty,
  pending,
  disabled,
  rowName,
}: {
  dirty: boolean;
  pending: boolean;
  disabled: boolean;
  rowName: string;
}) {
  return (
    <Button
      type="submit"
      tone="dark"
      variant={dirty ? "primary" : "secondary"}
      disabled={disabled}
      aria-label={dirty ? `Save changes to ${rowName}` : `Save ${rowName}`}
      className="min-h-11 flex-1 px-3 lg:flex-none"
    >
      {pending ? (
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      ) : (
        <Save aria-hidden className="size-4" />
      )}
      Save
    </Button>
  );
}

/**
 * A blank row at the end of a group that adds a new option to it.
 *
 * It takes the same grid as the rows above so its fields land under the same
 * headers, and a dashed rule rather than the solid one the real rows carry,
 * which is the same distinction NewOptionGroupCard draws at card scale.
 */
function NewOptionRow({
  groupId,
  columns,
  onPricingModeChange,
}: {
  groupId: string;
  columns: ColumnSet;
  onPricingModeChange: (mode: PricingMode) => void;
}) {
  const [state, action, pending] = useActionState(saveMenuOption, initialState);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricing, setPricing] = useState<PricingMode>("free");
  const [amount, setAmount] = useState("");
  const [heatPercent, setHeatPercent] = useState("");
  const [isActive, setIsActive] = useState(true);

  return (
    <div className={tableRowClass("new")}>
      <form
        action={action}
        className={cn(TABLE_ROW, TABLE_ROW_COLUMNS)}
        style={tableRowStyle(optionColumns(columns))}
      >
        <input type="hidden" name="groupId" value={groupId} />
        <OptionFieldset
          idPrefix={`new-option-${groupId}`}
          rowName="the new option"
          nameLabel="New option"
          namePlaceholder="New option"
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          pricing={pricing}
          onPricingChange={(mode) => {
            setPricing(mode);
            onPricingModeChange(mode);
          }}
          amount={amount}
          onAmountChange={setAmount}
          columns={columns}
          heatPercent={heatPercent}
          onHeatPercentChange={setHeatPercent}
          isActive={isActive}
          onIsActiveChange={setIsActive}
          disabled={pending}
          photo={
            // Nothing to show and nothing to attach one to yet: the option has
            // to exist before Storage has a row to key an upload against. The
            // blank holds the column so the new row's fields stay under the
            // same headers as the saved ones above it.
            <div aria-hidden className="hidden size-11 shrink-0 lg:block" />
          }
          actions={
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
          }
        />
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}

/**
 * One existing option group.
 *
 * The card now reads top to bottom as identity, then contents, then the one
 * destructive thing:
 *
 *   1. A heading in the display face with a summary line under it: how many
 *      options, how they are priced, and which items offer the group. That is
 *      what somebody scanning two groups actually needs, and none of it was
 *      legible before because the group's name lived inside a text input that
 *      looked exactly like the fifteen text inputs beneath it.
 *   2. The group's own fields, behind a disclosure. They are edited about
 *      once in the life of a group, and leaving them open cost two inputs, a
 *      checkbox and a fourth Save button per group on every visit.
 *   3. The options table.
 *   4. Delete group, at the foot, after the thing it would delete.
 *
 * "On the menu" stays in the header rather than going behind the disclosure,
 * because switching a whole group off is a real and repeated task. Its
 * checkbox is not in the form at all: the form reads the hidden isActive
 * field, exactly as before, so the visible control is free to live wherever
 * the layout wants it.
 */
function OptionGroupCard({
  group,
  itemNameById,
}: {
  group: ManagedOptionGroup;
  itemNameById: Map<string, string>;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveMenuOptionGroup, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [isActive, setIsActive] = useState(group.isActive);
  const [editRequested, setEditRequested] = useState(false);
  // Nine wing flavours carry no heat and a heat input on each of them is
  // noise, so it stays hidden unless this group already has one, or the
  // person deliberately asks for it.
  const [showHeat, setShowHeat] = useState(() => group.options.some((option) => option.heatPercent !== null));
  // Which rows currently want the amount column. Seeded from what is saved,
  // then kept up to date by the rows themselves, because a column has to be a
  // property of the table and not of whichever row happened to open it. See
  // the note on ColumnSet.
  const [flatRows, setFlatRows] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      group.options.map((option) => [option.id, pricingModeFor(option.priceCents) === "flat"]),
    ),
  );
  const columns: ColumnSet = {
    showAmount: Object.values(flatRows).some(Boolean),
    showHeat,
  };

  function reportPricing(rowKey: string) {
    return (mode: PricingMode) => {
      setFlatRows((current) => ({ ...current, [rowKey]: mode === "flat" }));
    };
  }
  const panelId = useId();
  const pending = savePending || deletePending;
  const linkedCount = group.linkedItemIds.length;

  const dirty = useDirty({ name, description, isActive }, saveState);
  // Toggling "On the menu" while the panel is shut would otherwise leave the
  // change with nowhere to be committed. Opening on dirt puts the Save button
  // on screen at the moment there is finally something to press it for.
  const editOpen = editRequested || dirty;

  const summary = [
    countLabel(group.options.length, "option"),
    pricingSummary(group.options),
    showHeat ? "Has a heat level" : null,
    usedByLabel(group.linkedItemIds, itemNameById),
  ].filter(Boolean);

  const hasBySize = group.options.some((option) => option.priceCents === null);

  return (
    <article className="bg-nybb-charcoal rounded-md p-4 sm:p-5">
      {/* Stacks below `sm` rather than wrapping. As a flex row with a shrinking
          first child, a 390px phone squeezed the heading into about 55px and
          broke FLAVOUR across three lines while the controls beside it kept
          their full width. The group's name is the one thing on this card that
          must not be hard to read. */}
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
        <div className="min-w-0 sm:flex-1">
          <h2 className="font-display heading-minor break-words">{group.name}</h2>
          <p className="text-nybb-bone/65 mt-1.5 text-sm">
            {summary.map((part, index) => (
              // Each fact is one unbreakable phrase. Left to wrap freely the
              // line came apart mid-fact on a phone, reading "9 / options /
              // Free / Used / by / Chicken / Wings" down seven lines.
              <span key={part} className="inline-block whitespace-nowrap">
                {/* bone/55 and not lower. The separator is rendered text, so it
                    answers to 4.5:1 like any other: /35 measured 2.97 against
                    charcoal and /55 measures 5.45, which still sits a step
                    behind the /65 facts it divides. */}
                {index > 0 ? <span className="text-nybb-bone/55 px-1.5">/</span> : null}
                {part}
              </span>
            ))}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
            <WorkspaceCheckbox
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              disabled={pending}
              aria-label={`On the menu: ${group.name}`}
            />
            <span className="text-sm">On the menu</span>
          </label>
          {showHeat ? null : (
            <Button
              type="button"
              tone="dark"
              variant="ghost"
              onClick={() => setShowHeat(true)}
              className="min-h-11 px-3"
            >
              <Settings2 aria-hidden className="size-4" />
              Show heat level
            </Button>
          )}
          <Button
            type="button"
            tone="dark"
            variant="ghost"
            onClick={() => setEditRequested((value) => !value)}
            aria-expanded={editOpen}
            aria-controls={panelId}
            className="min-h-11 px-3"
          >
            Edit group
            <ChevronDown
              aria-hidden
              className={cn(
                "size-4 transition-transform duration-150 motion-reduce:transition-none",
                editOpen ? "rotate-180" : null,
              )}
            />
          </Button>
        </div>
      </header>

      {/* Hidden with the attribute, never unmounted. The name field is
          `required` and the hidden isActive field is what the action reads, so
          a disclosure that took them out of the DOM would submit a group with
          no name the first time somebody flipped the switch while it was shut.
          `display: none` also takes the fields out of the tab order for free,
          which is the other half of what a disclosure has to do. */}
      <div
        id={panelId}
        hidden={!editOpen}
        className="border-nybb-bone/15 mt-4 border-t pt-4"
      >
        <form action={saveAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={group.id} />
          <div className="min-w-48 flex-1">
            <WorkspaceFieldLabel htmlFor={`group-name-${group.id}`}>Name</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`group-name-${group.id}`}
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              minLength={2}
              maxLength={100}
              required
              disabled={pending}
            />
          </div>
          <div className="min-w-64 flex-[2]">
            <WorkspaceFieldLabel htmlFor={`group-description-${group.id}`}>Description</WorkspaceFieldLabel>
            <WorkspaceInput
              id={`group-description-${group.id}`}
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={300}
              disabled={pending}
            />
          </div>
          <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
          <Button
            type="submit"
            tone="dark"
            variant={dirty ? "primary" : "secondary"}
            disabled={pending}
            className="min-h-11"
          >
            {savePending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            Save group
          </Button>
        </form>
      </div>
      <MenuStatusMessage state={saveState} />

      {/* The rule is where the group's identity stops and its contents start.
          The column headers sit inside the table, under it. */}
      <div className="border-nybb-bone/15 mt-4 border-t pt-4">
        <OptionsHeaderRow columns={columns} />
        {group.options.map((option) => (
          <OptionRow
            key={option.id}
            option={option}
            groupId={group.id}
            groupName={group.name}
            columns={columns}
            onPricingModeChange={reportPricing(option.id)}
          />
        ))}
        <NewOptionRow
          groupId={group.id}
          columns={columns}
          onPricingModeChange={reportPricing("new")}
        />
        {/* Said once for the group instead of once under every by-size row,
            which is where it used to live and where it was printed five times
            in the heat group alone. It is a fact about how this group is
            priced, not about any single choice in it. */}
        {hasBySize ? (
          <p className="text-nybb-bone/65 mt-3 text-xs">
            Options priced by size take their amounts on each item that offers this group, not here.
          </p>
        ) : null}
      </div>

      <div className="border-nybb-bone/15 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-4">
        <form action={deleteAction}>
          <input type="hidden" name="entity" value="optionGroup" />
          <input type="hidden" name="id" value={group.id} />
          <ConfirmDeleteButton
            label="Delete group"
            name={group.name}
            meta={countLabel(group.options.length, "option")}
            consequence="The group and every choice inside it go together. A group still linked to an item cannot be deleted, so unlink it everywhere first."
            disabled={pending}
            pending={deletePending}
          />
        </form>
        {linkedCount > 0 ? (
          <span className="text-nybb-bone/65 text-xs">
            Linked to {countLabel(linkedCount, "item")}. Unlink them first.
          </span>
        ) : null}
      </div>
      <MenuStatusMessage state={deleteState} />
    </article>
  );
}

/** A blank card at the end that adds a new option group. No delete, no options yet. */
function NewOptionGroupCard() {
  const [state, action, pending] = useActionState(saveMenuOptionGroup, initialState);
  const [isActive, setIsActive] = useState(true);

  return (
    <article className="border-nybb-bone/30 rounded-md border border-dashed p-4 sm:p-5">
      <h2 className="type-caps text-nybb-bone/55">New option group</h2>
      <form action={action} className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <WorkspaceFieldLabel htmlFor="new-group-name">Name</WorkspaceFieldLabel>
          <WorkspaceInput id="new-group-name" name="name" minLength={2} maxLength={100} required disabled={pending} />
        </div>
        <div className="min-w-64 flex-[2]">
          <WorkspaceFieldLabel htmlFor="new-group-description">Description</WorkspaceFieldLabel>
          <WorkspaceInput id="new-group-description" name="description" maxLength={300} disabled={pending} />
        </div>
        <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
          <WorkspaceCheckbox
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            disabled={pending}
            aria-label="On the menu"
          />
          <span className="text-sm">On the menu</span>
        </label>
        <input type="hidden" name="isActive" value={isActive ? "true" : "false"} />
        <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Plus aria-hidden className="size-4" />
          )}
          Add group
        </Button>
      </form>
      <p className="text-nybb-bone/65 mt-2 text-xs">Add its options once the group itself is saved.</p>
      <MenuStatusMessage state={state} />
    </article>
  );
}

export function OptionGroupEditor({
  optionGroups,
  categories,
}: {
  optionGroups: ManagedOptionGroup[];
  categories: ManagedCategory[];
}) {
  // So the "used by" line can name items rather than print ids: flattened
  // once per render of the whole list, not once per group.
  const itemNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) {
      for (const item of category.items) {
        map.set(item.id, item.name);
      }
    }
    return map;
  }, [categories]);

  return (
    <div className="mt-7 space-y-4">
      {optionGroups.map((group) => (
        <OptionGroupCard key={group.id} group={group} itemNameById={itemNameById} />
      ))}
      <NewOptionGroupCard />
    </div>
  );
}
