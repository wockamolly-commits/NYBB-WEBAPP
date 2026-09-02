"use client";

import { LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { branchStatusLine, tradingBranches } from "@/lib/staff/branch-availability";
import { manilaDateEndExclusiveIso } from "@/lib/staff/manila-dates";
import {
  HOLD_KIND_LABELS,
  type HoldKind,
  type ManagedBranch,
  type ManagedItem,
  type MenuActionState,
} from "@/lib/staff/menu-types";
import { cn } from "@/lib/utils";
import { setMenuItemHold } from "./actions";
import { MenuStatusMessage } from "./MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

const holdKindOptions: readonly WorkspaceSelectOption<HoldKind>[] = (
  Object.entries(HOLD_KIND_LABELS) as Array<[HoldKind, string]>
).map(([value, label]) => ({ value, label }));

/**
 * "Today" in Asia/Manila, as the YYYY-MM-DD the rest of the codebase's Manila
 * helpers expect. Intl does the timezone lookup; nothing here computes an
 * offset by hand.
 */
function manilaTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * The end of the current Manila day, as a value a `datetime-local` input can
 * carry, in Manila wall-clock terms. `manilaDateEndExclusiveIso` (already in
 * lib/staff/manila-dates.ts) gives the instant, midnight at the start of
 * tomorrow in Manila; this only reformats that instant for display.
 */
function endOfManilaDayInputValue(): string {
  const iso = manilaDateEndExclusiveIso(manilaTodayDate());
  if (!iso) return "";
  const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(iso));
  return `${manilaDate}T00:00`;
}

export function ItemHoldControl({
  item,
  branches,
  actingBranchId,
}: {
  item: ManagedItem;
  branches: ManagedBranch[];
  actingBranchId: string | null;
}) {
  const [state, action, pending] = useActionState(setMenuItemHold, initialState);
  const [kind, setKind] = useState<HoldKind>("today");
  const [until, setUntil] = useState(() => endOfManilaDayInputValue());
  const [pickedBranchId, setPickedBranchId] = useState<string | null>(null);

  // A cashier's counter is fixed. A roving manager or admin has none, so the
  // branch they pick below stands in for it, and both personas are then
  // looked up against the same single value: no separate "roving manager"
  // branch of this logic to fall out of sync with the cashier's.
  const actingBranch = actingBranchId ?? pickedBranchId;
  const existingHold = actingBranch
    ? item.holds.find((hold) => hold.branchId === actingBranch)
    : undefined;

  // Trading counters only. The picker used to list all nine, including the
  // eight that have never opened, so a manager could mark an item sold out at
  // a branch with no fryer in it. The item editor's "Available at" filters the
  // same way and from the same function.
  const branchOptions: readonly WorkspaceSelectOption<string>[] = tradingBranches(branches).map(
    (branch) => ({ value: branch.id, label: branch.shortName }),
  );

  // Rendered wherever a branch has to be chosen. Absent for a cashier, who
  // has nothing to choose, present for a roving manager in both the create
  // form and the held view below, so they can see and act on whichever
  // counter they land on.
  const branchPicker = actingBranchId ? null : (
    <WorkspaceSelect
      id={`menu-hold-branch-${item.id}`}
      name="branchId"
      label="Which counter"
      options={branchOptions}
      value={pickedBranchId}
      placeholder="Choose a counter"
      onValueChange={setPickedBranchId}
      disabled={pending}
    />
  );

  if (existingHold) {
    return (
      <div>
        {branchPicker ? <div className="mb-3 max-w-56">{branchPicker}</div> : null}
        {/* The same sentence the item editor's Now column prints, from the
            same function. This screen used to write its own, so an item held
            until 6pm and an item held indefinitely read the same here and
            differently there. */}
        <p className="text-nybb-bone/70 text-sm">{branchStatusLine(existingHold)}</p>
        <form action={action} className="mt-3">
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="branchId" value={existingHold.branchId} />
          <input type="hidden" name="kind" value="lift" />
          <Button type="submit" tone="dark" variant="primary" disabled={pending} className="min-h-11">
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <PlayCircle aria-hidden className="size-4" />
            )}
            Put back on the menu
          </Button>
        </form>
        <MenuStatusMessage state={state} />
      </div>
    );
  }

  const canSubmit = actingBranch !== null;

  return (
    <div>
      {/* An aligned grid, not a wrapping flex row.
          ================================================================
          This was `flex flex-wrap items-end gap-3`, which is the pattern
          DESIGN.md's workspace table section condemns and for the reason it
          gives: a wrapping row sizes itself from its own contents, so the
          same control sat at a different width on every item in the list,
          and the fields landed in a different place on each card. Down a
          menu of forty items that reads as a rendering fault rather than as
          a layout, and it is the whole of why this screen looked sloppy
          beside the item editor's "Available at".

          Fixed columns instead, so every card's control lines up with the
          card above it. Both templates are literals rather than a computed
          string, because Tailwind reads class names statically and cannot
          see one that is assembled at runtime. */}
      <form
        action={action}
        className={cn(
          "grid items-end gap-3",
          actingBranchId
            ? "sm:grid-cols-[minmax(0,16rem)_minmax(0,11rem)_auto]"
            : "sm:grid-cols-[minmax(0,11rem)_minmax(0,16rem)_minmax(0,11rem)_auto]",
        )}
      >
        <input type="hidden" name="itemId" value={item.id} />
        {actingBranchId ? (
          <input type="hidden" name="branchId" value={actingBranchId} />
        ) : (
          branchPicker
        )}
        <WorkspaceSelect
          id={`menu-hold-kind-${item.id}`}
          name="kind"
          label="Sold out"
          options={holdKindOptions}
          value={kind}
          onValueChange={(value) => {
            if (!value) return;
            setKind(value);
            if (value === "today") setUntil(endOfManilaDayInputValue());
            else if (value === "until") setUntil("");
          }}
          disabled={pending}
        />
        <div>
          <WorkspaceFieldLabel htmlFor={`menu-hold-until-${item.id}`}>Comes back</WorkspaceFieldLabel>
          <WorkspaceInput
            id={`menu-hold-until-${item.id}`}
            name="unavailableUntil"
            type="datetime-local"
            value={until}
            onChange={(event) => setUntil(event.target.value)}
            disabled={pending || kind === "indefinite"}
          />
        </div>
        <Button
          type="submit"
          tone="dark"
          variant="primary"
          disabled={pending || !canSubmit}
          className="min-h-11 w-full sm:w-auto"
          aria-label={`Mark ${item.name} sold out`}
        >
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <PauseCircle aria-hidden className="size-4" />
          )}
          Mark sold out
        </Button>
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}
