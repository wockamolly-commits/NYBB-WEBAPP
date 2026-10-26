"use client";

import { ChevronDown, ImageOff, Pencil } from "lucide-react";
import Image from "next/image";
import { useActionState, useId, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ConfirmDeleteButton } from "@/components/ui/ConfirmDeleteButton";
import { formatPeso } from "@/lib/format";
import { holdSummary } from "@/lib/staff/branch-availability";
import type {
  ManagedBranch,
  ManagedCategory,
  ManagedItem,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { cn } from "@/lib/utils";
import { deleteMenuEntity } from "./actions";
import { MenuStatusMessage } from "./MenuStatusMessage";
import { SoldOutControl } from "./SoldOutControl";

const CHIP = "rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider";

const initialState: MenuActionState = { status: "idle" };

/**
 * One item on the menu list: what it is, its state, and what can be done to it.
 *
 * WHY THE SOLD OUT CONTROL IS BEHIND A DISCLOSURE.
 * ================================================================
 * Every card used to open with the whole control drawn: a box per counter, a
 * state line and a Save button, on all fifty items at once. That made the page
 * about four screens of identical forms, and the one thing a person came to
 * find, an item by its name, was the thing the layout buried. The state is
 * now one line on the row (only when there is a state to state, per the
 * control's own rule), and the control opens under the row on demand.
 *
 * The panel hides with the `hidden` attribute and is never unmounted, per The
 * Container Is Not A Peer Of Its Rows Rule: a draft somebody started does not
 * vanish because they closed the panel to look at the item below.
 */
export function MenuItemRow({
  item,
  category,
  branches,
  actingBranchId,
  can,
}: {
  item: ManagedItem;
  category: ManagedCategory;
  branches: ManagedBranch[];
  actingBranchId: string | null;
  can: { configure: boolean; availability: boolean };
}) {
  const uid = useId();
  const nameId = `${uid}-name`;
  const panelId = `${uid}-availability`;
  const [open, setOpen] = useState(false);
  const soldOut = holdSummary(item.holds);

  return (
    <article aria-labelledby={nameId} className="bg-nybb-charcoal rounded-md">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-3 sm:p-4">
        <div className="bg-nybb-graphite relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md">
          {item.image ? (
            <Image src={item.image.src} alt="" fill sizes="56px" className="object-cover" />
          ) : (
            <ImageOff aria-hidden className="text-nybb-bone/40 size-5" />
          )}
        </div>

        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 id={nameId} className="font-display heading-panel">
              {item.name}
            </h3>
            {item.code ? (
              <span className="text-nybb-bone/60 font-mono text-xs uppercase">{item.code}</span>
            ) : null}
            {!item.isActive ? (
              <span className={`bg-nybb-bone/10 text-nybb-bone/70 ${CHIP}`}>Off the menu</span>
            ) : !category.isActive ? (
              <span className={`bg-nybb-bone/10 text-nybb-bone/70 ${CHIP}`}>Category off</span>
            ) : null}
            {soldOut ? <span className={`bg-nybb-orange/15 text-nybb-orange ${CHIP}`}>Sold out</span> : null}
            {item.isFeatured ? (
              <span className={`bg-nybb-yellow/15 text-nybb-yellow ${CHIP}`}>Featured</span>
            ) : null}
          </div>
          <p className="text-nybb-bone/65 mt-1.5 text-sm">
            {item.variations.length > 0
              ? item.variations
                  .map((variation) => `${variation.shortLabel} ${formatPeso(variation.priceCents)}`)
                  .join(" · ")
              : "No sizes configured yet."}
          </p>
          {/* Only while the panel is shut. Open, the control prints the same
              sentence per counter, and saying it twice is one fact told twice. */}
          {soldOut && !open ? <p className="text-nybb-bone/80 mt-1 text-sm">{soldOut}</p> : null}
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          {can.availability ? (
            <Button
              type="button"
              tone="dark"
              // Quiet whether open or shut, per The Repeated Save Is Quiet
              // Rule: the chevron carries the state, and the panel's own Save
              // is the control that turns orange when there is a change.
              variant="secondary"
              aria-expanded={open}
              aria-controls={panelId}
              // Names the item, because fifty buttons called "Availability"
              // are fifty identical choices to anyone who cannot see the row.
              // The visible word is contained in it, so Label in Name holds.
              aria-label={`Availability for ${item.name}`}
              onClick={() => setOpen((current) => !current)}
              className="flex-1 sm:flex-none"
            >
              Availability
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform duration-200 motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </Button>
          ) : null}
          {can.configure ? (
            <ButtonLink
              href={`/workspace/menu/items/${item.id}`}
              tone="dark"
              variant="secondary"
              aria-label={`Edit ${item.name}`}
              className="flex-1 sm:flex-none"
            >
              <Pencil aria-hidden className="size-4" />
              Edit
            </ButtonLink>
          ) : null}
          {can.configure ? <DeleteItem item={item} /> : null}
        </div>
      </div>

      {can.availability ? (
        <div id={panelId} hidden={!open} className="border-nybb-bone/15 border-t p-4 sm:px-5">
          <SoldOutControl item={item} branches={branches} actingBranchId={actingBranchId} />
        </div>
      ) : null}
    </article>
  );
}

/**
 * The same delete the item editor offers, from the row, behind the same
 * question. Icon only, because it repeats once per row and is the rarest
 * action on the screen; the dialog still spells out what goes.
 */
function DeleteItem({ item }: { item: ManagedItem }) {
  const [state, action, pending] = useActionState(deleteMenuEntity, initialState);
  return (
    <form action={action} className="contents">
      <input type="hidden" name="entity" value="item" />
      <input type="hidden" name="id" value={item.id} />
      <ConfirmDeleteButton
        iconOnly
        label="Delete item"
        triggerLabel={`Delete item: ${item.name}`}
        name={item.name}
        meta={item.code ?? undefined}
        consequence="The item, its sizes and the option groups it offers all go. It leaves the menu at every branch, and past orders keep their own record of it."
        pending={pending}
      />
      {state.status === "error" ? (
        <div className="basis-full">
          <MenuStatusMessage state={state} />
        </div>
      ) : null}
    </form>
  );
}
