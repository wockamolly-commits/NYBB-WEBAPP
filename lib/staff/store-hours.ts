const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * A day whose opening and closing times are equal but are not midnight to
 * midnight, as a sentence naming it, or null when there is none.
 *
 * branch_is_open_at (0026) reads ANY equal pair as a 24 hour day, so 10:00 AM
 * to 10:00 AM entered by mistake opened the counter around the clock with no
 * warning. Midnight to midnight is the deliberate way to say "all day", and it
 * is the only equal pair the settings screen accepts.
 */
export function accidentalAllDay(
  hours: ReadonlyArray<{
    weekday: number;
    is_closed: boolean;
    opens_at: string | null;
    closes_at: string | null;
  }>,
): string | null {
  const day = hours.find(
    (entry) =>
      !entry.is_closed &&
      entry.opens_at !== null &&
      entry.opens_at === entry.closes_at &&
      entry.opens_at !== "00:00",
  );
  if (!day) return null;
  return (
    `${WEEKDAYS[day.weekday]} opens and closes at the same time. To stay open all day, ` +
    "set 12:00 AM to 12:00 AM."
  );
}
