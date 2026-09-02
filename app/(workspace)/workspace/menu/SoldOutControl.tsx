"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import {
  TABLE_MARK_CELL,
  TABLE_MARK_WORD,
  TABLE_ROW,
  TABLE_ROW_COLUMNS,
  TableHead,
  tableColumns,
  tableRowClass,
  tableRowStyle,
} from "@/components/ui/WorkspaceTable";
import {
  actableBranches,
  availabilityStatusLine,
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
 * WHY THERE IS ONLY ONE OF THESE NOW.
 * ================================================================
 * There were two, and they were different: a cashier's control on the menu
 * list offering three hold kinds and a time picker, and an owner's tick box
 * table on the item editor offering neither. Two controls for one piece of
 * state is two vocabularies, two layouts and two things to keep in step, and
 * the person using them has to learn which screen does which. The editor's
 * copy is gone and this is what remains, in the one place every role can
 * reach it.
 *
 * WHY THE MENU LIST AND NOT THE ITEM EDITOR.
 * ================================================================
 * A cashier holds `menu:availability` and NOT `menu:configure`, and the item
 * editor is behind `menu:configure`. Putting the only control there would
 * have taken sold out away from the people who use it most, in the middle of
 * the shift it exists for. The editor now points here instead.
 *
 * WHY THE THREE KINDS BECAME A BOX AND A TIME.
 * ================================================================
 * `today`, `until` and `indefinite` differ only in whether there is an end
 * and what the screen called it (0051). So the control asks the two questions
 * that actually decide it: is this counter selling the item, and if not, when
 * does it come back. Empty means "until someone puts it back". The action
 * derives the stored kind, so nothing is lost from the audit trail and the
 * person is not asked to classify their own answer.
 *
 * WHY EVERY COUNTER IS A ROW.
 * ================================================================
 * A cashier sees exactly one, their own, because that is the only counter
 * they may act on. A manager sees every trading counter and can take an item
 * off several in one Save, which the old control could not do at all: it had
 * a picker, so a manager set one counter, waited, and set the next. If a
 * ninth branch ever makes this list long on a forty item menu, the answer is
 * to collapse the rows behind the summary, not to bring back a second screen.
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

  // Three columns at table width, and only when there is more than one
  // counter to line up. A cashier's single row is a row, not a table, and a
  // header over one line of it is furniture.
  const columns = tableColumns("minmax(7rem,1fr)", "minmax(9rem,1.1fr)", "minmax(11rem,auto)");
  const showHead = actable.length > 1;

  return (
    <form action={action}>
      <input type="hidden" name="payload" value={payload} />

      {showHead ? (
        <TableHead columns={columns}>
          <div>Counter</div>
          <div>Now</div>
          <div>Selling here</div>
        </TableHead>
      ) : null}

      {actable.map((branch, index) => {
        const hold = item.holds.find((candidate) => candidate.branchId === branch.id);
        const selling = sellsHere[branch.id] ?? true;
        const boxId = `${uid}-${branch.id}-sells`;
        const untilId = `${uid}-${branch.id}-until`;
        return (
          <div
            key={branch.id}
            className={cn(
              TABLE_ROW,
              TABLE_ROW_COLUMNS,
              // The first row draws no rule when it is the only one and has
              // no header above it: a lone rule under the card's own divider
              // reads as a double line.
              (showHead || index > 0) && tableRowClass("saved"),
            )}
            style={tableRowStyle(columns)}
          >
            <div className="flex min-h-11 items-center lg:min-h-0">
              <span className="text-sm">{branch.shortName}</span>
            </div>

            {/* What is saved right now, which is not what the box shows once
                somebody has ticked it. It is also where a hold set by another
                person on another screen shows up. */}
            <div className="flex min-h-11 items-center lg:min-h-0">
              <span className={cn("text-sm", hold ? "text-nybb-bone/70" : "text-nybb-bone")}>
                {availabilityStatusLine(hold)}
              </span>
            </div>

            <div>
              <div className={TABLE_MARK_CELL}>
                <WorkspaceCheckbox
                  id={boxId}
                  checked={selling}
                  onChange={(event) =>
                    setSellsHere((current) => ({ ...current, [branch.id]: event.target.checked }))
                  }
                  disabled={pending}
                  aria-label={`Sell ${item.name} at ${branch.shortName}`}
                />
                <label htmlFor={boxId} className={TABLE_MARK_WORD}>
                  Selling here
                </label>
              </div>

              {/* Only where it can apply. A "comes back" beside a counter that
                  IS selling the item is a field with nothing to say, and the
                  old control showed it permanently, greyed, next to a control
                  that had already disabled it. */}
              {selling ? null : (
                <div className="mt-2">
                  <WorkspaceFieldLabel htmlFor={untilId}>Back on</WorkspaceFieldLabel>
                  <WorkspaceInput
                    id={untilId}
                    type="datetime-local"
                    value={untils[branch.id] ?? ""}
                    onChange={(event) =>
                      setUntils((current) => ({ ...current, [branch.id]: event.target.value }))
                    }
                    disabled={pending}
                    aria-describedby={`${untilId}-hint`}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button
                      type="button"
                      className="text-nybb-orange text-xs underline underline-offset-2"
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
                        className="text-nybb-bone/65 text-xs underline underline-offset-2"
                        onClick={() => setUntils((current) => ({ ...current, [branch.id]: "" }))}
                        disabled={pending}
                      >
                        Clear
                      </button>
                    ) : null}
                    <p id={`${untilId}-hint`} className="text-nybb-bone/65 text-xs">
                      Empty means until someone puts it back.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
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
