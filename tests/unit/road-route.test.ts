import { describe, expect, it } from "vitest";
import { directionsUrl, originSchema, readRoute } from "@/lib/branches/road-route";

const STANDING = { lat: 10.32, lng: 123.9 };
const CENTRAL_BLOC = { lat: 10.3311738, lng: 123.9058611 };

describe("the directions request to Mapbox", () => {
  const url = new URL(directionsUrl(STANDING, CENTRAL_BLOC, "pk.test"));

  it("routes from the customer to the counter, longitude first", () => {
    expect(url.pathname).toBe(
      "/directions/v5/mapbox/driving/123.900000,10.320000;123.905861,10.331174",
    );
  });

  it("asks for the full line as GeoJSON and nothing the map does not draw", () => {
    expect(url.searchParams.get("geometries")).toBe("geojson");
    expect(url.searchParams.get("overview")).toBe("full");
    expect(url.searchParams.get("alternatives")).toBe("false");
    expect(url.searchParams.get("steps")).toBe("false");
    expect(url.searchParams.get("access_token")).toBe("pk.test");
  });
});

describe("reading the route", () => {
  const line: [number, number][] = [
    [123.9, 10.32],
    [123.902, 10.325],
    [123.905861, 10.331174],
  ];

  it("keeps the first route's line and its length in kilometres", () => {
    const body = {
      code: "Ok",
      routes: [
        { distance: 2390, geometry: { type: "LineString", coordinates: line } },
        { distance: 3800, geometry: { type: "LineString", coordinates: [] } },
      ],
    };
    expect(readRoute(body, STANDING, CENTRAL_BLOC)).toEqual({
      from: STANDING,
      to: CENTRAL_BLOC,
      line,
      km: 2.39,
    });
  });

  // Drawing a line that is not the road would be worse than drawing none.
  it("gives up on anything short of a line to draw", () => {
    expect(readRoute({ code: "NoRoute", routes: [] }, STANDING, CENTRAL_BLOC)).toBeNull();
    expect(readRoute({ code: "Ok", routes: [] }, STANDING, CENTRAL_BLOC)).toBeNull();
    expect(
      readRoute(
        { code: "Ok", routes: [{ distance: 0, geometry: { type: "LineString", coordinates: [line[0]] } }] },
        STANDING,
        CENTRAL_BLOC,
      ),
    ).toBeNull();
    expect(
      readRoute(
        { code: "Ok", routes: [{ distance: 10, geometry: { type: "LineString", coordinates: [[500, 10], [1, 1]] } }] },
        STANDING,
        CENTRAL_BLOC,
      ),
    ).toBeNull();
    expect(readRoute({ message: "Not Authorized" }, STANDING, CENTRAL_BLOC)).toBeNull();
  });
});

describe("the position the browser sends", () => {
  it("accepts a real coordinate", () => {
    expect(originSchema.safeParse(STANDING).success).toBe(true);
  });

  it("refuses anything that is not one", () => {
    expect(originSchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(originSchema.safeParse({ lat: "10.3", lng: "123.9" }).success).toBe(false);
    expect(originSchema.safeParse({ lat: Number.NaN, lng: 0 }).success).toBe(false);
    expect(originSchema.safeParse({ lat: Infinity, lng: 0 }).success).toBe(false);
    expect(originSchema.safeParse(null).success).toBe(false);
  });
});
