import { describe, expect, it } from "vitest";
import { matrixUrl, originSchema, readMatrix } from "@/lib/branches/road-matrix";

const MANGO = { lat: 10.3107153, lng: 123.8962067 };
const CENTRAL_BLOC = { lat: 10.3311738, lng: 123.9058611 };
const STANDING = { lat: 10.32, lng: 123.9 };

const destinations = [
  { slug: "mango-avenue", pin: MANGO },
  { slug: "garden-bloc", pin: CENTRAL_BLOC },
];

describe("the request to Mapbox", () => {
  const url = new URL(matrixUrl(STANDING, destinations, "pk.test"));

  // Mapbox reads longitude first. Swapped, Cebu lands in the Indian Ocean.
  it("puts the customer first and writes every coordinate longitude first", () => {
    expect(url.pathname).toBe(
      "/directions-matrix/v1/mapbox/driving/123.900000,10.320000;123.896207,10.310715;123.905861,10.331174",
    );
  });

  // One source against every counter: nine billed pairs, not a full matrix.
  it("asks from the customer to each counter, for distance", () => {
    expect(url.searchParams.get("sources")).toBe("0");
    expect(url.searchParams.get("destinations")).toBe("1;2");
    expect(url.searchParams.get("annotations")).toBe("distance");
    expect(url.searchParams.get("access_token")).toBe("pk.test");
  });
});

describe("reading Mapbox's answer", () => {
  it("turns metres into kilometres against each counter's slug", () => {
    expect(readMatrix({ code: "Ok", distances: [[2310.4, 850]] }, destinations)).toEqual({
      "mango-avenue": 2.3104,
      "garden-bloc": 0.85,
    });
  });

  // No road found for one counter: it keeps its estimate rather than a number.
  it("leaves out a counter Mapbox could not route to", () => {
    expect(readMatrix({ code: "Ok", distances: [[null, 850]] }, destinations)).toEqual({
      "garden-bloc": 0.85,
    });
  });

  it("gives up on anything that is not a clean answer", () => {
    expect(readMatrix({ code: "NoRoute" }, destinations)).toBeNull();
    expect(readMatrix({ code: "Ok" }, destinations)).toBeNull();
    expect(readMatrix({ message: "Not Authorized - Invalid Token" }, destinations)).toBeNull();
    expect(readMatrix(null, destinations)).toBeNull();
  });

  // A row that does not line up with what was asked cannot be matched to the
  // counters safely, and a distance on the wrong counter is worse than none.
  it("refuses a row of the wrong length", () => {
    expect(readMatrix({ code: "Ok", distances: [[850]] }, destinations)).toBeNull();
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
