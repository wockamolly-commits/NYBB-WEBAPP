export type StoreHoursDay = {
  /** 0 is Sunday, matching extract(dow) and the store_hours primary key. */
  weekday: number;
  isClosed: boolean;
  /** "HH:MM" in the branch's own timezone, or null on a closed day. */
  opensAt: string | null;
  closesAt: string | null;
};

export type BranchAvailability = {
  branchId: string;
  slug: string;
  name: string;
  shortName: string;
  timezone: string;
  isActive: boolean;
  isAcceptingOrders: boolean;
  prepMinutes: number;
  slotMinutes: number;
  slotCapacity: number;
  isOpenNow: boolean;
  acceptsOrdersNow: boolean;
  week: StoreHoursDay[];
  hasPublishedHours: boolean;
};

export type OrderIntakeSettings = {
  acceptingOrders: boolean;
  slotHorizonHours: number;
};

/** The small, deliberately non-sensitive response every availability action returns. */
export type AvailabilityActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  /** The canonical week returned after a successful hours write. */
  savedHours?: StoreHoursDay[];
};

/** Monday first, while the values keep the weekday numbers Postgres uses. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const WEEKDAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Fills the gaps, so every screen renders seven rows rather than some of them. */
export function toWeek(rows: readonly StoreHoursDay[]): StoreHoursDay[] {
  return Array.from({ length: 7 }, (_unused, weekday) => {
    const row = rows.find((entry) => entry.weekday === weekday);
    if (!row) return { weekday, isClosed: true, opensAt: null, closesAt: null };
    return { ...row, weekday };
  });
}

/** Converts the canonical database HH:MM value into the staff-facing 12-hour form. */
export function formatTime12(value: string): string {
  const [hourText, minute] = value.split(":");
  const hour = Number(hourText);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !minute?.match(/^\d{2}$/)) {
    return value;
  }
  return `${hour % 12 || 12}:${minute} ${hour < 12 ? "AM" : "PM"}`;
}

/** Parses the 12-hour form without leaking a locale-dependent browser time control into storage. */
export function parseTime12(value: string): string | null {
  const matched = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(value.trim());
  if (!matched) return null;
  const [, hourText, minute, meridiem] = matched;
  const hour = Number(hourText) % 12 + (meridiem.toUpperCase() === "PM" ? 12 : 0);
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

/** Keeps a staff-facing time field to digits, a valid 12-hour clock, and AM or PM. */
export function formatTime12Input(value: string, defaultMeridiem?: "AM" | "PM"): string {
  const upperValue = value.toUpperCase();
  const digits = upperValue.replace(/\D/g, "");
  if (!digits) return "";

  const firstHourDigit = digits[0];
  let hour = firstHourDigit;
  let position = 1;
  const possibleSecondHourDigit = digits[1];

  if (
    possibleSecondHourDigit
    && ((firstHourDigit === "0" && /[1-9]/.test(possibleSecondHourDigit))
      || (firstHourDigit === "1" && /[0-2]/.test(possibleSecondHourDigit)))
  ) {
    hour += possibleSecondHourDigit;
    position += 1;
  }

  const minuteFirstDigit = digits[position];
  let minute = "";
  if (minuteFirstDigit && /[0-5]/.test(minuteFirstDigit)) {
    minute = minuteFirstDigit;
    const minuteSecondDigit = digits[position + 1];
    if (minuteSecondDigit) minute += minuteSecondDigit;
  }

  const finalDigitPosition = upperValue.lastIndexOf(digits.at(-1) ?? "");
  const suffix = upperValue.slice(finalDigitPosition + 1);
  const meridiem = /^\s*([AP])\s*M?\s*$/.exec(suffix)?.[1] ?? "";
  const formattedTime = minute ? `${hour}:${minute}` : hour;
  if (meridiem) return `${formattedTime} ${meridiem}${suffix.trim().endsWith("M") ? "M" : ""}`;
  return minute.length === 2 && defaultMeridiem ? `${formattedTime} ${defaultMeridiem}` : formattedTime;
}

/** A staff-facing 12-hour schedule, including the explicit 24-hour-day state. */
export function formatWindow(day: StoreHoursDay): string {
  if (day.isClosed || !day.opensAt || !day.closesAt) return "Closed";
  if (day.closesAt === day.opensAt) return "Open 24 hours";
  return day.closesAt <= day.opensAt
    ? `${formatTime12(day.opensAt)} to ${formatTime12(day.closesAt)} next day`
    : `${formatTime12(day.opensAt)} to ${formatTime12(day.closesAt)}`;
}

export type AvailabilityReason =
  | "open"
  | "business_paused"
  | "not_live"
  | "no_hours"
  | "branch_paused"
  | "outside_hours";

/** Names the first database gate that currently prevents ordering. */
export function availabilityReason(
  branch: BranchAvailability,
  intake: OrderIntakeSettings,
): AvailabilityReason {
  if (branch.acceptsOrdersNow) return "open";
  if (!intake.acceptingOrders) return "business_paused";
  if (!branch.isActive) return "not_live";
  if (!branch.hasPublishedHours) return "no_hours";
  if (!branch.isAcceptingOrders) return "branch_paused";
  return "outside_hours";
}

export const AVAILABILITY_REASON_COPY: Record<AvailabilityReason, string> = {
  open: "Taking orders now.",
  business_paused: "Ordering is paused for the whole business, so no branch can take an order. Settings has the switch.",
  not_live: "This branch is not live on the platform yet, so customers cannot reach it. Settings has that switch.",
  no_hours: "No opening hours have been published for this branch, so it stays shut. Add the week in Settings.",
  branch_paused: "Orders are paused at this counter. Resume below when the kitchen is ready.",
  outside_hours: "Closed right now, outside the published hours for today.",
};
