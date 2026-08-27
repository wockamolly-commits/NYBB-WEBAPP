/**
 * The date-input helpers the Workspace filters share.
 *
 * Every operating surface in this app reads a calendar day the way the counter
 * does, in Asia/Manila, while every stored timestamp is UTC. Turning a
 * `<input type="date">` value into a half-open UTC window is therefore a rule
 * rather than a formatting detail, and it lives in one file so the order
 * history and the audit log cannot disagree about where a day starts.
 *
 * The offset is a literal +08:00 rather than a timezone lookup because the
 * Philippines has one zone and has never observed daylight saving. If a second
 * country ever appears, this is the one place that has to learn about it.
 */

export function isValidWorkspaceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function manilaDateStartIso(value: string): string | null {
  if (!isValidWorkspaceDate(value)) return null;
  return new Date(`${value}T00:00:00+08:00`).toISOString();
}

export function manilaDateEndExclusiveIso(value: string): string | null {
  const start = manilaDateStartIso(value);
  if (!start) return null;
  return new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
}

/**
 * A `<input type="datetime-local">` value, "YYYY-MM-DDTHH:mm" with seconds
 * optional, carries no offset of its own. It is a Manila wall clock reading,
 * what the counter's own clock says, not what the server process's timezone
 * happens to be, so turning it into an instant belongs here with the rest of
 * this file's Manila arithmetic rather than inlined in a Server Action.
 */
export function manilaWallClockIso(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, datePart, hour, minute, second = "00"] = match;
  if (!isValidWorkspaceDate(datePart)) return null;
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) return null;
  const instant = new Date(`${datePart}T${hour}:${minute}:${second}+08:00`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** First value of a repeated query parameter, trimmed to a usable string. */
export function firstSearchValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}
