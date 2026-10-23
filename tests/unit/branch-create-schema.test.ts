import { describe, expect, it } from "vitest";
import { readBranchCreateForm, readBranchEditForm } from "@/lib/staff/branch-create-schema";

function form(overrides: Record<string, string> = {}) {
  const data = new FormData();
  const values = {
    name: "NYBB Hot Wings, Ayala Center",
    shortName: " Ayala Center ",
    format: "mall",
    addressLine: "Level 2, Ayala Center",
    barangay: "",
    city: "Cebu City",
    phones: "",
    priceListId: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("branch create form", () => {
  it("trims names and turns empty optional fields into null, not blanks", () => {
    const parsed = readBranchCreateForm(form());
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      shortName: "Ayala Center",
      barangay: null,
      phones: [],
      priceListId: null,
    });
  });

  it("splits phones on commas and new lines and drops the blanks", () => {
    const parsed = readBranchCreateForm(form({ phones: "0917 000 0000,\n 032 000 0000 ,," }));
    expect(parsed.data?.phones).toEqual(["0917 000 0000", "032 000 0000"]);
  });

  it("refuses more than four phones", () => {
    expect(readBranchCreateForm(form({ phones: "1,2,3,4,5" })).success).toBe(false);
  });

  it("refuses a blank required field and an unknown format", () => {
    expect(readBranchCreateForm(form({ shortName: "   " })).success).toBe(false);
    expect(readBranchCreateForm(form({ city: "" })).success).toBe(false);
    expect(readBranchCreateForm(form({ format: "kiosk" })).success).toBe(false);
  });

  it("keeps a chosen price list and refuses one that is not an id", () => {
    const id = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";
    expect(readBranchCreateForm(form({ priceListId: id })).data?.priceListId).toBe(id);
    expect(readBranchCreateForm(form({ priceListId: "standard" })).success).toBe(false);
  });
});

describe("branch edit form", () => {
  const id = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";

  it("reads the same details plus the branch id, and ignores a price list", () => {
    const data = form({ phones: "0917 000 0000, 032 000 0000" });
    data.set("branchId", id);
    const parsed = readBranchEditForm(data);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ branchId: id, shortName: "Ayala Center", phones: ["0917 000 0000", "032 000 0000"] });
    expect(parsed.data).not.toHaveProperty("priceListId");
  });

  it("lets every phone number be cleared, as an empty list", () => {
    const data = form({ phones: "" });
    data.set("branchId", id);
    expect(readBranchEditForm(data).data?.phones).toEqual([]);
  });

  it("refuses a missing branch id", () => {
    expect(readBranchEditForm(form()).success).toBe(false);
  });
});
