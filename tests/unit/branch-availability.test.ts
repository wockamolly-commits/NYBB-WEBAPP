import { describe, expect, it } from "vitest";
import {
  availabilityStatusLine,
  changedBranches,
  formatManilaInstant,
  sellsHereByBranch,
  soldOutCount,
  tradingBranches,
} from "@/lib/staff/branch-availability";
import type { ManagedBranch, ManagedHold } from "@/lib/staff/menu-types";

/**
 * The "Available at" section's decisions, tested away from the component that
 * makes them, per AGENTS.md rule 6. Every case below is one that looks right
 * with a single branch trading and goes wrong when a second opens, which is
 * the whole reason this feature exists.
 */

const pilot: ManagedBranch = { id: "branch-pilot", shortName: "Central Bloc", isActive: true };
const other: ManagedBranch = { id: "branch-other", shortName: "Banilad", isActive: true };
const shut: ManagedBranch = { id: "branch-shut", shortName: "Ayala Center Cebu", isActive: false };

function hold(branch: ManagedBranch, unavailableUntil: string | null = null): ManagedHold {
  return {
    branchId: branch.id,
    branchShortName: branch.shortName,
    kind: unavailableUntil ? "until" : "indefinite",
    unavailableUntil,
  };
}

describe("tradingBranches", () => {
  it("leaves out a branch that has never opened", () => {
    // "Is this item sold at Ayala Center Cebu" has no answer while nothing
    // has ever traded there, and offering the question invites somebody to
    // set a hold that no reader will ever consult.
    expect(tradingBranches([pilot, shut, other])).toEqual([pilot, other]);
  });

  it("keeps the order it was given, which is sort_order from the reader", () => {
    expect(tradingBranches([other, pilot]).map((branch) => branch.shortName)).toEqual([
      "Banilad",
      "Central Bloc",
    ]);
  });

  it("returns nothing rather than throwing when no branch trades", () => {
    expect(tradingBranches([shut])).toEqual([]);
  });
});

describe("soldOutCount", () => {
  it("counts a hold at a trading counter", () => {
    expect(soldOutCount([hold(pilot)], [pilot, other])).toBe(1);
  });

  it("ignores a hold left behind by a branch that has since closed", () => {
    // Closing a branch does not delete its holds, so the raw array outlives
    // the counter. Counting it would print "1 of 0 sold out" over a table
    // with no rows in it.
    expect(soldOutCount([hold(shut)], [pilot])).toBe(0);
  });

  it("is zero when nothing is held", () => {
    expect(soldOutCount([], [pilot, other])).toBe(0);
  });
});

describe("sellsHereByBranch", () => {
  it("ticks a counter with no hold and unticks one with a hold", () => {
    expect(sellsHereByBranch([hold(other)], [pilot, other])).toEqual({
      "branch-pilot": true,
      "branch-other": false,
    });
  });

  it("covers every trading counter, so no box starts undefined", () => {
    // A box seeded undefined renders unticked and reads as "we do not sell
    // here", which is the opposite of the truth for a counter with no hold.
    expect(Object.keys(sellsHereByBranch([], [pilot, other]))).toEqual([
      "branch-pilot",
      "branch-other",
    ]);
  });

  it("ignores a hold belonging to a counter that is not listed", () => {
    expect(sellsHereByBranch([hold(shut)], [pilot])).toEqual({ "branch-pilot": true });
  });
});

describe("changedBranches", () => {
  it("sends nothing when the ticks match what is saved", () => {
    // Save with nothing altered must not write. Every counter rewritten is an
    // audit row nobody asked for and one more thing that can fail.
    const saved = sellsHereByBranch([hold(other)], [pilot, other]);
    expect(changedBranches(saved, [hold(other)], [pilot, other])).toEqual([]);
  });

  it("sends only the counter that moved, not its neighbours", () => {
    const drafts = { "branch-pilot": false, "branch-other": true };
    expect(changedBranches(drafts, [], [pilot, other])).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: false },
    ]);
  });

  it("sends several at once, which is the whole point of one Save", () => {
    const drafts = { "branch-pilot": false, "branch-other": false };
    expect(changedBranches(drafts, [], [pilot, other])).toHaveLength(2);
  });

  it("carries a tick back as a lift", () => {
    const drafts = { "branch-pilot": true };
    expect(changedBranches(drafts, [hold(pilot)], [pilot])).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: true },
    ]);
  });

  it("ignores a draft for a counter that no longer trades", () => {
    // Only reachable from a page left open while a branch was switched off.
    // Writing a hold at a counter the screen is not showing would be
    // invisible to the person who pressed Save.
    const drafts = { "branch-shut": false, "branch-pilot": false };
    expect(changedBranches(drafts, [], [pilot])).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: false },
    ]);
  });
});

describe("availabilityStatusLine", () => {
  it("says available when nothing holds the item", () => {
    expect(availabilityStatusLine(undefined)).toBe("Available");
  });

  it("reads back an indefinite hold as one somebody has to lift", () => {
    expect(availabilityStatusLine(hold(pilot))).toBe("Sold out until someone puts it back");
  });

  it("reads back a timed hold set at the counter, with its end", () => {
    // The kinds this screen does not write still have to be legible on it.
    const line = availabilityStatusLine(hold(pilot, "2026-08-25T10:00:00.000Z"));
    expect(line).toContain("Sold out until");
    expect(line).toContain("Aug 25, 2026");
  });
});

describe("formatManilaInstant", () => {
  it("renders in Manila time and not in the server's zone", () => {
    // 10:00 UTC is 6pm in Cebu. Read back in UTC this says 10am, which is a
    // hold that appears to end eight hours before it does.
    expect(formatManilaInstant("2026-08-25T10:00:00.000Z")).toContain("6:00");
  });
});
