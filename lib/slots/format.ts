import type { PickupSlot, PickupSlots } from "./types";

/**
 * Turning windows into the words on the screen.
 *
 * All of it is pure and all of it takes the branch timezone as an argument.
 * Nothing here reads the machine's clock or the machine's locale: the shop is
 * in Cebu, and a customer ordering from Manila, or a staff member checking the
 * board from a laptop set to UTC, has to read the same closing time as
 * somebody standing at the counter.
 *
 * The clock is `generatedAt` from the payload, which is the database's own
 * now. That is what makes "Today" mean the same thing on the server render and
 * the client one, so the label cannot flip during hydration.
 */

/** "2026-08-06" at the branch, which is what groups windows into days. */
export function localDateKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

type ClockParts = { hour: string; minute: string; period: string };

/**
 * Built from parts rather than from a formatted string.
 *
 * `hour12` output differs between ICU versions and locales: "7:15 PM",
 * "7:15 pm", and a narrow no-break space before the period are all real. The
 * parts are stable, so the string is assembled here and the tests can assert
 * on an exact value.
 */
function clockParts(iso: string, timezone: string): ClockParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(iso));

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    hour: value("hour"),
    minute: value("minute"),
    period: value("dayPeriod").toLowerCase().replace(/\s/gu, ""),
  };
}

/** "7:15pm". The form spec section 10 N1 writes it in. */
export function formatSlotTime(iso: string, timezone: string): string {
  const { hour, minute, period } = clockParts(iso, timezone);
  return `${hour}:${minute}${period}`;
}

/**
 * "7:00 to 7:15pm", and "11:45am to 12:00pm" when the window crosses noon.
 *
 * Saying the period once is how a person says it out loud, but only when both
 * ends share one. The window straddling noon or midnight is exactly where
 * dropping it would mislead.
 */
export function formatSlotRange(
  // Only the two ends, so the confirmation screen can format the window it was
  // given back by place_order without inventing a capacity to go with it.
  slot: Pick<PickupSlot, "startsAt" | "endsAt">,
  timezone: string,
): string {
  const start = clockParts(slot.startsAt, timezone);
  const end = clockParts(slot.endsAt, timezone);

  const startText =
    start.period === end.period
      ? `${start.hour}:${start.minute}`
      : `${start.hour}:${start.minute}${start.period}`;

  return `${startText} to ${end.hour}:${end.minute}${end.period}`;
}

/** The day after a "2026-08-06" key, on the calendar rather than the clock. */
function nextDateKey(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

/**
 * "Today", "Tomorrow", or the weekday.
 *
 * Relative to the branch's day, not the reader's. A window at 00:15 on a shift
 * that started at 18:00 is genuinely tomorrow to the customer, even though the
 * kitchen thinks of it as tonight, and the customer is the one being asked.
 */
export function dayLabel(dateKey: string, timezone: string, nowIso: string): string {
  const today = localDateKey(nowIso, timezone);
  if (dateKey === today) return "Today";
  if (dateKey === nextDateKey(today)) return "Tomorrow";

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "UTC",
    weekday: "long",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export type SlotDay = {
  /** The local date, "2026-08-06". */
  key: string;
  label: string;
  slots: PickupSlot[];
};

/** Windows split into the days they belong to, in order. */
export function groupSlotsByDay(payload: PickupSlots): SlotDay[] {
  const timezone = payload.branch?.timezone;
  if (!timezone) return [];

  const days: SlotDay[] = [];
  for (const slot of payload.slots) {
    const key = localDateKey(slot.startsAt, timezone);
    const last = days[days.length - 1];

    if (last?.key === key) {
      last.slots.push(slot);
    } else {
      days.push({ key, label: dayLabel(key, timezone, payload.generatedAt), slots: [slot] });
    }
  }

  return days;
}

/**
 * "2 left", but only when it is nearly gone.
 *
 * A count on every window turns the picker into a spreadsheet. A count on the
 * last few is the nudge spec section 10 N1 is after, and it is honest: the
 * kitchen really is about to run out of that window.
 */
export function capacityNote(slot: PickupSlot): string | null {
  if (slot.remaining <= 0) return "Fully booked";
  if (slot.remaining <= 2) return `${slot.remaining} left`;
  return null;
}

export function isSlotOpen(slot: PickupSlot): boolean {
  return slot.remaining > 0;
}

/**
 * What to say when there is nothing to choose, or null when there is.
 *
 * Two of these five are the expected state of this project rather than
 * failures. Nobody has said which branch is the pilot, and nobody has given
 * its weekday hours, so the picker correctly offers nothing. The screen has to
 * read as "we are not open for this yet" and never as "this page is broken",
 * and it has to point at the phone numbers that do work today.
 */
export function unavailableMessage(
  payload: PickupSlots,
): { title: string; body: string } | null {
  const reason = payload.unavailableReason;
  if (!reason) return null;

  const shop = payload.branch?.shortName ?? "The branch";
  const horizon = payload.horizonHours;
  const window = horizon ? `the next ${horizon} hours` : "the hours ahead";

  switch (reason) {
    case "no_branch":
      return {
        title: "Pickup times are not open yet",
        body:
          "No branch has been switched on for online ordering, so there are no " +
          "windows to choose from. Call the branch you want to collect from and " +
          "they will take the order.",
      };
    case "no_hours":
      return {
        title: `${shop} has not published its opening hours`,
        body:
          "Windows appear here the moment its weekly hours are set. Until then, " +
          "call the branch and they will take the order.",
      };
    case "not_accepting":
      return {
        title: `${shop} is not taking online orders right now`,
        body:
          "This is a switch the shop controls, so it can come back at any time. " +
          "Call the branch if you need the order today.",
      };
    case "closed_now":
      return {
        title: `${shop} is closed for now`,
        body: `Nothing opens in ${window}. Try again when the shop is open, or call the branch.`,
      };
    case "fully_booked":
      return {
        title: "Every pickup window is full",
        body: `The kitchen is at capacity for ${window}. Try again later, or call the branch.`,
      };
  }
}
