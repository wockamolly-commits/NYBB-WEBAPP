import { describe, expect, it } from "vitest";
import {
  availabilityReason,
  formatWindow,
  formatTime12,
  formatTime12Input,
  parseTime12,
  toWeek,
  type BranchAvailability,
  type OrderIntakeSettings,
} from "@/lib/staff/availability-types";
import { toBranchAvailability } from "@/lib/staff/availability";

const intake: OrderIntakeSettings = { acceptingOrders: true, slotHorizonHours: 8 };
const branch: BranchAvailability = {
  branchId: "11111111-1111-4111-8111-111111111111",
  slug: "pilot",
  name: "Pilot",
  shortName: "Pilot",
  timezone: "Asia/Manila",
  isActive: true,
  isAcceptingOrders: true,
  prepMinutes: 20,
  slotMinutes: 15,
  slotCapacity: 6,
  isOpenNow: true,
  acceptsOrdersNow: true,
  week: Array.from({ length: 7 }, (_, weekday) => ({ weekday, isClosed: false, opensAt: "11:00", closesAt: "22:00" })),
  hasPublishedHours: true,
};

describe("staff availability reader helpers", () => {
  it("fills an absent weekday as closed without moving any existing weekday", () => {
    const week = toWeek([{ weekday: 1, isClosed: false, opensAt: "11:00", closesAt: "22:00" }]);
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ weekday: 0, isClosed: true, opensAt: null, closesAt: null });
    expect(week[1]).toEqual({ weekday: 1, isClosed: false, opensAt: "11:00", closesAt: "22:00" });
  });

  it("names the widest gate that stops a counter", () => {
    expect(availabilityReason({ ...branch, acceptsOrdersNow: false }, { ...intake, acceptingOrders: false })).toBe("business_paused");
    expect(availabilityReason({ ...branch, acceptsOrdersNow: false, isActive: false }, intake)).toBe("not_live");
    expect(availabilityReason({ ...branch, acceptsOrdersNow: false, hasPublishedHours: false }, intake)).toBe("no_hours");
    expect(availabilityReason({ ...branch, acceptsOrdersNow: false, isAcceptingOrders: false }, intake)).toBe("branch_paused");
    expect(availabilityReason({ ...branch, acceptsOrdersNow: false }, intake)).toBe("outside_hours");
    expect(availabilityReason(branch, intake)).toBe("open");
  });

  it("makes overnight hours explicit instead of sounding like a same-day window", () => {
    expect(formatWindow({ weekday: 6, isClosed: false, opensAt: "18:00", closesAt: "02:00" })).toBe("6:00 PM to 2:00 AM next day");
  });

  it("uses 12-hour time only at the staff-facing boundary", () => {
    expect(formatTime12("00:00")).toBe("12:00 AM");
    expect(formatTime12("12:00")).toBe("12:00 PM");
    expect(parseTime12("12:00 AM")).toBe("00:00");
    expect(parseTime12("12:00 pm")).toBe("12:00");
    expect(parseTime12("24:00")).toBeNull();
  });

  it("filters a staff time field as it is typed", () => {
    expect(formatTime12Input("ewsfsssssfssfsf")).toBe("");
    expect(formatTime12Input("132141242424")).toBe("1:32");
    expect(formatTime12Input("1200pm")).toBe("12:00 PM");
    expect(formatTime12Input("9:75 PM")).toBe("9 PM");
    expect(formatTime12Input("12:00")).toBe("12:00");
    expect(formatTime12Input("8:00", "AM")).toBe("8:00 AM");
    expect(formatTime12Input("5:00", "PM")).toBe("5:00 PM");
  });

  it("names equal times as an explicit 24-hour schedule", () => {
    expect(formatWindow({ weekday: 1, isClosed: false, opensAt: "00:00", closesAt: "00:00" })).toBe("Open 24 hours");
  });

  it("rejects an unreadable RPC row instead of making a permissive guess", () => {
    expect(toBranchAvailability({ branch_id: "not-a-uuid" })).toBeNull();
  });
});
