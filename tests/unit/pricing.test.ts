import { describe, expect, it } from "vitest";
import { defaultVariation, itemPriceRange, optionPriceCents } from "@/lib/catalog/pricing";
import { wingHeat } from "@/lib/catalog/menu";
import { findItem } from "@/lib/catalog";
import type { CatalogOption } from "@/lib/catalog/types";

const heat = (slug: string): CatalogOption => {
  const option = wingHeat.options.find((entry) => entry.slug === slug);
  if (!option) throw new Error(`no heat level: ${slug}`);
  return option;
};

/**
 * The spec calls option pricing the single most likely place for a pricing bug
 * to hide, and names all three resolution paths as required coverage. These are
 * those three paths, plus the real menu values they have to produce.
 */
describe("optionPriceCents", () => {
  it("path 1: takes the variation specific price when one exists", () => {
    expect(optionPriceCents(heat("hot"), "half")).toBe(3000);
    expect(optionPriceCents(heat("hot"), "full")).toBe(4000);
  });

  it("path 2: falls back to the option's flat price", () => {
    const flat: CatalogOption = { slug: "extra-dip", name: "Extra dip", priceCents: 2500 };
    expect(optionPriceCents(flat, "half")).toBe(2500);
    expect(optionPriceCents(flat, null)).toBe(2500);
  });

  it("path 3: an option with neither is free", () => {
    const free: CatalogOption = { slug: "no-sesame", name: "No sesame", priceCents: null };
    expect(optionPriceCents(free, "half")).toBe(0);
    expect(optionPriceCents(free, null)).toBe(0);
  });

  it("falls back rather than throwing when the variation has no specific price", () => {
    const mixed: CatalogOption = {
      slug: "mixed",
      name: "Mixed",
      priceCents: 1500,
      variationPriceCents: { half: 3000 },
    };
    expect(optionPriceCents(mixed, "full")).toBe(1500);
  });

  it("prices a variation-only option at zero when the variation is unknown", () => {
    // A null flat price states that the variation decides. With no variation
    // there is nothing to decide from, so the display falls to zero rather than
    // inventing a number. Real charging happens in place_order, not here.
    expect(optionPriceCents(heat("insane"), null)).toBe(0);
  });

  it("matches the published Level of Hotness price list", () => {
    for (const slug of ["lite", "moderate", "hot", "wild"]) {
      expect(optionPriceCents(heat(slug), "half")).toBe(3000);
      expect(optionPriceCents(heat(slug), "full")).toBe(4000);
    }

    expect(optionPriceCents(heat("insane"), "half")).toBe(4000);
    expect(optionPriceCents(heat("insane"), "full")).toBe(6000);
  });

  it("keeps the half and full prices genuinely different", () => {
    // The whole reason menu_option_variation_prices exists. If these ever
    // collapse to one number, the flat option model has crept back in.
    for (const level of wingHeat.options.filter((option) => option.priceCents === null)) {
      expect(optionPriceCents(level, "half")).not.toBe(optionPriceCents(level, "full"));
    }
  });

  it("charges nothing for no heat, on either size", () => {
    expect(optionPriceCents(heat("none"), "half")).toBe(0);
    expect(optionPriceCents(heat("none"), "full")).toBe(0);
  });
});

describe("itemPriceRange", () => {
  it("spans the cheapest and dearest variation", () => {
    const wings = findItem("chicken-wings");
    expect(wings).toBeDefined();
    expect(itemPriceRange(wings!)).toEqual({ fromCents: 32900, toCents: 52900 });
  });

  it("collapses to a single price for a one-variation item", () => {
    const ribs = findItem("ribs-original");
    expect(itemPriceRange(ribs!)).toEqual({ fromCents: 34900, toCents: 34900 });
  });
});

describe("defaultVariation", () => {
  it("opens on the cheapest entry point", () => {
    const wings = findItem("chicken-wings");
    expect(defaultVariation(wings!).slug).toBe("half");
  });
});
