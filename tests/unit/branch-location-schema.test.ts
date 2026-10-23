import { describe, expect, it } from "vitest";
import { formatCoordinates, parseCoordinates, readBranchLocationForm } from "@/lib/staff/branch-location-schema";

const BRANCH = "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("branch location form", () => {
  it("reads a pair as Google Maps copies it", () => {
    expect(parseCoordinates("10.3107153, 123.8962067")).toEqual({ lat: 10.3107153, lng: 123.8962067 });
    expect(parseCoordinates(" 10.31,123.89 ")).toEqual({ lat: 10.31, lng: 123.89 });
  });

  it("never turns an empty or half-filled field into a point", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("10.31")).toBeNull();
    expect(parseCoordinates("10.31, ")).toBeNull();
    expect(parseCoordinates("north, east")).toBeNull();
  });

  it("round-trips through the text the picker writes", () => {
    expect(parseCoordinates(formatCoordinates({ lat: 10.3, lng: 123.9 }))).toEqual({ lat: 10.3, lng: 123.9 });
  });

  it("saves a point inside the Philippines", () => {
    expect(readBranchLocationForm(form({ branchId: BRANCH, coordinates: "10.31, 123.89" }))).toEqual({
      ok: true,
      branchId: BRANCH,
      point: { lat: 10.31, lng: 123.89 },
    });
  });

  it("refuses a pair typed the wrong way round, and an empty field", () => {
    expect(readBranchLocationForm(form({ branchId: BRANCH, coordinates: "123.89, 10.31" })).ok).toBe(false);
    expect(readBranchLocationForm(form({ branchId: BRANCH, coordinates: "" })).ok).toBe(false);
  });

  it("clears only on the clear intent, whatever the field holds", () => {
    expect(readBranchLocationForm(form({ branchId: BRANCH, intent: "clear", coordinates: "10.31, 123.89" }))).toEqual({
      ok: true,
      branchId: BRANCH,
      point: null,
    });
  });
});
