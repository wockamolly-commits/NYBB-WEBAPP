import { describe, expect, it } from "vitest";
import { formatOpening, unavailableMessage } from "@/lib/slots/format";
import { slotMinutesDivideDay } from "@/lib/slots/grid";
import type { PickupSlots } from "@/lib/slots/types";

/** What a customer reads when a counter is shut (migration 0092). */

const MANILA = "Asia/Manila";

describe("formatOpening", () => {
  const now = "2026-10-21T01:30:00.000Z"; // 9:30am Wednesday in Manila

  it("says today, tomorrow, or the weekday", () => {
    expect(formatOpening("2026-10-21T02:00:00.000Z", MANILA, now)).toBe("10:00am today");
    expect(formatOpening("2026-10-22T02:00:00.000Z", MANILA, now)).toBe("10:00am tomorrow");
    expect(formatOpening("2026-10-23T02:00:00.000Z", MANILA, now)).toBe("10:00am on Friday");
  });
});

describe("the closed_now message", () => {
  const base: PickupSlots = {
    branch: {
      slug: "mango",
      name: "NYBB Hot Wings, Mango Avenue",
      shortName: "Mango Avenue",
      timezone: MANILA,
      slotMinutes: 15,
      prepMinutes: 20,
    },
    generatedAt: "2026-10-21T01:30:00.000Z",
    horizonHours: 8,
    slots: [],
    unavailableReason: "closed_now",
  };

  it("names the opening time when the server gave one", () => {
    const message = unavailableMessage({ ...base, opensAt: "2026-10-21T02:00:00.000Z" });
    expect(message?.title).toBe("Mango Avenue is closed right now");
    expect(message?.body).toContain("10:00am today");
  });

  it("falls back to the horizon when it did not", () => {
    expect(unavailableMessage(base)?.body).toContain("the next 8 hours");
  });
});

describe("slotMinutesDivideDay", () => {
  it("accepts lengths that tile a day and refuses the rest", () => {
    for (const minutes of [5, 10, 15, 20, 30, 60, 120]) expect(slotMinutesDivideDay(minutes)).toBe(true);
    for (const minutes of [7, 25, 50, 0, 15.5]) expect(slotMinutesDivideDay(minutes)).toBe(false);
  });
});
