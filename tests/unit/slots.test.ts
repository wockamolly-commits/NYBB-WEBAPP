import { describe, expect, it } from "vitest";
import {
  capacityNote,
  dayLabel,
  formatSlotRange,
  formatSlotTime,
  groupSlotsByDay,
  isSlotOpen,
  localDateKey,
  unavailableMessage,
} from "@/lib/slots/format";
import { noBranchYet, pickupSlotsSchema } from "@/lib/slots/reader";
import type { PickupSlot, PickupSlots } from "@/lib/slots/types";

/**
 * The display side of the pickup windows.
 *
 * Slot generation itself is not tested here, because it does not live here:
 * it is `get_pickup_slots()` and it is proven against real Postgres in
 * tests/sql/pickup-slots.test.ts. What is tested here is everything that turns
 * a window into words, all of which has to work in the branch's timezone
 * rather than the machine's.
 */

const MANILA = "Asia/Manila";

function slot(startsAt: string, endsAt: string, remaining = 6): PickupSlot {
  return { startsAt, endsAt, capacity: 6, reserved: 6 - remaining, remaining };
}

function payload(overrides: Partial<PickupSlots> = {}): PickupSlots {
  return {
    branch: {
      slug: "pilot",
      name: "Pilot Branch",
      shortName: "Mango Avenue",
      timezone: MANILA,
      slotMinutes: 15,
      prepMinutes: 20,
    },
    generatedAt: "2026-08-06T04:00:00.000Z", // noon in Manila
    horizonHours: 8,
    slots: [],
    unavailableReason: null,
    ...overrides,
  };
}

describe("localDateKey", () => {
  it("reads the date at the branch, not at the machine", () => {
    // 17:00 UTC is one in the morning of the next day in Manila. A machine on
    // UTC must still file this window under the 7th.
    expect(localDateKey("2026-08-06T17:00:00.000Z", MANILA)).toBe("2026-08-07");
  });

  it("keeps a window before midnight on its own day", () => {
    expect(localDateKey("2026-08-06T15:59:00.000Z", MANILA)).toBe("2026-08-06");
  });
});

describe("formatSlotTime", () => {
  it("writes the form the spec writes", () => {
    // Spec section 10 N1: "Fully booked, try 7:15pm".
    expect(formatSlotTime("2026-08-06T11:15:00.000Z", MANILA)).toBe("7:15pm");
  });

  it("uses the branch clock for a time that is another day in UTC", () => {
    expect(formatSlotTime("2026-08-06T16:15:00.000Z", MANILA)).toBe("12:15am");
  });

  it("writes noon and midnight the way a person reads them", () => {
    expect(formatSlotTime("2026-08-06T04:00:00.000Z", MANILA)).toBe("12:00pm");
    expect(formatSlotTime("2026-08-05T16:00:00.000Z", MANILA)).toBe("12:00am");
  });
});

describe("formatSlotRange", () => {
  it("says the period once when both ends share it", () => {
    expect(
      formatSlotRange(slot("2026-08-06T11:00:00.000Z", "2026-08-06T11:15:00.000Z"), MANILA),
    ).toBe("7:00 to 7:15pm");
  });

  it("says it twice across noon, where dropping it would mislead", () => {
    // 11:45am to 12:00pm.
    expect(
      formatSlotRange(slot("2026-08-06T03:45:00.000Z", "2026-08-06T04:00:00.000Z"), MANILA),
    ).toBe("11:45am to 12:00pm");
  });

  it("says it twice across midnight too", () => {
    expect(
      formatSlotRange(slot("2026-08-06T15:45:00.000Z", "2026-08-06T16:00:00.000Z"), MANILA),
    ).toBe("11:45pm to 12:00am");
  });
});

describe("dayLabel", () => {
  const now = "2026-08-06T04:00:00.000Z"; // Thursday noon in Manila

  it("names today and tomorrow", () => {
    expect(dayLabel("2026-08-06", MANILA, now)).toBe("Today");
    expect(dayLabel("2026-08-07", MANILA, now)).toBe("Tomorrow");
  });

  it("names anything further out by its weekday", () => {
    expect(dayLabel("2026-08-08", MANILA, now)).toBe("Saturday");
  });

  it("rolls the month over correctly", () => {
    // Noon on the 31st in Manila: the 1st is tomorrow, and the arithmetic has
    // to carry into September rather than reaching for the 32nd of August.
    const noonOnTheLastDay = "2026-08-31T04:00:00.000Z";
    expect(dayLabel("2026-08-31", MANILA, noonOnTheLastDay)).toBe("Today");
    expect(dayLabel("2026-09-01", MANILA, noonOnTheLastDay)).toBe("Tomorrow");

    // And midnight Manila on the 1st is already the new month.
    expect(dayLabel("2026-09-01", MANILA, "2026-08-31T16:00:00.000Z")).toBe("Today");
  });

  it("counts the day at the branch, so a UTC evening is already tomorrow", () => {
    // 17:00 UTC on the 6th is 01:00 on the 7th in Manila.
    expect(dayLabel("2026-08-07", MANILA, "2026-08-06T17:00:00.000Z")).toBe("Today");
  });
});

describe("groupSlotsByDay", () => {
  it("splits a shift that runs past midnight into two days", () => {
    const days = groupSlotsByDay(
      payload({
        generatedAt: "2026-08-06T15:00:00.000Z", // 11pm Manila
        slots: [
          slot("2026-08-06T15:45:00.000Z", "2026-08-06T16:00:00.000Z"),
          slot("2026-08-06T16:00:00.000Z", "2026-08-06T16:15:00.000Z"),
          slot("2026-08-06T16:15:00.000Z", "2026-08-06T16:30:00.000Z"),
        ],
      }),
    );

    expect(days.map((day) => day.label)).toEqual(["Today", "Tomorrow"]);
    expect(days[0].slots).toHaveLength(1);
    expect(days[1].slots).toHaveLength(2);
  });

  it("keeps one day as one group", () => {
    const days = groupSlotsByDay(
      payload({
        slots: [
          slot("2026-08-06T04:30:00.000Z", "2026-08-06T04:45:00.000Z"),
          slot("2026-08-06T04:45:00.000Z", "2026-08-06T05:00:00.000Z"),
        ],
      }),
    );
    expect(days).toHaveLength(1);
    expect(days[0].slots).toHaveLength(2);
  });

  it("is empty when there is no branch to have a timezone", () => {
    expect(groupSlotsByDay(noBranchYet())).toEqual([]);
  });
});

describe("capacityNote", () => {
  it("says nothing while a window is comfortable", () => {
    expect(capacityNote(slot("a", "b", 6))).toBeNull();
    expect(capacityNote(slot("a", "b", 3))).toBeNull();
  });

  it("counts down the last few", () => {
    expect(capacityNote(slot("a", "b", 2))).toBe("2 left");
    expect(capacityNote(slot("a", "b", 1))).toBe("1 left");
  });

  it("names a full window rather than leaving it blank", () => {
    expect(capacityNote(slot("a", "b", 0))).toBe("Fully booked");
    expect(isSlotOpen(slot("a", "b", 0))).toBe(false);
  });
});

describe("unavailableMessage", () => {
  it("says nothing when there are windows", () => {
    expect(unavailableMessage(payload({ slots: [slot("a", "b")] }))).toBeNull();
  });

  it("explains the state this project is actually in", () => {
    // No branch is active and store_hours is empty, on purpose, because both
    // are open questions for the owner. The screen has to read as "not open
    // yet" rather than as "broken".
    const message = unavailableMessage(noBranchYet());
    expect(message?.title).toBe("Pickup times are not open yet");
    expect(message?.body).toContain("Call the branch");
  });

  it("names the branch it is waiting on for hours", () => {
    const message = unavailableMessage(payload({ unavailableReason: "no_hours" }));
    expect(message?.title).toBe("Mango Avenue has not published its opening hours");
  });

  it("quotes the owner's own horizon back", () => {
    const message = unavailableMessage(
      payload({ unavailableReason: "fully_booked", horizonHours: 4 }),
    );
    expect(message?.body).toContain("the next 4 hours");
  });

  it("covers every reason the database can return", () => {
    const reasons = [
      "no_branch",
      "not_accepting",
      "no_hours",
      "closed_now",
      "fully_booked",
    ] as const;

    for (const reason of reasons) {
      const message = unavailableMessage(payload({ unavailableReason: reason }));
      expect(message?.title, reason).toBeTruthy();
      expect(message?.body, reason).toBeTruthy();
    }
  });
});

describe("the reader's parse", () => {
  it("accepts what the function returns with no branch", () => {
    expect(() => pickupSlotsSchema.parse(noBranchYet())).not.toThrow();
  });

  it("accepts a full payload", () => {
    expect(() => pickupSlotsSchema.parse(payload({ slots: [slot("a", "b")] }))).not.toThrow();
  });

  it("refuses a reason the UI has no copy for", () => {
    expect(() =>
      pickupSlotsSchema.parse(payload({ unavailableReason: "kitchen_on_fire" as never })),
    ).toThrow();
  });

  it("refuses a negative remaining, which would render as a usable window", () => {
    expect(() =>
      pickupSlotsSchema.parse(
        payload({ slots: [{ ...slot("a", "b"), remaining: -1 }] }),
      ),
    ).toThrow();
  });
});
