import { describe, expect, it } from "vitest";
import { branchEntries } from "@/lib/branches/entries";
import type { StoreHoursRow } from "@/lib/branches/hours";
import { mergeStores } from "@/lib/branches/merge";
import type { OrderableBranch } from "@/lib/branches/types";
import type { Branch } from "@/lib/catalog/types";

/**
 * The detail a branch sheet shows, built once for both pages that open one:
 * the Branches directory and the counter picker's nearest-counter card.
 */

const catalog: Branch[] = [
  {
    slug: "shell-gorordo",
    name: "NYBB Hot Wings, Shell Gorordo",
    shortName: "Shell Gorordo",
    addressLine: "839 Gorordo Avenue",
    city: "Cebu City",
    phones: ["0917-114-1392"],
    format: "petrol",
    pin: { lat: 10.3203694, lng: 123.8994126 },
  },
  {
    slug: "shell-naga",
    name: "NYBB Hot Wings, Shell Mobility Naga",
    shortName: "Shell Naga",
    addressLine: "Uling Road",
    city: "Naga, Cebu",
    phones: ["0946-352-0538"],
    format: "petrol",
  },
];

function live(overrides: Partial<OrderableBranch> = {}): OrderableBranch {
  return {
    slug: "shell-gorordo",
    name: "NYBB Hot Wings, Shell Gorordo",
    shortName: "Shell Gorordo",
    format: "petrol",
    addressLine: "839 Gorordo Avenue",
    city: "Cebu City",
    phones: ["0917-114-1392"],
    timezone: "Asia/Manila",
    slotMinutes: 15,
    prepMinutes: 20,
    acceptsOrdersNow: true,
    isOpenNow: true,
    ...overrides,
  };
}

const monday: StoreHoursRow = {
  slug: "shell-gorordo",
  weekday: 1,
  isClosed: false,
  opensAt: "11:00",
  closesAt: "22:00",
};

describe("branchEntries", () => {
  it("lists every catalog counter, in catalog order", () => {
    const entries = branchEntries(catalog, mergeStores(catalog, [live()]), []);
    expect(entries.map((entry) => entry.slug)).toEqual(["shell-gorordo", "shell-naga"]);
  });

  // The workspace can rename a live branch without a deploy.
  it("takes the database's name and phones where the counter is live", () => {
    const stores = mergeStores(catalog, [
      live({ shortName: "Gorordo Shell", phones: ["0999-000-0000"] }),
    ]);
    const [gorordo] = branchEntries(catalog, stores, []);

    expect(gorordo.shortName).toBe("Gorordo Shell");
    expect(gorordo.phones).toEqual(["0999-000-0000"]);
  });

  // The map has to agree with the street, so neither comes from the database.
  it("keeps the catalog's address and maps from its pin", () => {
    const stores = mergeStores(catalog, [live({ addressLine: "Somewhere else" })]);
    const [gorordo, naga] = branchEntries(catalog, stores, []);

    expect(gorordo.addressLine).toBe("839 Gorordo Avenue");
    expect(gorordo.pinned).toBe(true);
    expect(gorordo.mapUrl).toContain("10.3203694");
    expect(naga.pinned).toBe(false);
  });

  it("says open or shut only for a counter the platform is live on", () => {
    const stores = mergeStores(catalog, [live({ isOpenNow: false, acceptsOrdersNow: false })]);
    const [gorordo, naga] = branchEntries(catalog, stores, []);

    expect(gorordo.openNow).toBe(false);
    expect(naga.openNow).toBeNull();
  });

  it("carries the published week", () => {
    const [gorordo, naga] = branchEntries(catalog, mergeStores(catalog, [live()]), [monday]);

    expect(gorordo.week?.find((day) => day.weekday === 1)?.text).toBe("11 AM to 10 PM");
    expect(gorordo.hoursUnavailable).toBe(false);
    expect(naga.week).toBeNull();
  });

  // A failed read is not a counter with no schedule, and the sheet says so.
  it("marks the hours unavailable when the read failed", () => {
    const entries = branchEntries(catalog, mergeStores(catalog, [live()]), null);

    expect(entries.every((entry) => entry.week === null && entry.hoursUnavailable)).toBe(true);
  });
});
