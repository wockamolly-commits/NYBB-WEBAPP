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
  // Level of Hotness went flat on 2026-09-07, so the menu no longer contains a
  // variation-priced option and path 1 has to be exercised against a synthetic
  // one. The path is still live in `optionPriceCents` and the column is still
  // in the schema, and the spec names all three paths as required coverage, so
  // the test stays rather than following the data out.
  const variationPriced: CatalogOption = {
    slug: "size-priced",
    name: "Size priced",
    priceCents: null,
    variationPriceCents: { half: 3000, full: 4000 },
  };

  it("path 1: takes the variation specific price when one exists", () => {
    expect(optionPriceCents(variationPriced, "half")).toBe(3000);
    expect(optionPriceCents(variationPriced, "full")).toBe(4000);
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
    expect(optionPriceCents(variationPriced, null)).toBe(0);
  });

  it("matches the published Level of Hotness price list", () => {
    // Flat PHP 29 on every level and every size, per the Foodpanda listing.
    // It was 30 on a half and 40 on a full, with insane at 40 and 60, from the
    // website's Our Menu page. That page is stale.
    for (const slug of ["lite", "moderate", "hot", "wild", "insane"]) {
      for (const size of ["half", "full", "boneless-half", "boneless-full"]) {
        expect(optionPriceCents(heat(slug), size), `${slug} on ${size}`).toBe(2900);
      }
    }
  });

  it("prices every heat level the same on every size", () => {
    // The inverse of the assertion this replaced, which required half and full
    // to differ. Boneless is why it is worth stating: a size-dependent heat
    // price would have needed two more numbers the moment boneless arrived,
    // and nobody would have noticed them missing.
    for (const level of wingHeat.options) {
      const sizes = ["half", "full", "boneless-half", "boneless-full"].map((size) =>
        optionPriceCents(level, size),
      );
      expect(new Set(sizes).size, level.slug).toBe(1);
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
