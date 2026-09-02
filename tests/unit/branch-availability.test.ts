import { describe, expect, it } from "vitest";
import {
  actableBranches,
  availabilityStatusLine,
  branchesNeedingReason,
  changedBranches,
  reasonByBranch,
  formatManilaInstant,
  holdSummary,
  manilaInputValue,
  sellsHereByBranch,
  tradingBranches,
  untilByBranch,
} from "@/lib/staff/branch-availability";
import type { HoldReason, ManagedBranch, ManagedHold } from "@/lib/staff/menu-types";

/**
 * The "Available at" section's decisions, tested away from the component that
 * makes them, per AGENTS.md rule 6. Every case below is one that looks right
 * with a single branch trading and goes wrong when a second opens, which is
 * the whole reason this feature exists.
 */

const pilot: ManagedBranch = { id: "branch-pilot", shortName: "Central Bloc", isActive: true };
const other: ManagedBranch = { id: "branch-other", shortName: "Banilad", isActive: true };
const shut: ManagedBranch = { id: "branch-shut", shortName: "Ayala Center Cebu", isActive: false };

function hold(
  branch: ManagedBranch,
  unavailableUntil: string | null = null,
  reason: HoldReason | null = "out_of_stock",
): ManagedHold {
  return {
    branchId: branch.id,
    branchShortName: branch.shortName,
    kind: unavailableUntil ? "until" : "indefinite",
    unavailableUntil,
    reason,
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

describe("actableBranches", () => {
  it("gives a cashier only the counter they are standing in", () => {
    expect(actableBranches([pilot, other], pilot.id)).toEqual([pilot]);
  });

  it("gives a roving manager every trading counter", () => {
    // This is what lets one Save take an item off several at once. The old
    // control had a picker instead, so a manager set one counter, waited for
    // it, and set the next.
    expect(actableBranches([pilot, other, shut], null)).toEqual([pilot, other]);
  });

  it("never offers a counter that has never opened, even as a cashier's own", () => {
    expect(actableBranches([shut], shut.id)).toEqual([]);
  });
});

describe("untilByBranch", () => {
  it("seeds empty for a counter with no hold and for an indefinite one", () => {
    expect(untilByBranch([hold(other)], [pilot, other])).toEqual({
      "branch-pilot": "",
      "branch-other": "",
    });
  });

  it("seeds a timed hold in Manila wall clock, not in UTC", () => {
    // 10:00 UTC is 6pm in Cebu. Seeding the raw ISO would show 10:00 and
    // saving it back would move the hold eight hours earlier.
    expect(untilByBranch([hold(pilot, "2026-08-25T10:00:00.000Z")], [pilot])).toEqual({
      "branch-pilot": "2026-08-25T18:00",
    });
  });
});

describe("changedBranches", () => {
  it("sends nothing when nothing moved", () => {
    const holds = [hold(other)];
    const selling = sellsHereByBranch(holds, [pilot, other]);
    const untils = untilByBranch(holds, [pilot, other]);
    const reasons = reasonByBranch(holds, [pilot, other]);
    expect(changedBranches(selling, untils, reasons, holds, [pilot, other])).toEqual([]);
  });

  it("sends only the counter that moved, not its neighbours", () => {
    expect(
      changedBranches({ "branch-pilot": false, "branch-other": true }, { "branch-pilot": "", "branch-other": "" }, {},
        [],
        [pilot, other],
      ),
    ).toEqual([{ branchId: "branch-pilot", name: "Central Bloc", sellHere: false, until: "", reason: "" }]);
  });

  it("sends several at once, which is the whole point of one Save", () => {
    expect(
      changedBranches({ "branch-pilot": false, "branch-other": false }, {}, {},
        [],
        [pilot, other],
      ),
    ).toHaveLength(2);
  });

  it("treats a changed end as a change, with the box still unticked", () => {
    // Moving a hold from 6pm to 9pm leaves the box unticked either way. A
    // comparison that looked only at the box would decide nothing happened
    // and quietly discard the new time.
    const holds = [hold(pilot, "2026-08-25T10:00:00.000Z")];
    const changed = changedBranches({ "branch-pilot": false }, { "branch-pilot": "2026-08-25T21:00" }, {},
      holds,
      [pilot],
    );
    expect(changed).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: false, until: "2026-08-25T21:00", reason: "" },
    ]);
  });

  it("does not resend a timed hold that was only looked at", () => {
    // The field is seeded from the saved hold, so opening the control and
    // pressing Save must not rewrite an untouched 6pm hold.
    const holds = [hold(pilot, "2026-08-25T10:00:00.000Z")];
    expect(
      changedBranches(
        { "branch-pilot": false },
        untilByBranch(holds, [pilot]),
        reasonByBranch(holds, [pilot]),
        holds,
        [pilot],
      ),
    ).toEqual([]);
  });

  it("carries a tick back as a lift, with no end attached", () => {
    const holds = [hold(pilot, "2026-08-25T10:00:00.000Z")];
    expect(
      changedBranches({ "branch-pilot": true }, untilByBranch(holds, [pilot]), {}, holds, [pilot]),
    ).toEqual([{ branchId: "branch-pilot", name: "Central Bloc", sellHere: true, until: "", reason: "" }]);
  });

  it("ignores a draft for a counter that is no longer listed", () => {
    expect(
      changedBranches({ "branch-shut": false, "branch-pilot": false }, {}, {}, [], [pilot]),
    ).toEqual([{ branchId: "branch-pilot", name: "Central Bloc", sellHere: false, until: "", reason: "" }]);
  });
});

describe("manilaInputValue", () => {
  it("converts an instant into a Manila datetime-local value", () => {
    expect(manilaInputValue("2026-08-25T10:00:00.000Z")).toBe("2026-08-25T18:00");
  });

  it("rolls the date over when Manila is already on the next day", () => {
    // 17:00 UTC is 1am tomorrow in Cebu. Slicing the ISO string would print
    // yesterday's date beside tomorrow's time.
    expect(manilaInputValue("2026-08-25T17:00:00.000Z")).toBe("2026-08-26T01:00");
  });
});

describe("availabilityStatusLine", () => {
  it("says available when nothing holds the item", () => {
    expect(availabilityStatusLine(undefined)).toBe("Available");
  });

  it("reads back an indefinite hold as one somebody has to lift", () => {
    expect(availabilityStatusLine(hold(pilot))).toBe(
      "Sold out (out of stock) until someone puts it back",
    );
  });

  it("reads back a timed hold set at the counter, with its end", () => {
    // The kinds this screen does not write still have to be legible on it.
    const line = availabilityStatusLine(hold(pilot, "2026-08-25T10:00:00.000Z"));
    expect(line).toContain("Sold out (out of stock) until");
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

describe("holdSummary", () => {
  it("says nothing when nothing is held", () => {
    expect(holdSummary([])).toBeNull();
  });

  it("names the counter and reuses the item editor's own sentence", () => {
    // The two screens describing one hold in their own words is how they came
    // to disagree. The menu list used to print "Sold out at Central Bloc" for
    // BOTH an indefinite hold and one ending at 6pm, so the only way to tell
    // them apart was to open the editor.
    expect(holdSummary([hold(pilot)])).toBe(
      "Central Bloc: sold out (out of stock) until someone puts it back",
    );
  });

  it("carries the end time through, which the old summary dropped", () => {
    const line = holdSummary([hold(pilot, "2026-08-25T10:00:00.000Z")]);
    expect(line).toContain("Central Bloc: sold out (out of stock) until");
    expect(line).toContain("Aug 25, 2026");
  });

  it("names the counters and drops the ends once there are several", () => {
    // Two ends will differ, and a row in a list has no room for both. The
    // editor is where they are read.
    expect(holdSummary([hold(pilot), hold(other, "2026-08-25T10:00:00.000Z")])).toBe(
      "Sold out at Central Bloc, Banilad",
    );
  });
});

describe("reasonByBranch", () => {
  it("seeds a counter's saved reason and leaves an unheld one empty", () => {
    expect(reasonByBranch([hold(other, null, "equipment")], [pilot, other])).toEqual({
      "branch-pilot": "",
      "branch-other": "equipment",
    });
  });

  it("seeds empty for a hold written before the column existed", () => {
    // Null is not a fourth reason. A row from before 0058 has none, and
    // showing one would be inventing what somebody chose.
    expect(reasonByBranch([hold(pilot, null, null)], [pilot])).toEqual({ "branch-pilot": "" });
  });
});

describe("branchesNeedingReason", () => {
  it("names a counter being taken off with no reason chosen", () => {
    expect(
      branchesNeedingReason({ "branch-pilot": false }, { "branch-pilot": "" }, [pilot]),
    ).toEqual([pilot]);
  });

  it("asks nothing of a counter going back on sale", () => {
    // There is no hold for a reason to belong to, and asking for one would be
    // a form in the way of good news.
    expect(
      branchesNeedingReason({ "branch-pilot": true }, { "branch-pilot": "" }, [pilot]),
    ).toEqual([]);
  });

  it("is satisfied once every stopped counter has one", () => {
    expect(
      branchesNeedingReason(
        { "branch-pilot": false, "branch-other": false },
        { "branch-pilot": "equipment", "branch-other": "ingredients" },
        [pilot, other],
      ),
    ).toEqual([]);
  });
});

describe("changedBranches, on the reason", () => {
  it("treats a corrected reason as a change, with the box untouched", () => {
    // Correcting "out of stock" to "equipment issue" leaves the box unticked
    // and the time alone. A comparison watching only those two would drop the
    // correction, and the screen would show a change that never happened.
    const holds = [hold(pilot, null, "out_of_stock")];
    expect(
      changedBranches(
        { "branch-pilot": false },
        untilByBranch(holds, [pilot]),
        { "branch-pilot": "equipment" },
        holds,
        [pilot],
      ),
    ).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: false, until: "", reason: "equipment" },
    ]);
  });

  it("sends no reason on a counter going back on sale", () => {
    const holds = [hold(pilot, null, "equipment")];
    expect(
      changedBranches({ "branch-pilot": true }, {}, { "branch-pilot": "equipment" }, holds, [pilot]),
    ).toEqual([
      { branchId: "branch-pilot", name: "Central Bloc", sellHere: true, until: "", reason: "" },
    ]);
  });
});
