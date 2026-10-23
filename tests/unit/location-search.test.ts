import { describe, expect, it } from "vitest";
import { parsePlaceResults, placeSearchUrl } from "@/lib/staff/location-search";

describe("location search", () => {
  it("asks for Philippine results, nearest the given point first", () => {
    const url = new URL(placeSearchUrl("  Ayala Center Cebu ", "pk.test", { lat: 10.3, lng: 123.9 }));
    expect(url.origin + url.pathname).toBe("https://api.mapbox.com/search/searchbox/v1/forward");
    expect(url.searchParams.get("q")).toBe("Ayala Center Cebu");
    expect(url.searchParams.get("country")).toBe("ph");
    expect(url.searchParams.get("proximity")).toBe("123.9,10.3");
  });

  it("reads Mapbox's longitude-first coordinates into a lat, lng point", () => {
    const results = parsePlaceResults({
      type: "FeatureCollection",
      features: [
        {
          geometry: { type: "Point", coordinates: [123.9051, 10.3181] },
          properties: { mapbox_id: "abc", name: "Ayala Center Cebu", full_address: "Cebu Business Park, Cebu City" },
        },
        {
          geometry: { type: "Point", coordinates: [123.89, 10.31] },
          properties: { name: "Osmeña Boulevard", place_formatted: "Cebu City, Cebu" },
        },
      ],
    });
    expect(results).toEqual([
      { id: "abc", name: "Ayala Center Cebu", detail: "Cebu Business Park, Cebu City", point: { lat: 10.3181, lng: 123.9051 } },
      { id: "1-10.31,123.89", name: "Osmeña Boulevard", detail: "Cebu City, Cebu", point: { lat: 10.31, lng: 123.89 } },
    ]);
  });

  it("drops an entry it cannot read and keeps the rest", () => {
    const results = parsePlaceResults({
      features: [
        { geometry: { coordinates: [123.9] }, properties: { name: "Broken" } },
        { geometry: { coordinates: [123.9, 10.3] }, properties: { name: "Fine" } },
      ],
    });
    expect(results.map((result) => result.name)).toEqual(["Fine"]);
  });

  it("returns nothing for an error body", () => {
    expect(parsePlaceResults({ message: "Not Authorized - Invalid Token" })).toEqual([]);
    expect(parsePlaceResults(null)).toEqual([]);
  });
});
