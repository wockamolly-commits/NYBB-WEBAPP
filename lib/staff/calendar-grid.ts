/**
 * The month a date picker draws, as arithmetic rather than as a component.
 *
 * WHY THIS IS NOT INSIDE THE PICKER.
 * ================================================================
 * Everything here is a pure function of a year and a month, so it can be
 * tested without a browser, and the component that renders it stays a matter
 * of markup and focus. It is also the part that is easy to get quietly wrong:
 * a grid built from a local `new Date(y, m, d)` is correct on the machine that
 * wrote it and one day out for anybody east or west of it. Every calculation
 * below runs through `Date.UTC` and the UTC getters, so no offset, and no
 * daylight saving rule anywhere in the world, can move a square.
 *
 * The values are the same "YYYY-MM-DD" strings a `<input type="date">` reads
 * and writes, which is what lets the picker hand its answer straight to the
 * input and the form submit it unchanged. Day arithmetic is not repeated here:
 * lib/staff/manila-dates.ts already owns it.
 */

/** A calendar month. `month` is 1 to 12, the way a person says it. */
export type CalendarMonth = { year: number; month: number };

/** One square of the grid. */
export type CalendarCell = {
  /** "YYYY-MM-DD", ready for the input. */
  value: string;
  /** The day number to print. */
  day: number;
  /**
   * False for the leading and trailing squares borrowed from the neighbouring
   * months. They are drawn, because a grid that ended mid row would make the
   * first and last weeks of a month look truncated, but they are dimmed.
   */
  inMonth: boolean;
};

/**
 * Two letters each, starting Sunday, which is the week the Philippines prints
 * on its calendars and the one the browser's own picker was already using.
 */
export const WEEKDAY_INITIALS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

/** The full weekday names, for the column headers' accessible text. */
export const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/**
 * Six rows of seven, always.
 *
 * A grid sized to the month is between four and six rows, so the popup would
 * change height as you paged through the year and the buttons under it would
 * move out from under the cursor. A fixed six keeps it still.
 */
export const CALENDAR_ROWS = 6;
const CALENDAR_CELLS = CALENDAR_ROWS * 7;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** A `<input type="date">` value from its three parts. `month` is 1 to 12. */
export function toDateValue(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

/** The month a "YYYY-MM-DD" value falls in, or null if it is not one. */
export function monthOf(value: string): CalendarMonth | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

/** The number of days in a month. */
export function daysInMonth({ year, month }: CalendarMonth): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The month `by` months away, rolling the year over in either direction. */
export function shiftMonth({ year, month }: CalendarMonth, by: number): CalendarMonth {
  const moved = new Date(Date.UTC(year, month - 1 + by, 1));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1 };
}

/**
 * The same day of the month, `by` months away, held inside the month it lands
 * in. Stepping a month from the 31st has to land somewhere, and the end of the
 * shorter month is the only answer that does not skip it entirely.
 */
export function shiftDateByMonths(value: string, by: number): string {
  const from = monthOf(value);
  if (!from) return value;
  const day = Number(value.slice(8, 10));
  const target = shiftMonth(from, by);
  return toDateValue(target.year, target.month, Math.min(day, daysInMonth(target)));
}

/** "August 2026". */
export function monthLabel({ year, month }: CalendarMonth): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

/** "Friday, 29 August 2026", for the accessible name of one square. */
export function dayLabel(value: string): string {
  const parts = monthOf(value);
  if (!parts) return value;
  return new Date(Date.UTC(parts.year, parts.month - 1, Number(value.slice(8, 10))))
    .toLocaleDateString("en-GB", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
}

/** The forty two squares of a month, Sunday first. */
export function monthGrid({ year, month }: CalendarMonth): CalendarCell[] {
  const lead = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const cells: CalendarCell[] = [];
  for (let index = 0; index < CALENDAR_CELLS; index += 1) {
    const cursor = new Date(Date.UTC(year, month - 1, 1 - lead + index));
    const cursorMonth = cursor.getUTCMonth() + 1;
    const cursorYear = cursor.getUTCFullYear();
    cells.push({
      value: toDateValue(cursorYear, cursorMonth, cursor.getUTCDate()),
      day: cursor.getUTCDate(),
      inMonth: cursorYear === year && cursorMonth === month,
    });
  }
  return cells;
}
