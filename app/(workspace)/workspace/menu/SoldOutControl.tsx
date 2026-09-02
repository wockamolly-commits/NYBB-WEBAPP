"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  actableBranches,
  branchStatusLine,
  changedBranches,
  endOfManilaDayInputValue,
  sellsHereByBranch,
  untilByBranch,
} from "@/lib/staff/branch-availability";
import type { ManagedBranch, ManagedItem, MenuActionState } from "@/lib/staff/menu-types";
import { cn } from "@/lib/utils";
import { setMenuItemBranchAvailability } from "./actions";
import { MenuStatusMessage } from "./MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

/**
 * The ONE sold out control.
 *
 * WHY THERE IS ONLY ONE OF THESE.
 * ================================================================
 * There were two, and they were different: a cashier's control on the menu
 * list offering three hold kinds and a time picker, and an owner's tick box
 * table on the item editor offering neither. Two controls for one piece of
 * state is two vocabularies, two layouts and two things to keep in step, and
 * the person using them has to learn which screen does which.
 *
 * WHY THE MENU LIST AND NOT THE ITEM EDITOR. A cashier holds
 * `menu:availability` and NOT `menu:configure`, and the item editor is behind
 * `menu:configure`. Putting the only control there would have taken sold out
 * away from the people who use it most, in the middle of the shift it exists
 * for. The editor states the item's state and links here.
 *
 * WHY THE THREE KINDS BECAME A BOX AND A TIME. `today`, `until` and
 * `indefinite` differ only in whether there is an end and what the screen
 * called it (0051). So the control asks the two questions that decide it, and
 * the action derives the stored kind. Nothing is lost from the audit trail
 * and nobody is asked to classify their own answer.
 *
 * WHY THIS IS NOT A TABLE, WHICH IT WAS FOR AN HOUR.
 * ================================================================
 * It shipped as the workspace table: a Counter / Now / Selling here grid, one
 * per item card. Three faults, and the first is the one that got it called
 * out.
 *
 * The "back on" field lived inside the tick box's own cell, so opening it
 * made that cell about 120px tall. The grid aligns cells to the bottom, so
 * the counter's name and its status sank to the foot of the row while the box
 * stayed at the top, with a lake of empty charcoal between them. Two open
 * rows read as a broken page.
 *
 * The second is worse and was there before anyone opened anything. A table
 * spreads a counter's name to the far left and its own tick box to the far
 * right of a 1400px card. The two things that belong together were as far
 * apart as the card allowed, and the eye had to cross the width of the screen
 * to answer "is this one on". The workspace table earns its columns when
 * fifteen rows have to line up and be compared. Two counters attached to one
 * item are not that; they are a small set of choices, which is what the
 * selection control family in DESIGN.md is for.
 *
 * The third is arithmetic. The header printed COUNTER / NOW / SELLING HERE
 * once per item card, so a menu of forty nine items printed those column
 * names forty nine times. That is the fault the options screen was rebuilt to
 * remove, reintroduced one level up. And "Available" beside a ticked box is
 * one fact said twice, on every row, of every item.
 *
 * So: a bordered box per counter, the mark and the name inside it together,
 * wrapping. The same shape the item editor already uses for Featured and Sell
 * this item at all. State is stated only where there is state: a counter that
 * sells the item says nothing, because the ticked box has said it.
 */
export function SoldOutControl({
  item,
  branches,
  actingBranchId,
}: {
  item: ManagedItem;
  branches: ManagedBranch[];
  actingBranchId: string | null;
}) {
  const actable = actableBranches(branches, actingBranchId);

  if (actable.length === 0) {
    return (
      <p className="text-nybb-bone/65 text-sm">
        No counter is trading, so there is nothing to mark sold out.
      </p>
    );
  }

  return <SoldOutForm item={item} actable={actable} />;
}

/**
 * Split so the hooks below are never rendered conditionally: the no-counter
 * case returns before this component exists.
 */
function SoldOutForm({ item, actable }: { item: ManagedItem; actable: ManagedBranch[] }) {
  const uid = useId();
  const [state, action, pending] = useActionState(setMenuItemBranchAvailability, initialState);

  const [sellsHere, setSellsHere] = useState<Record<string, boolean>>(() =>
    sellsHereByBranch(item.holds, actable),
  );
  const [untils, setUntils] = useState<Record<string, string>>(() =>
    untilByBranch(item.holds, actable),
  );

  const changed = changedBranches(sellsHere, untils, item.holds, actable);
  const payload = JSON.stringify({ itemId: item.id, branches: changed });

  // Counters this person has taken off in the draft, which is what decides
  // how many time fields are on screen. Read from the draft rather than from
  // the saved holds, so unticking a box opens its field at once.
  const stopped = actable.filter((branch) => !(sellsHere[branch.id] ?? true));
  const held = actable.filter((branch) => item.holds.some((h) => h.branchId === branch.id));

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={payload} />

      <p className="type-caps text-nybb-bone/65">Selling at</p>

      {/* Wrapping, not a grid. Two counters sit on one line and nine reflow
          onto as many as they need, which is the behaviour a set of choices
          wants and a table cannot give. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {actable.map((branch) => {
          const boxId = `${uid}-${branch.id}-sells`;
          return (
            <label
              key={branch.id}
              htmlFor={boxId}
              className={cn(
                "border-nybb-bone/15 flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3.5",
                "hover:border-nybb-bone/40",
                pending && "cursor-default",
              )}
            >
              <WorkspaceCheckbox
                id={boxId}
                checked={sellsHere[branch.id] ?? true}
                onChange={(event) =>
                  setSellsHere((current) => ({ ...current, [branch.id]: event.target.checked }))
                }
                disabled={pending}
                // Names the item as well as the counter. The visible word is
                // the counter, because the item's name is the heading of the
                // card this sits in and printing it again would be noise. But
                // a menu of forty nine items puts forty nine boxes on the
                // page, and to anyone who cannot see which card they are in,
                // forty nine boxes called "Central Bloc, IT Park" are forty
                // nine identical choices. The visible text is contained in
                // this string, so Label in Name still holds.
                aria-label={`Sell ${item.name} at ${branch.shortName}`}
              />
              <span className="text-sm">{branch.shortName}</span>
            </label>
          );
        })}
      </div>

      {/* What is saved, said once, and only where there is something to say.
          A counter that sells the item says nothing: its ticked box is the
          whole statement, and "Available" printed beside every box on every
          item was the same fact twice, forty nine times down the page. This
          is also the only place a timed hold set by somebody else is
          readable. */}
      {held.length > 0 ? (
        <div className="mt-3 space-y-1">
          {held.map((branch) => (
            <p key={branch.id} className="text-nybb-bone/70 text-sm">
              {branchStatusLine(item.holds.find((h) => h.branchId === branch.id)!)}
            </p>
          ))}
        </div>
      ) : null}

      {/* The counters being taken off, as a group under the boxes rather than
          as a block inside one of them.
          ================================================================
          Grouped rather than repeated, and that is two separate rules. The
          counter's name is its own column at a fixed width, so two fields
          land on the same left edge instead of each starting wherever its
          label happened to end: "BACK ON AT CENTRAL BLOC, IT PARK" and "BACK
          ON AT SHELL CEBU COUNTRY CLUB" are different lengths, and a stack of
          ragged fields reads as a rendering fault. And the hint is stated
          once for the group, because "empty means until someone puts it back"
          is a fact about the field, not about a counter, so printing it
          beside every row is the same sentence twice on a two counter shop
          and nine times on a full one. */}
      {stopped.length > 0 ? (
        <div className="mt-4">
          <p className="type-caps text-nybb-bone/65">Back on</p>
          <div className="mt-2 space-y-2">
            {stopped.map((branch) => {
              const untilId = `${uid}-${branch.id}-until`;
              return (
                <div key={branch.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <label
                    htmlFor={untilId}
                    className="text-nybb-bone shrink-0 text-sm sm:w-52"
                  >
                    {branch.shortName}
                  </label>
                  <WorkspaceInput
                    id={untilId}
                    type="datetime-local"
                    value={untils[branch.id] ?? ""}
                    onChange={(event) =>
                      setUntils((current) => ({ ...current, [branch.id]: event.target.value }))
                    }
                    disabled={pending}
                    aria-describedby={`${uid}-until-hint`}
                    className="mt-0 w-auto flex-none"
                  />
                  <button
                    type="button"
                    className="text-nybb-orange min-h-11 text-xs underline underline-offset-2"
                    onClick={() =>
                      setUntils((current) => ({
                        ...current,
                        [branch.id]: endOfManilaDayInputValue(),
                      }))
                    }
                    disabled={pending}
                  >
                    Rest of today
                  </button>
                  {untils[branch.id] ? (
                    <button
                      type="button"
                      className="text-nybb-bone/65 min-h-11 text-xs underline underline-offset-2"
                      onClick={() => setUntils((current) => ({ ...current, [branch.id]: "" }))}
                      disabled={pending}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p id={`${uid}-until-hint`} className="text-nybb-bone/65 mt-2 max-w-md text-xs">
            Empty means until someone puts it back.
          </p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          tone="dark"
          variant={changed.length > 0 ? "primary" : "secondary"}
          disabled={pending || changed.length === 0}
          className="min-h-11"
        >
          {pending ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <Save aria-hidden className="size-4" />
          )}
          Save availability
        </Button>
        {changed.length > 0 ? (
          <p className="text-nybb-bone/65 text-sm">
            {changed.length === 1 ? "1 counter changed." : `${changed.length} counters changed.`}
          </p>
        ) : null}
      </div>
      <MenuStatusMessage state={state} />
    </form>
  );
}
