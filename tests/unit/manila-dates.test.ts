import { afterEach, describe, expect, it } from "vitest";
import { manilaWallClockIso } from "@/lib/staff/manila-dates";

const originalTz = process.env.TZ;

afterEach(() => {
  process.env.TZ = originalTz;
});

describe("manilaWallClockIso", () => {
  it("turns a wall clock reading into the Manila instant, no matter the process timezone", () => {
    const expected = "2026-08-25T10:00:00.000Z"; // 2026-08-25 18:00 in Asia/Manila (+08:00)
    for (const tz of ["UTC", "Asia/Manila", "America/New_York", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      expect(manilaWallClockIso("2026-08-25T18:00")).toBe(expected);
    }
  });

  it("accepts seconds when the input carries them", () => {
    expect(manilaWallClockIso("2026-08-25T18:00:30")).toBe("2026-08-25T10:00:30.000Z");
  });

  it("treats midnight as the start of the Manila day", () => {
    expect(manilaWallClockIso("2026-08-25T00:00")).toBe("2026-08-24T16:00:00.000Z");
  });

  it("rejects a string that is not YYYY-MM-DDTHH:mm", () => {
    expect(manilaWallClockIso("")).toBeNull();
    expect(manilaWallClockIso("2026-08-25")).toBeNull();
    expect(manilaWallClockIso("2026-08-25 18:00")).toBeNull();
    expect(manilaWallClockIso("08/25/2026T18:00")).toBeNull();
  });

  it("rejects a calendar date that does not exist", () => {
    expect(manilaWallClockIso("2026-02-30T18:00")).toBeNull();
  });

  it("rejects an hour, minute or second out of range", () => {
    expect(manilaWallClockIso("2026-08-25T24:00")).toBeNull();
    expect(manilaWallClockIso("2026-08-25T18:60")).toBeNull();
    expect(manilaWallClockIso("2026-08-25T18:00:60")).toBeNull();
  });
});
