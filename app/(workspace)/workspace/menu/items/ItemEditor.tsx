"use client";

import { LoaderCircle, Plus, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { formatPeso } from "@/lib/format";
import type {
  ManagedCategory,
  ManagedItem,
  ManagedOptionGroup,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuItem } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

/** cents -> the string a pesos input should show. Empty for a price of nothing. */
function centsToPesosInput(cents: number): string {
  if (!cents || cents <= 0) return "";
  const pesos = cents / 100;
  return Number.isInteger(pesos) ? String(pesos) : pesos.toFixed(2);
}

/**
 * The one place pesos, what the owner types, becomes centavos, what the
 * database stores. Every price on this screen passes through here exactly
 * once, when the payload is built, and nothing else in this file multiplies
 * or divides a money value.
 *
 * A blank or unparsable input is 0, not an error. A free size is a real thing
 * and the RPC accepts 0, so there is nothing to refuse here.
 */
function pesosToCents(pesos: string): number {
  const value = Number.parseFloat(pesos);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

/**
 * One size, as the form holds it while it is being edited.
 *
 * `key` is this row's identity inside React and has nothing to do with the
 * database. `id` is the saved row's id, empty for a size that has never been
 * saved, and it is what tells removal's two cases apart.
 *
 * `wasActive` is the state the row arrived in, kept only so a removed row can
 * say the right thing: a row the person just took off says "Removed", and a
 * row that was already off when the page loaded says so plainly instead of
 * pretending this visit did it.
 *
 * There is deliberately no isDefault here. The default is one value for the
 * whole list, held once in `defaultKey`, because "exactly one" is a property
 * of the list and a flag per row can hold zero of them or five.
 */
type SizeDraft = {
  key: string;
  id: string;
  label: string;
  shortLabel: string;
  pesos: string;
  isActive: boolean;
  wasActive: boolean;
};

function blankSize(key: string): SizeDraft {
  return { key, id: "", label: "", shortLabel: "", pesos: "", isActive: true, wasActive: true };
}

/** The saved sizes as draft rows, or one blank row for an item that has none. */
function sizesFrom(item: ManagedItem | null): SizeDraft[] {
  if (!item || item.variations.length === 0) return [blankSize("new-0")];
  return item.variations.map((variation) => ({
    key: variation.id,
    id: variation.id,
    label: variation.label,
    shortLabel: variation.shortLabel,
    pesos: centsToPesosInput(variation.priceCents),
    isActive: variation.isActive,
    wasActive: variation.isActive,
  }));
}

/**
 * Which row the default radio starts on. An inactive saved default is not
 * chosen here, because the server only counts active elements and the form
 * has to start in a state it would accept.
 */
function defaultKeyFrom(item: ManagedItem | null): string {
  const chosen =
    item?.variations.find((variation) => variation.isDefault && variation.isActive) ??
    item?.variations.find((variation) => variation.isActive);
  return chosen?.id ?? "";
}

/**
 * Which saved sizes exist, as one string.
 *
 * Its only job is to notice that the set of saved rows changed underneath the
 * form. See the re-seed in ItemEditor.
 */
function variationSignature(item: ManagedItem | null): string {
  return (item?.variations ?? []).map((variation) => variation.id).join(",");
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The create and the edit screen, which are one screen. `item` is null on the
 * create route and a saved item on the edit route; nothing else differs.
 *
 * WHY ONE FORM AND ONE JSON FIELD.
 *
 * The item, its sizes and its option group links save in one call, because
 * staff_save_menu_item is one call: an interrupted edit that saved the item
 * but not its sizes would put an unorderable thing on the menu. So the sizes
 * are a list in React state, not a row of independent little forms, and the
 * whole state posts as one `payload` field carrying JSON. Indexed field names
 * (variations, then an index, then a key) would have to be reassembled out of
 * FormData keys, and a name that only exists in one branch of a conditional
 * goes missing from the submission without typecheck, lint or a test noticing.
 * Task 7 shipped exactly that bug and had to be fixed for it.
 */
export function ItemEditor({
  item,
  categories,
  optionGroups,
}: {
  item: ManagedItem | null;
  categories: ManagedCategory[];
  optionGroups: ManagedOptionGroup[];
}) {
  const uid = useId();
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState(saveMenuItem, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteMenuEntity, initialState);
  const pending = savePending || deletePending;

  const [categoryId, setCategoryId] = useState(item?.categoryId ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [isFeatured, setIsFeatured] = useState(item?.isFeatured ?? false);
  const [isActive, setIsActive] = useState(item?.isActive ?? true);

  // Row keys for sizes that have no database id yet. A counter, not the array
  // index, so removing the second of three rows cannot renumber the third into
  // the second's key and hand React the wrong element's state. It starts at
  // zero, which is the key the blank first row of a new item already holds.
  const newRowCount = useRef(0);
  const nextRowKey = () => `new-${(newRowCount.current += 1)}`;

  const [sizes, setSizes] = useState<SizeDraft[]>(() => sizesFrom(item));
  const [defaultKey, setDefaultKey] = useState(() => defaultKeyFrom(item));

  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(
    () => new Set((item?.optionLinks ?? []).map((link) => link.groupId)),
  );

  /**
   * Re-seed the size rows when the saved sizes change underneath the form.
   *
   * A save is a Server Action, so Next re-renders this route with the item as
   * it now stands, but React state does not re-run its initialisers and would
   * keep holding what was typed. That is fine for the text fields and fatal
   * for a row that has just been created: its draft still carries an empty
   * id, and pressing Save again would send it as new a second time. The RPC
   * would insert a duplicate size and deactivate the first one, because a
   * saved row the payload does not name comes off the menu.
   *
   * The signature only changes when the set of saved size ids changes, which
   * is exactly the save that hands a row its id. Renaming an item or moving a
   * price leaves it alone, so an ordinary edit never resets the fields under
   * the person's hands. This is React's documented way of adjusting state when
   * a prop changes: set it during render, not from an effect, so the discarded
   * render is never painted.
   */
  const signature = variationSignature(item);
  const [seededSignature, setSeededSignature] = useState(signature);
  if (signature !== seededSignature) {
    setSeededSignature(signature);
    setSizes(sizesFrom(item));
    setDefaultKey(defaultKeyFrom(item));
  }

  const activeSizes = sizes.filter((size) => size.isActive);

  /**
   * The default size, resolved rather than trusted.
   *
   * staff_save_menu_item counts the elements that are both active and default
   * and raises ONE_DEFAULT_REQUIRED unless there is exactly one, so this
   * screen has to agree with that count or it fails a save it thought was
   * fine. Two things make it agree. The radio group can only ever name one
   * row, and this line refuses to name a row that is not active: when the
   * chosen default is removed, the first size still on the menu takes over.
   * Both the radio's checked state and the payload read this same value, so
   * what the person sees selected is what gets sent.
   *
   * It is empty only when no size is active at all, which the save button
   * blocks on separately.
   */
  const effectiveDefaultKey =
    activeSizes.find((size) => size.key === defaultKey)?.key ?? activeSizes[0]?.key ?? "";

  /**
   * The option groups this item offers, in the order they are sent.
   *
   * The array's order becomes each link's sort_order, so the groups already
   * linked keep the order they have and newly ticked ones are appended.
   * Sorting the whole list by the groups' own sort_order instead would
   * silently reorder an item's flavour and heat sections every time an
   * unrelated field was saved.
   */
  const keptGroupIds = (item?.optionLinks ?? [])
    .map((link) => link.groupId)
    .filter((groupId) => selectedGroupIds.has(groupId));
  const orderedGroupIds = [
    ...keptGroupIds,
    ...optionGroups
      .map((group) => group.id)
      .filter((groupId) => selectedGroupIds.has(groupId) && !keptGroupIds.includes(groupId)),
  ];

  /**
   * Everything the action reads, as one string.
   *
   * A removed size that has been saved before is in here with isActive false,
   * not missing from it. The RPC has no delete path for a variation (ruling
   * R4): order_items point at variation ids, so a row a receipt references can
   * never disappear. Sending the removal as a deactivation is also what makes
   * it undoable up to the moment of saving.
   */
  const payload = JSON.stringify({
    id: item?.id ?? "",
    categoryId,
    name: name.trim(),
    code: code.trim(),
    description: description.trim(),
    isFeatured,
    isActive,
    variations: sizes.map((size) => ({
      id: size.id,
      label: size.label.trim(),
      shortLabel: size.shortLabel.trim(),
      priceCents: pesosToCents(size.pesos),
      isDefault: size.key === effectiveDefaultKey,
      isActive: size.isActive,
    })),
    optionGroupIds: orderedGroupIds,
  });

  /** What stops this save, in the order worth fixing it. Null when nothing does. */
  const problem = !categoryId
    ? "Choose which category this item belongs to."
    : name.trim().length < 2
      ? "Give the item a name."
      : activeSizes.length === 0
        ? "An item needs at least one size on the menu, even if it only has one price."
        : activeSizes.some((size) => !size.label.trim() || !size.shortLabel.trim())
          ? "Every size needs a name and a short name for the ticket."
          : sizes.length > 30
            ? "An item can carry 30 sizes at most."
            : null;

  /**
   * Leaving the screen, once the action that ends it has settled.
   *
   * A create has nowhere to stay: saveMenuItem returns a message, not the new
   * id, so this route cannot turn into the new item's edit route, and sitting
   * here means the next press of Save creates a second item. A delete has
   * nothing left to edit. Both land back on the menu, where the result shows.
   *
   * The push waits for the action's transition to finish rather than running
   * inside it. A push issued in the same tick as a Server Action's response
   * races the seeded navigation Next commits for the route the action was
   * called from, and loses. See the longer note on ReorderButton, where that
   * was measured rather than guessed.
   */
  const leaving = deleteState.status === "success" || (!item && saveState.status === "success");
  const navigated = useRef(false);
  useEffect(() => {
    if (!leaving || pending || navigated.current) return;
    navigated.current = true;
    const go = () => router.push("/workspace/menu");
    go();
  }, [leaving, pending, router]);

  const categoryOptions: WorkspaceSelectOption<string>[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
    description: category.isActive ? undefined : "This category is off the menu.",
  }));

  function removeSize(key: string) {
    setSizes((current) => {
      const target = current.find((size) => size.key === key);
      if (!target) return current;
      // A size that has never been saved has nothing to preserve. No order can
      // reference it and the server has never heard of it, so it just leaves.
      if (!target.id) return current.filter((size) => size.key !== key);
      // A saved size is deactivated and stays in the list. Ruling R4 again.
      return current.map((size) => (size.key === key ? { ...size, isActive: false } : size));
    });
  }

  function updateSize(key: string, patch: Partial<SizeDraft>) {
    setSizes((current) => current.map((size) => (size.key === key ? { ...size, ...patch } : size)));
  }

  function toggleGroup(groupId: string, checked: boolean) {
    setSelectedGroupIds((current) => {
      const next = new Set(current);
      if (checked) next.add(groupId);
      else next.delete(groupId);
      return next;
    });
  }

  const disabled = pending || leaving;

  return (
    <div className="mt-7 space-y-4">
      <form action={saveAction}>
        {/* Unconditional, and the only field this form posts. Rendering it
            inside a branch is how a form like this loses its whole body. */}
        <input type="hidden" name="payload" value={payload} />

        <section className="bg-nybb-charcoal rounded-md p-5">
          <p className="type-caps text-nybb-bone/55">Details</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <WorkspaceSelect
              // The action reads `payload` and nothing else. This name exists
              // because the control requires one, and what it puts in FormData
              // is ignored.
              id={`${uid}-category`}
              name="categoryIdControl"
              label="Category"
              options={categoryOptions}
              defaultValue={item?.categoryId ?? null}
              placeholder="Choose a category"
              onValueChange={(value) => setCategoryId(value ?? "")}
              disabled={disabled}
              className="min-w-56 flex-1"
            />
            <div className="min-w-56 flex-[2]">
              <WorkspaceFieldLabel htmlFor={`${uid}-name`}>Name</WorkspaceFieldLabel>
              <WorkspaceInput
                id={`${uid}-name`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={80}
                disabled={disabled}
              />
            </div>
            <div className="w-32">
              <WorkspaceFieldLabel htmlFor={`${uid}-code`}>Code</WorkspaceFieldLabel>
              <WorkspaceInput
                id={`${uid}-code`}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={16}
                disabled={disabled}
              />
            </div>
          </div>
          <p className="text-nybb-bone/55 mt-2 text-xs">
            The code is the short handle from the printed menu, like BB1. Leave it empty when the
            item does not have one.
          </p>

          <div className="mt-4">
            <WorkspaceFieldLabel htmlFor={`${uid}-description`}>Description</WorkspaceFieldLabel>
            <textarea
              id={`${uid}-description`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              disabled={disabled}
              className="mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm"
            />
            <p className="text-nybb-bone/55 mt-2 text-xs">
              What a customer reads on the item page. Up to 500 characters.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-4">
            <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                disabled={disabled}
              />
              <span className="text-sm">Featured</span>
            </label>
            <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={disabled}
              />
              <span className="text-sm">On the menu</span>
            </label>
          </div>
          <p className="text-nybb-bone/55 mt-2 text-xs">
            Turning this off takes the item off the menu at every branch, indefinitely, until
            someone turns it back on. To stop selling it for one shift at one counter, mark it
            sold out from the menu list instead.
          </p>
        </section>

        {/* Task 11 renders ImageField here. */}

        <section className="bg-nybb-charcoal mt-4 rounded-md p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="type-caps text-nybb-bone/55">Sizes</p>
            <p className="text-nybb-bone/55 text-xs">{countLabel(activeSizes.length, "size")} on the menu</p>
          </div>
          <p className="text-nybb-bone/55 mt-2 text-xs">
            The size name is what a customer picks, like &quot;Half, 6 pieces&quot;. The short name
            is what the kitchen ticket prints, like &quot;HALF&quot;. They are two separate fields and neither is
            worked out from the other. One size is the default, which is the one the item page
            opens on.
          </p>

          <ul className="mt-4 space-y-3">
            {sizes.map((size) => {
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
                      tone="dark"
                      variant="ghost"
                      onClick={() => updateSize(size.key, { isActive: true })}
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
                      <WorkspaceFieldLabel htmlFor={`${uid}-${size.key}-label`}>Size name</WorkspaceFieldLabel>
                      <WorkspaceInput
                        id={`${uid}-${size.key}-label`}
                        value={size.label}
                        onChange={(event) => updateSize(size.key, { label: event.target.value })}
                        maxLength={60}
                        placeholder="Half, 6 pieces"
                        disabled={disabled}
                      />
                    </div>
                    <div className="w-36">
                      <WorkspaceFieldLabel htmlFor={`${uid}-${size.key}-short`}>
                        Short name for the ticket
                      </WorkspaceFieldLabel>
                      <WorkspaceInput
                        id={`${uid}-${size.key}-short`}
                        value={size.shortLabel}
                        onChange={(event) => updateSize(size.key, { shortLabel: event.target.value })}
                        maxLength={20}
                        placeholder="HALF"
                        disabled={disabled}
                      />
                    </div>
                    <div className="w-32">
                      <WorkspaceFieldLabel htmlFor={`${uid}-${size.key}-price`}>Price (PHP)</WorkspaceFieldLabel>
                      <WorkspaceInput
                        id={`${uid}-${size.key}-price`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={size.pesos}
                        onChange={(event) => updateSize(size.key, { pesos: event.target.value })}
                        disabled={disabled}
                      />
                    </div>
                    <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
                      <input
                        type="radio"
                        // A shared name is what makes these one group for the
                        // keyboard. The action reads `payload` only, so the
                        // field this puts in FormData is ignored.
                        name={`${uid}-default-size`}
                        checked={size.key === effectiveDefaultKey}
                        onChange={() => setDefaultKey(size.key)}
                        disabled={disabled}
                      />
                      <span className="text-sm">Default</span>
                    </label>
                    <Button
                      type="button"
                      tone="dark"
                      variant="ghost"
                      onClick={() => removeSize(size.key)}
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

          <Button
            type="button"
            tone="dark"
            variant="secondary"
            onClick={() => setSizes((current) => [...current, blankSize(nextRowKey())])}
            disabled={disabled}
            className="mt-4 min-h-11"
          >
            <Plus aria-hidden className="size-4" />
            Add a size
          </Button>
        </section>

        <section className="bg-nybb-charcoal mt-4 rounded-md p-5">
          <p className="type-caps text-nybb-bone/55">Options</p>
          <p className="text-nybb-bone/55 mt-2 text-xs">
            The groups of choices this item offers, like flavours or heat. What is inside each
            group is managed on the option groups screen.
          </p>
          {optionGroups.length === 0 ? (
            <p className="text-nybb-bone/55 mt-4 text-sm">No option groups exist yet.</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {optionGroups.map((group) => (
                <label
                  key={group.id}
                  className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2"
                >
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.has(group.id)}
                    onChange={(event) => toggleGroup(group.id, event.target.checked)}
                    disabled={disabled}
                  />
                  <span className="min-w-0 text-sm">
                    {group.name}
                    <span className="text-nybb-bone/55 ml-2 text-xs">
                      {countLabel(group.options.length, "option")}
                      {group.isActive ? "" : ", off the menu"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>

        {/* Task 10 renders HeatPriceGrid here. */}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            tone="dark"
            variant="primary"
            disabled={disabled || problem !== null}
            className="min-h-11"
          >
            {savePending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            {item ? "Save item" : "Add item"}
          </Button>
          {problem ? <p className="text-nybb-bone/55 text-xs">{problem}</p> : null}
        </div>
        <MenuStatusMessage state={saveState} />
      </form>

      {item ? (
        <form
          action={deleteAction}
          className="bg-nybb-charcoal rounded-md p-5"
          onSubmit={(event) => {
            if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="entity" value="item" />
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" tone="dark" variant="danger" disabled={disabled} className="min-h-11">
            {deletePending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Trash2 aria-hidden className="size-4" />
            )}
            Delete item
          </Button>
          <p className="text-nybb-bone/55 mt-2 text-xs">
            An item that any past order references cannot be deleted. Take it off the menu
            instead, which leaves those receipts intact.
          </p>
          <MenuStatusMessage state={deleteState} />
        </form>
      ) : null}
    </div>
  );
}
