"use client";

import { LoaderCircle, Save } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
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
  availabilityStatusLine,
  changedBranches,
  sellsHereByBranch,
  soldOutCount,
  tradingBranches,
} from "@/lib/staff/branch-availability";
import type { ManagedBranch, ManagedItem, MenuActionState } from "@/lib/staff/menu-types";
import { cn } from "@/lib/utils";
import { setMenuItemBranchAvailability } from "../actions";
import { MenuStatusMessage } from "../MenuStatusMessage";

const initialState: MenuActionState = { status: "idle" };

/**
 * Availability by branch, on the item itself.
 *
 * WHY THIS IS NOT THE SAME CONTROL AS THE MENU LIST'S.
 * ================================================================
 * ItemHoldControl, on /workspace/menu, is the counter's tool: a cashier in
 * the middle of a shift who has run out of wings picks "sold out for today"
 * and gets on with it. It offers all three hold kinds and a time picker
 * because the end of the hold is the whole point of it.
 *
 * This is the owner's view of the same table, and it answers a different
 * question: which counters sell this item at all. So the tick box writes the
 * `indefinite` kind, "until someone puts it back", which is the only one that
 * means "we do not sell this here" rather than "we are out right now". Timed
 * holds stay where they belong, on the screen the person with the empty fryer
 * is already looking at.
 *
 * A second full kind-and-time control here would be two implementations of
 * one thing, and the more dangerous half is that they would drift. What this
 * does instead is READ every kind faithfully, including a timed hold set at
 * the counter an hour ago, and let it be lifted by ticking the box.
 *
 * WHY TICK BOXES AND ONE SAVE, WHICH IS NOT WHAT THIS SHIPPED AS.
 * ================================================================
 * It shipped as a Stop selling / Put back button on every row, acting the
 * moment it was pressed. That reads fine with one counter open and badly with
 * nine: taking an item off four of them was four presses, four writes and four
 * audit rows for what the person thought of as a single decision, with no way
 * to change their mind between the first press and the last. The per size
 * price grid had the same argument and settled it the same way, and its
 * reasoning is worth reading beside this one (HeatPriceGrid).
 *
 * Inactive branches are left out. Eight of the nine rows in `branches` have
 * never opened, and "is this item sold at Ayala Center Cebu" is not a question
 * with an answer yet. See ManagedBranch.isActive.
 */
export function BranchAvailability({
  item,
  branches,
}: {
  item: ManagedItem;
  branches: ManagedBranch[];
}) {
  const trading = tradingBranches(branches);

  if (trading.length === 0) {
    return (
      <WorkspaceSection title="Available at" description={<p>Which counters sell this item.</p>}>
        <p className="text-nybb-bone/65 text-sm">
          No branch is trading yet. Once one opens it appears here.
        </p>
      </WorkspaceSection>
    );
  }

  return <AvailabilityGrid item={item} trading={trading} />;
}

/**
 * Split from the component above so the hooks below are never rendered
 * conditionally: the no-branch case returns before this exists, rather than
 * this one calling useState after an early return.
 */
function AvailabilityGrid({ item, trading }: { item: ManagedItem; trading: ManagedBranch[] }) {
  const uid = useId();
  const [state, action, pending] = useActionState(setMenuItemBranchAvailability, initialState);

  // Seeded from the saved holds, keyed by branch id. Not re-seeded when the
  // server answers: the page revalidates on a successful save, which sends
  // fresh holds through as new props, and `changed` below is what goes quiet.
  const [drafts, setDrafts] = useState<Record<string, boolean>>(() =>
    sellsHereByBranch(item.holds, trading),
  );

  const changed = changedBranches(drafts, item.holds, trading);
  const payload = JSON.stringify({ itemId: item.id, branches: changed });
  const soldOut = soldOutCount(item.holds, trading);

  const columns = tableColumns("minmax(8rem,1fr)", "minmax(10rem,1.2fr)", "9rem");

  return (
    <WorkspaceSection
      title="Available at"
      description={
        <>
          <p>
            Which counters sell this item. Untick as many as you like and press Save once. Taking
            it off one counter leaves it on every other one, and leaves it on the menu of a
            customer who has not chosen a store yet.
          </p>
          <p>
            This is the long running answer. To stop selling it for one shift, mark it sold out
            from the menu list, which lets you say when it comes back.
          </p>
        </>
      }
      aside={`${soldOut} of ${trading.length} sold out`}
    >
      <form action={action}>
        <input type="hidden" name="payload" value={payload} />

        <TableHead columns={columns}>
          <div>Counter</div>
          <div>Now</div>
          <div className="text-center">Selling here</div>
        </TableHead>

        {trading.map((branch) => {
          const hold = item.holds.find((candidate) => candidate.branchId === branch.id);
          const boxId = `${uid}-${branch.id}`;
          return (
            <div
              key={branch.id}
              className={cn(tableRowClass("saved"), TABLE_ROW, TABLE_ROW_COLUMNS)}
              style={tableRowStyle(columns)}
            >
              <div className="flex min-h-11 items-center lg:min-h-0">
                <span className="text-sm">{branch.shortName}</span>
              </div>

              {/* What is saved right now, which is not what the box shows once
                  somebody has ticked it. Keeping both means a person can see
                  what they are changing from, and it is the only place a timed
                  hold set at the counter can be read. */}
              <div className="flex min-h-11 items-center lg:min-h-0">
                <span className={cn("text-sm", hold ? "text-nybb-bone/70" : "text-nybb-bone")}>
                  {availabilityStatusLine(hold)}
                </span>
              </div>

              <div className={TABLE_MARK_CELL}>
                <WorkspaceCheckbox
                  id={boxId}
                  checked={drafts[branch.id] ?? true}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [branch.id]: event.target.checked }))
                  }
                  disabled={pending}
                  // Names its own row. A column of boxes all called "Selling
                  // here" is a column of identical choices to anyone who
                  // cannot see which row they are in.
                  aria-label={`Sell ${item.name} at ${branch.shortName}`}
                />
                <label htmlFor={boxId} className={TABLE_MARK_WORD}>
                  Selling here
                </label>
              </div>
            </div>
          );
        })}

        {/* The commit, after everything it commits, on the rule DESIGN.md
            states for a form's foot. Quiet until there is something to save,
            like every repeated control in this system: orange here would mean
            "this is a form" rather than "this is the action". */}
        <div className="border-nybb-bone/15 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t pt-4">
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
              {changed.length === 1
                ? "1 counter changed."
                : `${changed.length} counters changed.`}
            </p>
          ) : null}
        </div>
        <MenuStatusMessage state={state} />
      </form>
    </WorkspaceSection>
  );
}
