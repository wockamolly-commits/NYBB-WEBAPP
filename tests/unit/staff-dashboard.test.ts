import { describe, expect, it } from "vitest";
import { manilaDayStartIso, summarizeOrders } from "@/lib/staff/dashboard";

describe("staff dashboard", () => {
  it("anchors the operating day to Manila midnight", () => {
    expect(manilaDayStartIso(new Date("2026-08-10T19:30:00.000Z"))).toBe(
      "2026-08-10T16:00:00.000Z",
    );
  });

  it("groups accepted orders with food in preparation", () => {
    expect(
      summarizeOrders([
        "pending",
        "accepted",
        "preparing",
        "ready",
        "claimed",
        "cancelled",
      ]),
    ).toEqual({ total: 6, pending: 1, preparing: 2, ready: 1, claimed: 1 });
  });
});
