import { describe, expect, it } from "vitest";
import {
  formatClock,
  storeHoursRowSchema,
  summarizeWeek,
  weekdayIn,
  weekFor,
  type StoreHoursRow,
} from "@/lib/branches/hours";
import { directionsUrl, mapEmbedUrl } from "@/lib/branches/map";

function row(overrides: Partial<StoreHoursRow> = {}): StoreHoursRow {
  return {
    slug: "shell-gorordo",
    weekday: 1,
    isClosed: false,
    opensAt: "11:00",
    closesAt: "22:00",
    ...overrides,
  };
}

function everyDay(overrides: Partial<StoreHoursRow> = {}): StoreHoursRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => row({ weekday, ...overrides }));
}

describe("formatClock", () => {
  it("drops the minutes on the hour", () => {
    expect(formatClock("10:00")).toBe("10 AM");
    expect(formatClock("22:00")).toBe("10 PM");
  });

  it("keeps the minutes when there are some", () => {
    expect(formatClock("13:30")).toBe("1:30 PM");
    expect(formatClock("09:05")).toBe("9:05 AM");
  });

  it("calls noon 12 PM and midnight 12 AM, never 0", () => {
    expect(formatClock("12:00")).toBe("12 PM");
    expect(formatClock("00:00")).toBe("12 AM");
  });
});

describe("weekFor", () => {
  it("is null for a branch with nothing set, so the page says it once", () => {
    expect(weekFor(everyDay(), "nustar")).toBeNull();
  });

  it("runs Monday first and ends on Sunday", () => {
    const week = weekFor(everyDay(), "shell-gorordo")!;
    expect(week.map((day) => day.day)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });

  it("reads an equal pair on an open day as 24 hours, per 0026", () => {
    const week = weekFor(everyDay({ opensAt: "00:00", closesAt: "00:00" }), "shell-gorordo")!;
    expect(week[0]).toMatchObject({ kind: "all-day", text: "Open 24 hours" });
  });

  it("words a window that crosses midnight in the order it happens", () => {
    const week = weekFor([row({ opensAt: "18:00", closesAt: "02:00" })], "shell-gorordo")!;
    expect(week[0].text).toBe("6 PM to 2 AM");
  });

  it("says Closed for a closed day, even with no times", () => {
    const week = weekFor(
      [row({ isClosed: true, opensAt: null, closesAt: null })],
      "shell-gorordo",
    )!;
    expect(week[0]).toMatchObject({ kind: "closed", text: "Closed" });
  });

  it("never reports a weekday with no row as closed", () => {
    const week = weekFor([row({ weekday: 1 })], "shell-gorordo")!;
    expect(week[1]).toMatchObject({ day: "Tuesday", kind: "unset", text: "Not set" });
  });
});

describe("summarizeWeek", () => {
  it("collapses a uniform week into one line", () => {
    expect(summarizeWeek(weekFor(everyDay(), "shell-gorordo"))).toBe("11 AM to 10 PM, every day");
    expect(
      summarizeWeek(weekFor(everyDay({ opensAt: "00:00", closesAt: "00:00" }), "shell-gorordo")),
    ).toBe("Open 24 hours, every day");
  });

  it("refuses to pick one day out of a week that varies", () => {
    const rows = everyDay();
    rows[5] = row({ weekday: 5, closesAt: "23:00" });
    expect(summarizeWeek(weekFor(rows, "shell-gorordo"))).toBe("Hours vary by day");
  });

  it("has nothing to say about a week that is not published", () => {
    expect(summarizeWeek(null)).toBeNull();
  });
});

describe("storeHoursRowSchema", () => {
  it("keeps a null time null instead of turning it into midnight", () => {
    const parsed = storeHoursRowSchema.parse(row({ isClosed: true, opensAt: null, closesAt: null }));
    expect(parsed.opensAt).toBeNull();
  });

  it("rejects seconds, which the RPC formats away", () => {
    expect(storeHoursRowSchema.safeParse(row({ opensAt: "10:00:00" })).success).toBe(false);
  });
});

describe("weekdayIn", () => {
  it("answers in the counter's timezone, not the server's", () => {
    // 20:30 UTC on a Sunday is already 04:30 on Monday in Manila.
    const at = new Date("2026-09-13T20:30:00Z");
    expect(weekdayIn("UTC", at)).toBe(0);
    expect(weekdayIn("Asia/Manila", at)).toBe(1);
  });
});

describe("branch map URLs", () => {
  const pinned = { pin: { lat: 10.3203694, lng: 123.8994126 }, addressLine: "839 Gorordo Avenue", city: "Cebu City" };
  const unpinned = { addressLine: "Uling Road", city: "Naga, Cebu" };

  it("frames the confirmed pin when there is one", () => {
    const url = new URL(mapEmbedUrl(pinned));
    expect(url.origin).toBe("https://www.google.com");
    expect(url.searchParams.get("q")).toBe("10.3203694,123.8994126");
    expect(url.searchParams.get("output")).toBe("embed");
  });

  it("falls back to the printed address rather than a guessed pin", () => {
    const url = new URL(mapEmbedUrl(unpinned));
    expect(url.searchParams.get("q")).toBe("Uling Road, Naga, Cebu, Philippines");
  });

  it("sends directions to the same place the map shows, and no origin", () => {
    const url = new URL(directionsUrl(pinned));
    expect(url.pathname).toBe("/maps/dir/");
    expect(url.searchParams.get("destination")).toBe("10.3203694,123.8994126");
    expect(url.searchParams.has("origin")).toBe(false);
  });
});
