import { describe, expect, it } from "vitest";
import { isMetered } from "@/lib/site/connection";

/**
 * The connection predicate the landing hero gates its second still on.
 *
 * The case worth keeping honest is the silent one: a browser that reports
 * nothing must not be read as a slow browser, or every Safari visitor on fibre
 * loses the picture.
 */

describe("isMetered", () => {
  it("treats a browser that says nothing as fine", () => {
    expect(isMetered(undefined)).toBe(false);
    expect(isMetered({})).toBe(false);
  });

  it("honours Data Saver", () => {
    expect(isMetered({ saveData: true })).toBe(true);
  });

  it("reads the effective type, including slow-2g", () => {
    expect(isMetered({ effectiveType: "slow-2g" })).toBe(true);
    expect(isMetered({ effectiveType: "2g" })).toBe(true);
    expect(isMetered({ effectiveType: "3g" })).toBe(true);
    expect(isMetered({ effectiveType: "4g" })).toBe(false);
  });

  it("reads downlink where the effective type is generous about it", () => {
    expect(isMetered({ effectiveType: "4g", downlink: 0.8 })).toBe(true);
    expect(isMetered({ effectiveType: "4g", downlink: 5 })).toBe(false);
  });
});
