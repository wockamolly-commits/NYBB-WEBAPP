/**
 * Money is always minor units (centavos) as an integer, never a float. 12000 is
 * PHP 120.00. Nothing here multiplies or divides a peso value except the final
 * conversion for display.
 *
 * Formatted by hand rather than through `Intl.NumberFormat`, which the Next
 * codebase uses. Not out of preference: a JavaScript engine on a phone may ship
 * without the locale data, and a currency that silently renders as "PHP 1234"
 * on one device and "₱1,234.00" on another is worse on a screen where somebody
 * is deciding whether to pay.
 */

function group(whole: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** "PHP 1,234.00". The full form, for anything a customer is agreeing to. */
export function formatPeso(cents: number): string {
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const whole = group(String(Math.floor(absolute / 100)));
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${negative ? "-" : ""}PHP ${whole}.${fraction}`;
}

/** "1,234" or "12.50", for price chips where the currency is already stated. */
export function formatPesoCompact(cents: number): string {
  const absolute = Math.abs(Math.trunc(cents));
  const whole = group(String(Math.floor(absolute / 100)));
  const remainder = absolute % 100;
  return remainder === 0 ? whole : `${whole}.${String(remainder).padStart(2, "0")}`;
}

/**
 * "11:00 AM to 11:15 AM", in the branch's own timezone.
 *
 * The branch timezone rather than the phone's, because a pickup window is a
 * promise about a specific kitchen. A customer ordering from a phone still set
 * to another timezone must not be shown a time the counter does not recognize.
 */
export function formatPickupWindow(
  startsAt: string,
  endsAt: string,
  timeZone: string,
): string {
  return `${formatTime(startsAt, timeZone)} to ${formatTime(endsAt, timeZone)}`;
}

export function formatTime(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(date);
  } catch {
    // A device without the timezone database still gets a legible time rather
    // than an empty label, and the branch name beside it carries the rest.
    return date.toISOString().slice(11, 16);
  }
}

export function formatDay(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return "";

  try {
    return new Intl.DateTimeFormat("en-PH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
