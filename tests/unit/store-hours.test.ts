import { describe, expect, it } from "vitest";
import { accidentalAllDay } from "@/lib/staff/store-hours";

/** Equal opening and closing times mean "all day" (0026), so only midnight may say it. */
const week = (override: { weekday: number; opens_at: string; closes_at: string }) =>
  Array.from({ length: 7 }, (_unused, weekday) =>
    weekday === override.weekday
      ? { weekday, is_closed: false, opens_at: override.opens_at, closes_at: override.closes_at }
      : { weekday, is_closed: false, opens_at: "10:00", closes_at: "22:00" },
  );

describe("accidentalAllDay", () => {
  it("names a day whose times were entered the same by mistake", () => {
    expect(accidentalAllDay(week({ weekday: 3, opens_at: "10:00", closes_at: "10:00" }))).toContain("Wednesday");
  });

  it("accepts midnight to midnight, the deliberate all-day", () => {
    expect(accidentalAllDay(week({ weekday: 3, opens_at: "00:00", closes_at: "00:00" }))).toBeNull();
  });

  it("ignores a closed day and ordinary hours", () => {
    expect(accidentalAllDay(week({ weekday: 3, opens_at: "10:00", closes_at: "22:00" }))).toBeNull();
    expect(
      accidentalAllDay([{ weekday: 0, is_closed: true, opens_at: "10:00", closes_at: "10:00" }]),
    ).toBeNull();
  });
});
