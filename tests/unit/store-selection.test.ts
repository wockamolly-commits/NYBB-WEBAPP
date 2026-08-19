import { describe, expect, it } from "vitest";
import { mergeStores } from "@/lib/branches/merge";
import { safeReturnTo, storesHref } from "@/lib/branches/href";
import type { Branch } from "@/lib/catalog/types";
import type { OrderableBranch } from "@/lib/branches/types";

const catalog: Branch[] = [
  {
    slug: "garden-bloc",
    name: "NYBB Hot Wings, Central Bloc",
    shortName: "Central Bloc, IT Park",
    addressLine: "Central Bloc, Cebu IT Park, Lahug",
    city: "Cebu City",
    phones: ["0906-331-3631"],
    format: "street",
  },
  {
    slug: "sm-city-cebu",
    name: "NYBB Hot Wings, SM City Cebu Food Hall",
    shortName: "SM City Cebu",
    addressLine: "SM City Cebu Food Hall",
    city: "Cebu City",
    phones: ["0917-790-0386"],
    format: "food-hall",
  },
];

function live(overrides: Partial<OrderableBranch> = {}): OrderableBranch {
  return {
    slug: "garden-bloc",
    name: "NYBB Hot Wings, Central Bloc",
    shortName: "Central Bloc, IT Park",
    format: "street",
    addressLine: "Central Bloc, Cebu IT Park, Lahug",
    city: "Cebu City",
    phones: ["0906-331-3631"],
    timezone: "Asia/Manila",
    slotMinutes: 15,
    prepMinutes: 20,
    acceptsOrdersNow: true,
    isOpenNow: true,
    ...overrides,
  };
}

describe("which counters a customer may choose", () => {
  // The state of this business today: one live branch and eight that are real
  // shops the platform has not been switched on for. The eight are not errors
  // and are not hidden, because somebody standing outside SM City needs to be
  // told to phone rather than left reading a list that omits the shop in front
  // of them.
  it("keeps the counters that are not live, and says why", () => {
    const stores = mergeStores(catalog, [live()]);

    expect(stores.map((store) => store.slug)).toEqual(["garden-bloc", "sm-city-cebu"]);
    expect(stores[0]).toMatchObject({ orderable: true, blockedReason: null });
    expect(stores[1]).toMatchObject({ orderable: false, blockedReason: "offline" });
    // The phone number is the whole point of listing a counter that cannot
    // take an online order.
    expect(stores[1].phones).toEqual(["0917-790-0386"]);
  });

  it("puts the counters that can take an order first", () => {
    const stores = mergeStores(catalog, [
      live({ slug: "sm-city-cebu", shortName: "SM City Cebu", format: "food-hall" }),
    ]);

    expect(stores.map((store) => store.slug)).toEqual(["sm-city-cebu", "garden-bloc"]);
  });

  // CLOSED IS NOT SWITCHED OFF. branch_accepts_orders includes
  // branch_is_open_at, so a live counter outside its hours reports false for
  // both. That combination means come back later, and the store stays
  // selectable: its slot grid may still hold windows inside the horizon, and
  // refusing the choice would send somebody to phone a shop that is happily
  // taking orders for the evening.
  it("keeps a shut counter selectable and marks it shut", () => {
    const stores = mergeStores(catalog, [
      live({ acceptsOrdersNow: false, isOpenNow: false }),
    ]);

    expect(stores[0]).toMatchObject({
      orderable: true,
      blockedReason: null,
      closedNow: true,
    });
  });

  // Open, and the accepting-orders switch is off. That is a shop not taking
  // anything today, and it is a different sentence to the one above.
  it("refuses a counter that has stopped accepting orders", () => {
    const stores = mergeStores(catalog, [
      live({ acceptsOrdersNow: false, isOpenNow: true }),
    ]);

    expect(stores.find((store) => store.slug === "garden-bloc")).toMatchObject({
      orderable: false,
      blockedReason: "not_accepting",
      closedNow: false,
    });
  });

  // The owner can add a branch row from the workspace. The catalog cannot be
  // edited without a deploy, so a merge that only decorated catalog entries
  // would leave a live counter invisible to the picker.
  it("includes a live branch that has no catalog entry", () => {
    const stores = mergeStores(catalog, [
      live({ slug: "mactan", shortName: "Mactan", name: "NYBB Hot Wings, Mactan" }),
    ]);

    expect(stores[0]).toMatchObject({ slug: "mactan", orderable: true });
    expect(stores).toHaveLength(3);
  });

  // The owner renames a branch from the workspace; the catalog still carries
  // the old string until somebody deploys. The database is the newer of the two.
  it("prefers the database's naming over the catalog's", () => {
    const stores = mergeStores(catalog, [live({ shortName: "IT Park" })]);

    expect(stores[0].shortName).toBe("IT Park");
  });

  it("marks every counter unorderable when nothing is live", () => {
    const stores = mergeStores(catalog, []);

    expect(stores.every((store) => !store.orderable)).toBe(true);
    expect(stores.every((store) => store.blockedReason === "offline")).toBe(true);
  });
});

describe("coming back to where the counter was chosen from", () => {
  it("carries the return path", () => {
    expect(storesHref("/checkout")).toBe("/stores?next=%2Fcheckout");
    expect(storesHref()).toBe("/stores");
  });

  // A `next` value is a value a stranger can set, and one sent unchecked to
  // router.push is an open redirect. Same-origin and absolute, or the menu.
  it("refuses a return path that leaves this origin", () => {
    expect(safeReturnTo("https://example.com/pay")).toBe("/menu");
    expect(safeReturnTo("//example.com")).toBe("/menu");
    expect(safeReturnTo("checkout")).toBe("/menu");
    expect(safeReturnTo(undefined)).toBe("/menu");
    expect(safeReturnTo(["/cart"])).toBe("/menu");
    expect(safeReturnTo("/cart")).toBe("/cart");
  });
});
