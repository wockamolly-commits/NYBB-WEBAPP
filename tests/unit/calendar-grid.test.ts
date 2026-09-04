import { describe, expect, it } from "vitest";
import {
  CALENDAR_ROWS,
  dayLabel,
  daysInMonth,
  monthGrid,
  monthLabel,
  monthOf,
  shiftDateByMonths,
  shiftMonth,
  toDateValue,
} from "@/lib/staff/calendar-grid";

/**
 * The arithmetic behind the workspace date picker's calendar.
 *
 * The picker itself is markup and focus management, which a browser has to
 * judge. What a browser cannot usefully judge is whether the grid is built out
 * of the right days, and that is the part with the traps in it: a leap
 * February, a month that begins on a Sunday, a step from the 31st into a month
 * that has thirty days, and above all the offset bug, where a grid assembled
 * from local Date objects is correct in one timezone and one square out in
 * another. Everything below is fixed to UTC for exactly that reason, so these
 * assertions hold on any machine that runs them.
 */

describe("monthGrid", () => {
  it("always returns six full weeks, so the popup never changes height", () => {
    for (const month of [
      { year: 2026, month: 2 },
      { year: 2026, month: 8 },
      { year: 2027, month: 8 },
    ]) {
      expect(monthGrid(month)).toHaveLength(CALENDAR_ROWS * 7);
    }
  });

  it("opens the grid on a Sunday and closes it on a Saturday", () => {
    const cells = monthGrid({ year: 2026, month: 8 });
    // August 2026 starts on a Saturday, so the first row is almost all July.
    expect(cells[0]).toEqual({ value: "2026-07-26", day: 26, inMonth: false });
    expect(cells[6]).toEqual({ value: "2026-08-01", day: 1, inMonth: true });
    expect(cells.at(-1)).toEqual({ value: "2026-09-05", day: 5, inMonth: false });
  });

  it("marks only the month's own days as in month", () => {
    const cells = monthGrid({ year: 2026, month: 8 });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(31);
    expect(cells.filter((cell) => cell.inMonth).at(0)?.value).toBe("2026-08-01");
    expect(cells.filter((cell) => cell.inMonth).at(-1)?.value).toBe("2026-08-31");
  });

  it("borrows nothing at the front when the month starts on a Sunday", () => {
    // February 2026 begins on a Sunday, so there is no lead to borrow and the
    // 1st takes the first square. The six rows are still six rows: the run
    // carries on into March rather than stopping short at the 28th.
    const cells = monthGrid({ year: 2026, month: 2 });
    expect(cells[0]).toEqual({ value: "2026-02-01", day: 1, inMonth: true });
    expect(cells.at(-1)?.value).toBe("2026-03-14");
  });

  it("counts a leap February", () => {
    const cells = monthGrid({ year: 2028, month: 2 });
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(29);
  });

  it("carries every square in the same shape the input reads", () => {
    for (const cell of monthGrid({ year: 2026, month: 12 })) {
      expect(cell.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("shiftMonth", () => {
  it("rolls the year over in both directions", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 8 }, -12)).toEqual({ year: 2025, month: 8 });
  });
});

describe("shiftDateByMonths", () => {
  it("keeps the day of the month where the month is long enough", () => {
    expect(shiftDateByMonths("2026-08-29", 1)).toBe("2026-09-29");
    expect(shiftDateByMonths("2026-08-29", -1)).toBe("2026-07-29");
  });

  it("lands on the last day rather than overshooting into the next month", () => {
    // Stepping a month back from 31 March has to go somewhere. The end of
    // February is the only answer that does not skip the month entirely.
    expect(shiftDateByMonths("2026-03-31", -1)).toBe("2026-02-28");
    expect(shiftDateByMonths("2028-03-31", -1)).toBe("2028-02-29");
    expect(shiftDateByMonths("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("leaves a value it cannot read alone", () => {
    expect(shiftDateByMonths("", 1)).toBe("");
  });
});

describe("daysInMonth", () => {
  it("knows the short months and the leap year", () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 9 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });
});

describe("labels", () => {
  it("names the month the way the header prints it", () => {
    expect(monthLabel({ year: 2026, month: 8 })).toBe("August 2026");
  });

  it("gives each square a name a screen reader can read aloud", () => {
    expect(dayLabel("2026-08-29")).toBe("Saturday, 29 August 2026");
  });

  it("returns an unreadable value unchanged rather than inventing a date", () => {
    expect(dayLabel("")).toBe("");
  });
});

describe("toDateValue and monthOf", () => {
  it("round trips through the input's own format", () => {
    expect(toDateValue(2026, 8, 9)).toBe("2026-08-09");
    expect(monthOf("2026-08-09")).toEqual({ year: 2026, month: 8 });
  });

  it("refuses anything that is not that format", () => {
    expect(monthOf("")).toBeNull();
    expect(monthOf("2026-8-9")).toBeNull();
    expect(monthOf("29/08/2026")).toBeNull();
  });
});
