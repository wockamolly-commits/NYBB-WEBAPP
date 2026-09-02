"use client";

import { LoaderCircle, PauseCircle, PlayCircle } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
import {
  TABLE_ROW,
  TABLE_ROW_COLUMNS,
  TableHead,
  tableColumns,
  tableRowClass,
  tableRowStyle,
} from "@/components/ui/WorkspaceTable";
import { cn } from "@/lib/utils";
import {
  availabilityStatusLine,
  nextHoldKind,
  soldOutCount,
  tradingBranches,
} from "@/lib/staff/branch-availability";
import type {
  ManagedBranch,
  ManagedHold,
  ManagedItem,
  MenuActionState,
} from "@/lib/staff/menu-types";
import { setMenuItemHold } from "../actions";
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
 * question: which counters sell this item at all. So it sets and lifts, and
 * the hold it writes is `indefinite`, "until someone puts it back", which is
 * the only kind that means "we do not sell this here" rather than "we are out
 * right now". Timed holds stay where they belong, on the screen the person
 * with the empty fryer is already looking at.
 *
 * A second full kind-and-time control here would be two implementations of
 * one thing, and the more dangerous half is that they would drift. What this
 * does instead is READ every kind faithfully, including a timed hold set at
 * the counter an hour ago, and let it be lifted from here. One table, two
 * screens onto it, no second way to say the same thing.
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

  // The columns, once, for the header and every row. Two hand written lists
  // drift on the first change: see WorkspaceTable.
  const columns = tableColumns("minmax(8rem,1fr)", "minmax(10rem,1.4fr)", "12rem");

  return (
    <WorkspaceSection
      title="Available at"
      description={
        <>
          <p>
            Which counters sell this item. Taking it off one counter leaves it on every other one,
            and leaves it on the menu of a customer who has not chosen a store yet.
          </p>
          <p>
            This is the long running answer. To stop selling it for one shift, mark it sold out
            from the menu list, which lets you say when it comes back.
          </p>
        </>
      }
      aside={
        trading.length === 0
          ? undefined
          : `${soldOutCount(item.holds, trading)} of ${trading.length} sold out`
      }
    >
      {trading.length === 0 ? (
        <p className="text-nybb-bone/65 text-sm">
          No branch is trading yet. Once one opens it appears here.
        </p>
      ) : (
        <div>
          <TableHead columns={columns}>
            <div>Counter</div>
            <div>Status</div>
            <div />
          </TableHead>
          {trading.map((branch) => (
            <BranchRow
              key={branch.id}
              item={item}
              branch={branch}
              hold={item.holds.find((candidate) => candidate.branchId === branch.id)}
              columns={columns}
            />
          ))}
        </div>
      )}
    </WorkspaceSection>
  );
}

/**
 * One counter.
 *
 * Its own <form> with its own action state, which is why it is a component
 * rather than a loop body: two counters changed in a row must not share one
 * pending flag or one message. The same reason every other row in this
 * codebase is its own form.
 */
function BranchRow({
  item,
  branch,
  hold,
  columns,
}: {
  item: ManagedItem;
  branch: ManagedBranch;
  hold: ManagedHold | undefined;
  columns: string;
}) {
  const [state, action, pending] = useActionState(setMenuItemHold, initialState);
  const held = hold !== undefined;

  return (
    <div className={tableRowClass("saved")}>
      <form
        action={action}
        className={cn(TABLE_ROW, TABLE_ROW_COLUMNS)}
        style={tableRowStyle(columns)}
      >
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="branchId" value={branch.id} />
        {/* "lift" is the schema's word for deleting the hold row. Setting one
            from here is always indefinite: see the note on the section. */}
        <input type="hidden" name="kind" value={nextHoldKind(held)} />

        <div className="flex min-h-11 items-center lg:min-h-0">
          <span className="text-sm">{branch.shortName}</span>
        </div>

        <div className="flex min-h-11 items-center lg:min-h-0">
          <span className={cn("text-sm", held ? "text-nybb-bone/70" : "text-nybb-bone")}>
            {availabilityStatusLine(hold)}
          </span>
        </div>

        <div className="flex items-center lg:justify-end">
          {/* Quiet at rest, like every repeated control in this system. The
              button that puts an item back is the one worth reaching for, so
              it takes the primary tone and the one that takes it away does
              not. Its accessible name carries the counter: a column of
              buttons all called "Mark sold out" is a column of identical
              choices to anyone who cannot see which row they are in. */}
          <Button
            type="submit"
            tone="dark"
            variant={held ? "primary" : "secondary"}
            disabled={pending}
            aria-label={
              held
                ? `Put ${item.name} back on the menu at ${branch.shortName}`
                : `Stop selling ${item.name} at ${branch.shortName}`
            }
            className="min-h-11 w-full lg:w-auto"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : held ? (
              <PlayCircle aria-hidden className="size-4" />
            ) : (
              <PauseCircle aria-hidden className="size-4" />
            )}
            {held ? "Put back" : "Stop selling"}
          </Button>
        </div>
      </form>
      <MenuStatusMessage state={state} />
    </div>
  );
}
