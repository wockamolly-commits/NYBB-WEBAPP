"use client";

import { LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSelect, type WorkspaceSelectOption } from "@/components/ui/WorkspaceSelect";
import { manilaDateEndExclusiveIso } from "@/lib/staff/manila-dates";
import {
  HOLD_KIND_LABELS,
  type HoldKind,
  type ManagedBranch,
  type ManagedItem,
  type MenuActionState,
} from "@/lib/staff/menu-types";
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

/** "Aug 25, 2026, 11:59 PM", for the line under a held item. */
function formatManilaInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
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

  const branchOptions: readonly WorkspaceSelectOption<string>[] = branches.map((branch) => ({
    value: branch.id,
    label: branch.shortName,
  }));

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
      defaultValue={pickedBranchId}
      placeholder="Choose a counter"
      onValueChange={setPickedBranchId}
      disabled={pending}
      className="min-w-40"
    />
  );

  if (existingHold) {
    return (
      <div>
        {branchPicker ? <div className="mb-3">{branchPicker}</div> : null}
        <p className="text-nybb-bone/70 text-sm">
          Sold out at {existingHold.branchShortName}
          {existingHold.unavailableUntil ? `, until ${formatManilaInstant(existingHold.unavailableUntil)}` : ", until someone puts it back"}.
        </p>
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
      <form action={action} className="flex flex-wrap items-end gap-3">
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
          defaultValue={kind}
          onValueChange={(value) => {
            if (!value) return;
            setKind(value);
            if (value === "today") setUntil(endOfManilaDayInputValue());
            else if (value === "until") setUntil("");
          }}
          disabled={pending}
          className="min-w-56"
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
        <Button type="submit" tone="dark" variant="primary" disabled={pending || !canSubmit} className="min-h-11">
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
