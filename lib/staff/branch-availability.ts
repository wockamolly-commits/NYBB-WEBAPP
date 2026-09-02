import { manilaDateEndExclusiveIso } from "@/lib/staff/manila-dates";
import { HOLD_REASON_LABELS, type HoldReason } from "@/lib/staff/menu-types";
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
 * The counters this person may actually act on.
 *
 * A cashier's counter is fixed, so they get exactly their own and cannot mark
 * an item sold out at a branch they are not standing in. A roving manager or
 * an admin has no fixed counter and gets every trading one, which is what
 * lets them take an item off several in a single Save.
 *
 * The RPC refuses a branch the caller may not write anyway, so this is not
 * the security boundary; it is the difference between a screen that offers
 * what you can do and one that offers nine options and rejects eight.
 */
export function actableBranches(
  branches: ManagedBranch[],
  actingBranchId: string | null,
): ManagedBranch[] {
  const trading = tradingBranches(branches);
  if (!actingBranchId) return trading;
  return trading.filter((branch) => branch.id === actingBranchId);
}

/**
 * Whether each trading counter currently sells the item, as the tick boxes
 * start out.
 *
 * Keyed by branch id rather than positionally, so a branch appearing or
 * disappearing between one render and the next cannot shift somebody's ticks
 * onto the wrong counters.
 */
export function sellsHereByBranch(
  holds: ManagedHold[],
  trading: ManagedBranch[],
): Record<string, boolean> {
  const seeded: Record<string, boolean> = {};
  for (const branch of trading) {
    seeded[branch.id] = !holds.some((hold) => hold.branchId === branch.id);
  }
  return seeded;
}

/**
 * The reason each counter starts with, seeded from its saved hold.
 *
 * Seeded for the same reason the end is: opening the control on a counter
 * held for an equipment issue and pressing Save must not rewrite it as
 * something else, and must not blank it. A counter with no hold starts empty,
 * which is the unchosen state the Save button waits on.
 */
export function reasonByBranch(
  holds: ManagedHold[],
  branches: ManagedBranch[],
): Record<string, HoldReason | ""> {
  const seeded: Record<string, HoldReason | ""> = {};
  for (const branch of branches) {
    seeded[branch.id] = holds.find((h) => h.branchId === branch.id)?.reason ?? "";
  }
  return seeded;
}

/**
 * The counters still missing a reason, which is what holds the Save button.
 *
 * Only counters being taken off sale can be missing one. A counter going back
 * on sale has no hold for a reason to belong to, and asking for one would be
 * a form standing in the way of good news.
 */
export function branchesNeedingReason(
  sellsHere: Record<string, boolean>,
  reasons: Record<string, HoldReason | "">,
  branches: ManagedBranch[],
): ManagedBranch[] {
  return branches.filter(
    (branch) => !(sellsHere[branch.id] ?? true) && !reasons[branch.id],
  );
}

/**
 * The counters the Save button actually has to write.
 *
 * Only the changed ones, for the reason the price grid sends only changed
 * rows: an untouched counter rewritten is a write nobody asked for, an audit
 * row nobody asked for, and one more thing that can fail and take the save
 * down with it. Empty is normal and means Save was pressed with nothing
 * altered, which the action answers without touching the database.
 *
 * A draft for a branch that is not trading is ignored rather than sent. It
 * can only arrive from a stale page whose branch list has since changed, and
 * writing a hold at a counter this screen is no longer showing would be
 * invisible to the person who pressed the button.
 */
/**
 * The "back on" time each counter starts with, as a datetime-local value.
 *
 * Seeded from the saved hold so an end set an hour ago is shown rather than
 * silently dropped: opening the control on a counter held until 6pm and
 * pressing Save must not turn that into an indefinite hold. An indefinite
 * hold, and a counter with no hold at all, seed empty.
 *
 * The stored instant is UTC and the input speaks Manila wall clock, so this
 * converts rather than slicing the ISO string. Slicing would show a 6pm hold
 * as 10am, and saving it back would move the hold eight hours earlier.
 */
export function untilByBranch(
  holds: ManagedHold[],
  branches: ManagedBranch[],
): Record<string, string> {
  const seeded: Record<string, string> = {};
  for (const branch of branches) {
    const hold = holds.find((candidate) => candidate.branchId === branch.id);
    seeded[branch.id] = hold?.unavailableUntil ? manilaInputValue(hold.unavailableUntil) : "";
  }
  return seeded;
}

/**
 * An instant as the value a `datetime-local` input carries, in Manila wall
 * clock terms. "2026-08-25T18:00".
 */
export function manilaInputValue(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/**
 * The counters the Save button actually has to write.
 *
 * Only the changed ones, for the reason the price grid sends only changed
 * rows: an untouched counter rewritten is a write nobody asked for, an audit
 * row nobody asked for, and one more thing that can fail and take the save
 * down with it. Empty is normal and means Save was pressed with nothing
 * altered, which the action answers without touching the database.
 *
 * The END counts as a change, not just the tick. Moving a hold from 6pm to
 * 9pm leaves the box unticked either way, and a comparison that looked only
 * at the box would decide nothing had happened and quietly discard the new
 * time. The end is only compared where the counter is not selling, because
 * the field is not shown, not sent and not meaningful where it is.
 *
 * A draft for a branch that is not in the list is ignored rather than sent.
 * It can only arrive from a stale page whose counters have since changed, and
 * writing a hold at a counter this screen is no longer showing would be
 * invisible to the person who pressed the button.
 */
export function changedBranches(
  sellsHere: Record<string, boolean>,
  untils: Record<string, string>,
  reasons: Record<string, HoldReason | "">,
  holds: ManagedHold[],
  branches: ManagedBranch[],
): Array<{
  branchId: string;
  name: string;
  sellHere: boolean;
  until: string;
  reason: HoldReason | "";
}> {
  const savedSelling = sellsHereByBranch(holds, branches);
  const savedUntil = untilByBranch(holds, branches);
  const savedReason = reasonByBranch(holds, branches);

  return branches
    .filter((branch) => {
      if (!(branch.id in sellsHere)) return false;
      const selling = sellsHere[branch.id]!;
      if (selling !== savedSelling[branch.id]) return true;
      if (selling) return false;
      // Still off, so the two things that can still have moved are when it
      // comes back and why it went. Correcting a reason from "out of stock"
      // to "equipment issue" leaves the box untouched, and a comparison
      // watching only the box would drop the correction on the floor.
      return (
        (untils[branch.id] ?? "") !== (savedUntil[branch.id] ?? "") ||
        (reasons[branch.id] ?? "") !== (savedReason[branch.id] ?? "")
      );
    })
    .map((branch) => ({
      branchId: branch.id,
      name: branch.shortName,
      sellHere: sellsHere[branch.id]!,
      // Neither is sent for a counter that is selling: there is no hold to
      // put an end or a reason on, and the action would ignore both anyway.
      until: sellsHere[branch.id] ? "" : (untils[branch.id] ?? ""),
      reason: sellsHere[branch.id] ? "" : (reasons[branch.id] ?? ""),
    }));
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
  const when = hold.unavailableUntil
    ? `until ${formatManilaInstant(hold.unavailableUntil)}`
    : "until someone puts it back";
  // The reason in parentheses, and absent rather than guessed at when the row
  // predates 0058. "Sold out (no reason recorded)" would be a sentence about
  // a gap in the data pretending to be a sentence about the wings.
  const why = hold.reason ? ` (${HOLD_REASON_LABELS[hold.reason].toLowerCase()})` : "";
  return `Sold out${why} ${when}`;
}

/**
 * What the menu list prints under an item that is held somewhere.
 *
 * The same sentence the item editor's Now column shows, with the counter's
 * name in front of it, because on that screen the item is the row and the
 * branch is the detail. Both are built here so they cannot drift: the menu
 * list used to say "Sold out at Central Bloc" and stop there, so an item held
 * until 6pm and an item held indefinitely read identically, and the only way
 * to tell them apart was to open the editor.
 */
export function holdSummary(holds: ManagedHold[]): string | null {
  if (holds.length === 0) return null;
  if (holds.length === 1) return branchStatusLine(holds[0]!);
  // Several counters, so the ends differ and there is no room to print them
  // all. Name the counters; the editor is where the ends are read.
  return `Sold out at ${holds.map((hold) => hold.branchShortName).join(", ")}`;
}

/**
 * One counter's state with the counter named: "Central Bloc: sold out until
 * Aug 25, 2026, 6:00 PM".
 *
 * Only the first letter is lowered, not the whole sentence. Lowercasing the
 * lot is the obvious way to write this and it turns the date into "aug 25,
 * 2026, 6:00 pm", which is why there is a test for it.
 */
export function branchStatusLine(hold: ManagedHold): string {
  const sentence = availabilityStatusLine(hold);
  return `${hold.branchShortName}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
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

/** "Today" in Asia/Manila, as the YYYY-MM-DD the Manila helpers expect. */
export function manilaTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
}

/**
 * The end of the current Manila day, as a value a `datetime-local` input can
 * carry, in Manila wall clock terms.
 *
 * Shared by the control and the Server Action, which is why it is here rather
 * than in either. The control offers it as the "Rest of today" shortcut, and
 * the action compares an incoming end against it to decide whether the hold
 * is recorded as `today` or as `until`. Two copies of this would eventually
 * disagree by a day, and the audit trail would quietly stop meaning anything.
 */
export function endOfManilaDayInputValue(): string {
  const iso = manilaDateEndExclusiveIso(manilaTodayDate());
  if (!iso) return "";
  const manilaDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(iso),
  );
  return `${manilaDate}T00:00`;
}
