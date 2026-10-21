/**
 * The pickup grid is anchored to the branch's local midnight (see
 * get_pickup_slots), so its windows only line up from one day to the next when
 * the slot length divides a day evenly. A 25 minute slot gave 23:45, 00:10 ...
 * before midnight and 00:25, 00:50 ... after it, so a page loaded before
 * midnight offered windows the server no longer recognised.
 *
 * Migration 0092 holds the same rule as a check constraint on branches.
 */
export function slotMinutesDivideDay(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes > 0 && 1440 % minutes === 0;
}

export const SLOT_MINUTES_MESSAGE =
  "Slot length has to divide a day evenly, for example 10, 15, 20, 30 or 60 minutes.";
