import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getStorefrontMenu, menuPayloadSchema } from "@/lib/menu/storefront";
import { staticMenu } from "@/lib/menu/static";
import { findItem, findOptionGroup } from "@/lib/menu";

describe("getStorefrontMenu without Supabase configured", () => {
  const saved = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.key;
  });

  it("serves the static catalog rather than failing the build", async () => {
    // The inherited trap: /menu is statically generated, so it reads the
    // database during `next build`. A Vercel Preview scope missing the
    // NEXT_PUBLIC_* pair must produce a working page, not a failed build and
    // not an empty store.
    const menu = await getStorefrontMenu();

    expect(menu.source).toBe("static");
    expect(menu.categories).toEqual(staticMenu());
    expect(menu.categories.length).toBeGreaterThan(0);
  });

  it("still carries the variation-dependent heat prices", async () => {
    const { categories } = await getStorefrontMenu();
    const wings = findItem(categories, "chicken-wings");
    const heat = findOptionGroup(wings, "level-of-hotness");
    const insane = heat?.options.find((option) => option.slug === "insane");

    expect(insane?.priceCents).toBeNull();
    expect(insane?.variationPriceCents).toEqual({ half: 4000, full: 6000 });
  });
});

describe("the menu payload schema", () => {
  const validItem = {
    slug: "ribs-original",
    name: "Original Ribs",
    categorySlug: "ribs",
    featured: false,
    variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 34900 }],
    optionGroups: [],
  };

  it("accepts a minimal well formed payload", () => {
    expect(() =>
      menuPayloadSchema.parse([
        { slug: "ribs", name: "Ribs", blurb: "", items: [validItem] },
      ]),
    ).not.toThrow();
  });

  it("rejects an item with no variations", () => {
    // A priceless item would render a tile with an empty price range, which
    // Math.min over an empty array turns into Infinity rather than an error.
    expect(() =>
      menuPayloadSchema.parse([
        { slug: "ribs", name: "Ribs", blurb: "", items: [{ ...validItem, variations: [] }] },
      ]),
    ).toThrow();
  });

  it("rejects a negative price", () => {
    expect(() =>
      menuPayloadSchema.parse([
        {
          slug: "ribs",
          name: "Ribs",
          blurb: "",
          items: [
            {
              ...validItem,
              variations: [{ ...validItem.variations[0], priceCents: -1 }],
            },
          ],
        },
      ]),
    ).toThrow();
  });

  it("keeps a null option price rather than coercing it", () => {
    const parsed = menuPayloadSchema.parse([
      {
        slug: "chicken-wings",
        name: "Chicken Wings",
        blurb: "",
        items: [
          {
            ...validItem,
            optionGroups: [
              {
                slug: "level-of-hotness",
                name: "Level of Hotness",
                minSelect: 0,
                maxSelect: 1,
                options: [
                  {
                    slug: "insane",
                    name: "Insane",
                    priceCents: null,
                    variationPriceCents: { regular: 4000 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    expect(parsed[0].items[0].optionGroups[0].options[0].priceCents).toBeNull();
  });
});
