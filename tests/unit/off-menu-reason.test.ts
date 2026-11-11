import { describe, expect, it } from "vitest";
import { offMenuReason } from "@/lib/staff/off-menu-reason";

/** Why an item is off the menu. See lib/staff/off-menu-reason.ts. */

const IMPORT_NOTE =
  "Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes the delivery channel markup and is not a pickup price. Inactive until the owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.";

describe("offMenuReason", () => {
  it("says the item waits on a price when the import switched it off for that", () => {
    expect(offMenuReason({ isActive: false, pricingNote: IMPORT_NOTE })).toBe(
      "Waiting for the owner to confirm a pickup price.",
    );
  });

  it("says nothing for an item that is on, even with that note left behind", () => {
    expect(offMenuReason({ isActive: true, pricingNote: IMPORT_NOTE })).toBeNull();
  });

  it("does not guess from a note that says something else, or from no note", () => {
    expect(
      offMenuReason({ isActive: false, pricingNote: "Not on the Foodpanda listing. Kept on the owner's instruction." }),
    ).toBeNull();
    expect(offMenuReason({ isActive: false, pricingNote: null })).toBeNull();
  });
});
