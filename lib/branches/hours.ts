import { z } from "zod";

/**
 * A counter's week, as a customer reads it.
 *
 * Pure and outside the reader so the formatting rules can be tested without a
 * database. They are small, but each of them is a place a schedule can be
 * misread by somebody deciding whether to drive across Cebu.
 *
 * THE COLUMNS' MEANING COMES FROM 0026, AND IS NOT RESTATED DIFFERENTLY HERE.
 *
 *   - An open day with equal times is a continuous 24 hours.
 *   - A close earlier than the open crosses midnight into the next day.
 *   - A weekday with no row has not been set, which is not the same as closed.
 *
 * The times are nullable because the column is. A closed day may carry no
 * window at all, and `z.coerce` here would read that null as midnight, which
 * is AGENTS.md rule 6 arriving as a shop that opens at 12 AM.
 */

const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const storeHoursRowSchema = z.object({
  slug: z.string().min(1),
  weekday: z.number().int().min(0).max(6),
  isClosed: z.boolean(),
  opensAt: clock.nullable(),
  closesAt: clock.nullable(),
});

export const storeHoursSchema = z.array(storeHoursRowSchema);

export type StoreHoursRow = z.infer<typeof storeHoursRowSchema>;

export type DayHours = {
  /** 0 is Sunday, matching Postgres `extract(dow)` and `Date#getDay`. */
  weekday: number;
  day: string;
  kind: "open" | "all-day" | "closed" | "unset";
  /** The sentence for this day, already worded. */
  text: string;
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Monday first. A Cebu office worker plans the week from Monday, and a list
 * that opens on Sunday puts the one quiet day at the top.
 */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** "10:00" to "10 AM", "13:30" to "1:30 PM". Noon and midnight say 12. */
export function formatClock(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function describeDay(row: StoreHoursRow | undefined, weekday: number): DayHours {
  const day = DAY_NAMES[weekday];

  if (!row) return { weekday, day, kind: "unset", text: "Not set" };
  if (row.isClosed) return { weekday, day, kind: "closed", text: "Closed" };

  // An open day with a missing time cannot be drawn truthfully. The table's
  // check constraint forbids it, so this is a guard, not a case.
  if (row.opensAt === null || row.closesAt === null) {
    return { weekday, day, kind: "unset", text: "Not set" };
  }

  if (row.opensAt === row.closesAt) {
    return { weekday, day, kind: "all-day", text: "Open 24 hours" };
  }

  return {
    weekday,
    day,
    kind: "open",
    text: `${formatClock(row.opensAt)} to ${formatClock(row.closesAt)}`,
  };
}

/**
 * The seven days of one branch, Monday first, or null when nothing is set.
 *
 * Null rather than seven "Not set" rows, because a whole unpublished week is
 * one fact and the page says it once.
 */
export function weekFor(rows: StoreHoursRow[], slug: string): DayHours[] | null {
  const mine = rows.filter((row) => row.slug === slug);
  if (mine.length === 0) return null;

  const byDay = new Map(mine.map((row) => [row.weekday, row]));
  return WEEK_ORDER.map((weekday) => describeDay(byDay.get(weekday), weekday));
}

/**
 * The week in one line, for the directory card, or null when it cannot be one.
 *
 * Only a week that is the same every day collapses. "Hours vary by day" is
 * the honest line for anything else: a card that picked one day to show would
 * be right six days out of seven at best.
 */
export function summarizeWeek(week: DayHours[] | null): string | null {
  if (!week) return null;
  const first = week[0];
  const uniform = week.every((day) => day.kind === first.kind && day.text === first.text);

  if (!uniform) return "Hours vary by day";
  if (first.kind === "all-day") return "Open 24 hours, every day";
  if (first.kind === "open") return `${first.text}, every day`;
  return null;
}

/** Today's weekday where the counter is, not where the server happens to be. */
export function weekdayIn(timezone: string, at: Date = new Date()): number {
  const name = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: timezone }).format(at);
  return DAY_NAMES.indexOf(name);
}
