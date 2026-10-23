import { describe, expect, it } from "vitest";
import { TABLEVIBE_URL, deliveryCardAllowedOn } from "@/lib/site/delivery-card";

describe("deliveryCardAllowedOn", () => {
  it("shows on browsing pages", () => {
    for (const path of ["/", "/menu", "/menu/wings", "/stores", "/promos", "/about"]) {
      expect(deliveryCardAllowedOn(path)).toBe(true);
    }
  });

  it("stays off the cart, checkout and order pages", () => {
    for (const path of ["/cart", "/checkout", "/order", "/order/NY-ABC123"]) {
      expect(deliveryCardAllowedOn(path)).toBe(false);
    }
  });

  it("stays off an item page, where it stood over the flavour grid", () => {
    for (const path of ["/menu/chicken-wings/chicken-wings", "/menu/sides/fries/"]) {
      expect(deliveryCardAllowedOn(path)).toBe(false);
    }
  });

  it("matches whole segments, not prefixes of words", () => {
    expect(deliveryCardAllowedOn("/orders-info")).toBe(true);
  });
});

it("points at the Tablevibe ordering page", () => {
  expect(TABLEVIBE_URL).toBe("https://buffalobrads.tablevibe.co/");
});
