import type { ManagedBranch, ManagedHold } from "@/lib/staff/menu-types";

/**
 * What the "Available at" section works out before it renders anything.
 *
 * This is in lib/ for the reason AGENTS.md rule 6 gives: a component in this
 * project cannot be unit tested, because there is no DOM environment in the
 * suite, so anything that decides something inside one is invisible to the
 * tests. The decisions here are small and all three have a wrong answer that
 * would look plausible on screen with one branch trading and only go wrong
 * when the second opens, which is exactly the class of bug this feature
 * exists to fix. So they live out here where a test can reach them.
 */

/**
 * The counters a question about availability can be asked about.
 *
 * Eight of the nine branch rows have never opened. `branches` deliberately
 * carries all of them, because the hold control's picker and the audit log
 * want their names, so filtering is the caller's job and this is the caller
 * that does it.
 */
export function tradingBranches(branches: ManagedBranch[]): ManagedBranch[] {
  return branches.filter((branch) => branch.isActive);
}

/**
 * How many of the trading counters are not selling this item.
 *
 * Counted against the trading list rather than by taking `holds.length`. A
 * hold can outlive its branch's trading: closing a branch does not delete the
 * holds set while it was open, and `staff_set_menu_item_hold` has no reason
 * to. Counting the raw array would report "2 of 1 sold out" on a screen
 * listing one counter, which is not a rounding error but a sentence that
 * cannot be true.
 */
export function soldOutCount(holds: ManagedHold[], trading: ManagedBranch[]): number {
  return holds.filter((hold) => trading.some((branch) => branch.id === hold.branchId)).length;
}

/**
 * What the button on a counter's row does next.
 *
 * "lift" is the hold schema's word for deleting the row. Setting one from the
 * item editor is always `indefinite`, "until someone puts it back", because
 * this screen answers "do we sell this here" and not "are we out right now".
 * The timed kinds stay on the menu list, where the person with the empty
 * fryer already is. See the note on BranchAvailability.
 */
export function nextHoldKind(held: boolean): "lift" | "indefinite" {
  return held ? "lift" : "indefinite";
}

/**
 * One counter's state, in a sentence.
 *
 * Reads every kind, not only the kind this screen writes. A cashier can have
 * held the item until 6pm an hour ago, and the owner looking at this page has
 * to see that rather than a bare "sold out" that hides when it comes back.
 */
export function availabilityStatusLine(hold: ManagedHold | undefined): string {
  if (!hold) return "Available";
  if (hold.unavailableUntil) return `Sold out until ${formatManilaInstant(hold.unavailableUntil)}`;
  return "Sold out until someone puts it back";
}

/**
 * "Aug 25, 2026, 11:59 PM".
 *
 * Manila, explicitly. The staff reading this are in Cebu and the server is
 * not; a hold that ends at 6pm their time must not be read back as 10am
 * because the process runs in UTC.
 */
export function formatManilaInstant(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}
