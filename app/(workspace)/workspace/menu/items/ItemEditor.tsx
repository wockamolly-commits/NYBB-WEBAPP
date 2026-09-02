"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
import { holdSummary } from "@/lib/staff/branch-availability";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import type {
  ManagedCategory,
  ManagedItem,
  ManagedOptionGroup,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { deleteMenuEntity, saveMenuItem } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";
import { HeatPriceGrid } from "./HeatPriceGrid";
import { ImageField } from "./ImageField";
import { SizeRows } from "./SizeRows";
import {
  MAX_PRICE_CENTS,
  blankSize,
  defaultKeyFrom,
  pesosToCents,
  sizeName,
  sizesFrom,
  variationSignature,
  type SizeDraft,
} from "./sizeDrafts";

const initialState: MenuActionState = { status: "idle" };

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
 *
 * The size rows themselves render in SizeRows and their shape lives in
 * sizeDrafts.ts (ruling R25), but the list stays here: the payload and the
 * pre-submit gate both read it, and so do the focus moves below.
 */
export function ItemEditor({
  item,
  categories,
  optionGroups,
  canSetAvailability,
}: {
  item: ManagedItem | null;
  categories: ManagedCategory[];
  optionGroups: ManagedOptionGroup[];
  /**
   * Whether this person may take the item off a counter. The page itself is
   * behind menu:configure, and availability is its own permission that a
   * configure holder does not automatically have, so the pointer below is
   * gated separately rather than being assumed from the route. The branch
   * list is no longer passed: the control it fed lives on the menu list now.
   */
  canSetAvailability: boolean;
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
   * what the person sees selected is what gets sent. A removed row renders as
   * a strip with no radio in it at all, so an inactive row cannot be picked.
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

  /**
   * What stops this save, in the order worth fixing it. Null when nothing does.
   *
   * The name and price bounds are the RPC's own, so a value it would refuse is
   * named here by the field it belongs to rather than coming back as a generic
   * failure with nothing to point at.
   *
   * Every row is checked, not just the active ones. A removed row is still in
   * the payload and zod still validates it, so clearing a size's name and then
   * removing it would otherwise pass this gate and fail on the server. It gets
   * its own sentence, because the field it names is not on screen any more and
   * the fix is to undo the removal first.
   */
  const problem = !categoryId
    ? "Choose which category this item belongs to."
    : name.trim().length < 2
      ? "Give the item a name."
      : activeSizes.length === 0
        ? "An item needs at least one size on the menu, even if it only has one price."
        : activeSizes.some((size) => !size.label.trim() || !size.shortLabel.trim())
          ? "Every size needs a name and a short name for the ticket."
          : sizes.some((size) => !size.isActive && (!size.label.trim() || !size.shortLabel.trim()))
            ? "A size you removed is missing its name. Undo it, fill it in, then remove it again."
            : sizes.some((size) => pesosToCents(size.pesos) > MAX_PRICE_CENTS)
              ? "A price cannot be more than PHP 100,000."
              : sizes.length > 30
                ? "An item can carry 30 sizes at most."
                : null;

  /**
   * Leaving the screen, once the action that ends it has settled.
   *
   * A create has nowhere to stay: saveMenuItem returns a message, not the new
   * id, so this route cannot turn into the new item's edit route, and sitting
   * here means the next press of Save creates a second item.
   *
   * The push waits for the action's transition to finish rather than running
   * inside it. A push issued in the same tick as a Server Action's response
   * races the seeded navigation Next commits for the route the action was
   * called from, and loses. See the longer note on ReorderButton, where that
   * was measured rather than guessed.
   *
   * A delete is not handled here, and used to be. It could not work from a
   * client effect: the delete removes the row this route is built from, the
   * route re-renders inside the action's own response, and notFound() unmounts
   * this component before any effect of its own gets a turn. That is the 404
   * people were landing on. deleteMenuEntity redirects from the server now,
   * which does not depend on this component still existing. deleteState is
   * still read below, for the deletes that fail and therefore stay.
   */
  const leaving = !item && saveState.status === "success";
  const navigated = useRef(false);
  useEffect(() => {
    if (!leaving || pending || navigated.current) return;
    navigated.current = true;
    router.push("/workspace/menu");
  }, [leaving, pending, router]);

  /**
   * Focus, after a row appears or disappears under it.
   *
   * Removing a size unmounts the button that was just pressed and replaces the
   * whole row with a strip, so focus falls to <body> and the tab order changes
   * with nothing said about it. Undo does the same in reverse. On a counter
   * tablet with a screen reader that is a size silently leaving the page.
   *
   * The element to focus is named by id rather than held in a ref, because the
   * row it belongs to does not exist yet when the handler runs: it is rendered
   * by the very state change that handler makes. useId's value carries colons,
   * which getElementById handles and querySelector would not.
   *
   * The request is wrapped in a fresh object rather than stored as a bare
   * string, so that asking twice for the same element still re-runs this. That
   * is also what lets the effect leave the request in place instead of
   * clearing it, which would be a setState inside an effect and a cascading
   * render.
   */
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.id)?.focus();
  }, [focusRequest]);

  const categoryOptions: WorkspaceSelectOption<string>[] = categories.map((category) => ({
    value: category.id,
    label: category.name,
    description: category.isActive ? undefined : "This category is off the menu.",
  }));

  function removeSize(key: string) {
    const index = sizes.findIndex((size) => size.key === key);
    const target = sizes[index];
    if (!target) return;
    const named = sizeName(target, index);

    // A size that has never been saved has nothing to preserve. No order can
    // reference it and the server has never heard of it, so it just leaves,
    // and focus has nowhere in the row to go.
    if (!target.id) {
      setSizes((current) => current.filter((size) => size.key !== key));
      setAnnouncement(`Removed ${named}. It was never saved, so there is nothing to undo.`);
      setFocusRequest({ id: `${uid}-add-size` });
      return;
    }

    // A saved size is deactivated and stays in the list. Ruling R4 again.
    setSizes((current) =>
      current.map((size) => (size.key === key ? { ...size, isActive: false } : size)),
    );
    setAnnouncement(`Removed ${named}. It comes off the menu when you save. Undo is available.`);
    setFocusRequest({ id: `${uid}-${key}-undo` });
  }

  function restoreSize(key: string) {
    const index = sizes.findIndex((size) => size.key === key);
    const target = sizes[index];
    if (!target) return;
    setSizes((current) =>
      current.map((size) => (size.key === key ? { ...size, isActive: true } : size)),
    );
    setAnnouncement(`${sizeName(target, index)} is back on the menu.`);
    setFocusRequest({ id: `${uid}-${key}-label` });
  }

  function addSize() {
    const key = `new-${(newRowCount.current += 1)}`;
    setSizes((current) => [...current, blankSize(key)]);
    setAnnouncement("Added a size. Give it a name, a short name and a price.");
    setFocusRequest({ id: `${uid}-${key}-label` });
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
  const soldOutSummary = item ? holdSummary(item.holds) : null;
  const activeCount = activeSizes.length;

  return (
    <div className="mt-7 space-y-4">
      <form action={saveAction} className="space-y-4">
        {/* Unconditional, and the only field this form posts. Rendering it
            inside a branch is how a form like this loses its whole body. */}
        <input type="hidden" name="payload" value={payload} />

        <WorkspaceSection
          title="Details"
          description={
            <p>
              What the item is called and where it sits on the menu. Renaming it never changes its
              web address.
            </p>
          }
        >
          {/* Category first, and on its own line. It is the first thing the
              save gate refuses without, and a select with a placeholder does
              not want the width of a name field. */}
          <div className="max-w-sm">
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
            />
          </div>

          {/* Name and Code on one line, because the code is the name's short
              handle. They used to be the two ends of a three field row, a
              thousand pixels apart on a desktop, with the hint that explains
              the code sitting under all three. */}
          <div className="mt-4 flex flex-wrap items-start gap-4">
            <div className="min-w-56 flex-1">
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
                aria-describedby={`${uid}-code-hint`}
              />
            </div>
          </div>
          {/* Under the row and not inside the 128px column, which set it at
              five words a line and left a hole under Name the height of the
              paragraph. It is still named by the field it belongs to, and the
              row now holds only Name and Code, so a note that opens with "The
              code" cannot be read as being about anything else. */}
          <p id={`${uid}-code-hint`} className="text-nybb-bone/65 mt-2 max-w-md text-xs">
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
              aria-describedby={`${uid}-description-hint`}
              className="mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm"
            />
            <p id={`${uid}-description-hint`} className="text-nybb-bone/65 mt-2 max-w-md text-xs">
              What a customer reads on the item page. Up to 500 characters.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
              <WorkspaceCheckbox
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                disabled={disabled}
              />
              <span className="text-sm">Featured</span>
            </label>
            <label className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5">
              <WorkspaceCheckbox
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
                disabled={disabled}
                aria-describedby={`${uid}-active-hint`}
              />
              <span className="text-sm">Sell this item at all</span>
            </label>
          </div>
          {/* Capped at a readable measure. Full bleed in the body column it
              set at roughly 148 characters a line, which is twice the ceiling
              for reading copy at any size. */}
          {/* The two controls are one question at two scopes, so each names
              its own scope and points at the other. "On the menu" said
              nothing about which menu, and the per-counter control says
              "sold out", so a person reading either one had no way to tell
              that the other existed. */}
          <p id={`${uid}-active-hint`} className="text-nybb-bone/65 mt-2 max-w-lg text-xs">
            Off takes the item off every counter at once, indefinitely, until someone turns it back
            on. To stop selling it at one counter and keep it at the others, mark it sold out from
            the menu list.
          </p>
        </WorkspaceSection>

        <WorkspaceSection
          title="Sizes"
          description={
            <>
              <p>
                The size name is what a customer picks, like &quot;Half, 6 pieces&quot;. The short
                name is what the kitchen ticket prints, like &quot;HALF&quot;.
              </p>
              <p>
                They are two separate fields and neither is worked out from the other. One size is
                the default, which is the one the item page opens on.
              </p>
            </>
          }
          aside={`${activeCount} size${activeCount === 1 ? "" : "s"} on the menu`}
        >
          <SizeRows
            idPrefix={uid}
            radioName={`${uid}-default-size`}
            sizes={sizes}
            effectiveDefaultKey={effectiveDefaultKey}
            announcement={announcement}
            disabled={disabled}
            onUpdate={updateSize}
            onDefaultChange={setDefaultKey}
            onRemove={removeSize}
            onRestore={restoreSize}
            onAdd={addSize}
          />
        </WorkspaceSection>

        {/* ImageField used to carry its own <form>, which could not nest
            inside this one (the browser flattens a nested form and its
            Upload button would submit the item instead), so it renders as a
            sibling right after this form closes. It no longer has a form:
            React 19 resets an uncontrolled form after every form action, and
            that emptied the file input, so the field posts its upload
            directly instead. The placement stays as it is, and this comment
            stays as the marker of where "Photo" sits in the reading order.
            HeatPriceGrid below still has the original constraint. */}

        {/* The form's last section and the commit footer are one plate, which
            is why they are wrapped rather than being two children of the
            form's `space-y-4`. See the footer's own comment below. */}
        <div>
          <WorkspaceSection
            title="Options"
            className="rounded-b-none"
            description={
              <p>
                The groups of choices this item offers, like flavours or heat. What is inside each
                group is managed on the option groups screen.
              </p>
            }
          >
            {optionGroups.length === 0 ? (
              <p className="text-nybb-bone/65 text-sm">No option groups exist yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {optionGroups.map((group) => (
                  <label
                    key={group.id}
                    className="border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2"
                  >
                    <WorkspaceCheckbox
                      checked={selectedGroupIds.has(group.id)}
                      onChange={(event) => toggleGroup(group.id, event.target.checked)}
                      disabled={disabled}
                    />
                    <span className="min-w-0 text-sm">
                      {group.name}
                      <span className="text-nybb-bone/65 ml-2 text-xs">
                        {group.options.length} option{group.options.length === 1 ? "" : "s"}
                        {group.isActive ? "" : ", off the menu"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </WorkspaceSection>

          {/* The commit footer, and the third cut of it.
              ============================================================
              It began as a loose button between the Options card and the
              Photo card, so on the edit route the action that saves the form
              sat two sections short of the end of the page and the reason it
              was disabled was set in the quietest text on the screen. That
              was fixed by giving it a card of its own on the section
              geometry, on the theory that lining the button up with the
              controls it commits would make it read as the last row of the
              form.

              It did not, and the reason is worth keeping. A rail carrying
              nothing, a body column carrying one 44px button, and the same
              charcoal plate at the same width as the four real sections
              around it: the eye reads "section", finds no heading and no
              content, and the card reads as unfinished. Alignment could not
              do that job alone, because at `lg` the button was indented
              16rem into an otherwise empty plate with nothing above it in
              the same column to align *to*. The offset only says something
              when a control directly above it wears the same left edge.

              So the footer is the foot of the form's last card rather than a
              card after it. Same plate, no gap, and an inset bone/15 rule
              where the section's contents stop and its commit starts, which
              is the device OptionGroupEditor already uses between a group's
              identity and its options. The button keeps the body column and
              now sits directly under the option checkboxes, sharing their
              left edge, and the block ends the way the per size price grid
              ends: the content, then the one Save that commits it. */}
          <div className="bg-nybb-charcoal rounded-b-md px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="border-nybb-bone/15 border-t pt-4 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-x-8">
              <div aria-hidden className="hidden lg:block" />
              <div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
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
                  {problem ? (
                    // Not an error: nothing has failed and nobody has done
                    // anything wrong yet. It names the next thing to fill in,
                    // so it reads as instruction at the weight of body copy
                    // rather than as the quietest text on the page, which is
                    // where it used to be.
                    <p className="text-nybb-bone/65 max-w-md text-sm">{problem}</p>
                  ) : null}
                </div>
                {/* Out of the flex row and unwrapped. It used to sit in the
                    row inside a `w-full` div, which is a flex item whether or
                    not the message renders, so an idle form paid `gap-y-3`
                    for a line that was not there. */}
                <MenuStatusMessage state={saveState} />
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* There is ONE sold out control and it is on the menu list. This
          carried a second one, a tick box per counter, which meant two
          different controls for one piece of state: two vocabularies, two
          layouts, and a person having to learn which screen offered which.
          It also could not be the only one, because a cashier holds
          menu:availability and not menu:configure and cannot open this page
          at all. So the control lives where every role can reach it and this
          says where that is. */}
      {item && canSetAvailability ? (
        <WorkspaceSection
          title="Sold out"
          description={
            <p>
              Whether a counter is selling this item right now, and when it comes back, is set on
              the menu list, beside the item.
            </p>
          }
        >
          <p className="text-nybb-bone/65 max-w-md text-sm">
            {soldOutSummary ?? "This item is on sale at every counter."}
          </p>
          <ButtonLink href="/workspace/menu" tone="dark" variant="secondary" className="mt-3">
            Go to the menu list
          </ButtonLink>
        </WorkspaceSection>
      ) : null}

      <WorkspaceSection
        title="Photo"
        description={<p>The square tile the storefront draws.</p>}
      >
        {item ? (
          <ImageField target={{ kind: "item", itemId: item.id }} image={item.image} />
        ) : (
          // Said once. The rail carried "a photograph can be uploaded once the
          // item has been saved" and the body carried "add the item first",
          // which is the same sentence twice in one section.
          <p className="text-nybb-bone/65 text-sm">
            Add the item first. Its photograph can be uploaded once it has been saved.
          </p>
        )}
      </WorkspaceSection>

      {/* Outside the item's own <form>, deliberately. HeatPriceGrid renders
          its own <form> with its own Server Action, and a <form> nested inside
          another <form> is invalid HTML: the browser would not submit it
          independently, defeating the whole point of a separate save. Task 9
          left the render marker inside the item form; it moves out here for
          that reason. */}
      <HeatPriceGrid idPrefix={uid} item={item} optionGroups={optionGroups} />

      {item ? (
        <WorkspaceSection
          title="Delete"
          description={
            <p>
              An item that any past order references cannot be deleted. Take it off the menu
              instead, which leaves those receipts intact.
            </p>
          }
        >
          <form action={deleteAction}>
            <input type="hidden" name="entity" value="item" />
            <input type="hidden" name="id" value={item.id} />
            <ConfirmDeleteButton
              label="Delete item"
              name={item.name}
              meta={item.code ?? undefined}
              consequence="The item, its sizes and the option groups it offers all go. It leaves the menu at every branch, and past orders keep their own record of it."
              disabled={disabled}
              pending={deletePending}
            />
            <MenuStatusMessage state={deleteState} />
          </form>
        </WorkspaceSection>
      ) : null}
    </div>
  );
}
