import { describe, expect, it } from "vitest";
import {
  availabilityStatusLine,
  formatManilaInstant,
  nextHoldKind,
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

describe("nextHoldKind", () => {
  it("lifts a hold that exists", () => {
    expect(nextHoldKind(true)).toBe("lift");
  });

  it("sets an indefinite hold and never a timed one", () => {
    // The item editor answers "do we sell this here". A timed hold set from
    // here would expire on its own and put the item back at a counter that
    // was meant to stop selling it.
    expect(nextHoldKind(false)).toBe("indefinite");
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
