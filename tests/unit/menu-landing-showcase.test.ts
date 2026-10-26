import { describe, expect, it } from "vitest";
import { landingShowcase, WINGS_ITEM_SLUG } from "@/lib/menu";
import type { MenuCategory, MenuItem } from "@/lib/menu/types";

const photo = { src: "/x.jpg", blurDataURL: "data:," } as MenuItem["image"];

function item(slug: string, categorySlug: string, overrides: Partial<MenuItem> = {}): MenuItem {
  return {
    slug,
    name: slug,
    categorySlug,
    featured: false,
    image: photo,
    variations: [{ slug: "regular", name: "Regular", shortName: "REG", priceCents: 8000 }],
    optionGroups: [],
    ...overrides,
  };
}

function menu(...items: MenuItem[]): MenuCategory[] {
  const slugs = [...new Set(items.map((i) => i.categorySlug))];
  return slugs.map((slug) => ({
    slug,
    name: slug,
    blurb: "",
    items: items.filter((i) => i.categorySlug === slug),
  }));
}

const slugs = (items: MenuItem[]) => items.map((i) => i.slug);

describe("the landing page's Not just wings strip", () => {
  it("leaves out the wings even when they are featured", () => {
    const categories = menu(
      item(WINGS_ITEM_SLUG, "chicken-wings", { featured: true }),
      item("ribs", "specials", { featured: true }),
      item("nuggets", "specials", { featured: true }),
      item("value-meal", "value", { featured: true }),
      item("burger-meal", "busters"),
    );
    expect(slugs(landingShowcase(categories))).toEqual([
      "ribs",
      "nuggets",
      "value-meal",
      "burger-meal",
    ]);
  });

  it("leaves out featured items without a photograph", () => {
    const categories = menu(
      item("bundle", "new", { featured: true, image: null }),
      item("ribs", "specials", { featured: true }),
      item("burger", "burgers"),
      item("hotdog", "hotdogs"),
      item("pasta", "pasta"),
    );
    expect(slugs(landingShowcase(categories))).toEqual(["ribs", "burger", "hotdog", "pasta"]);
  });

  it("tops up from categories not yet shown before repeating one", () => {
    const categories = menu(
      item("ribs", "specials", { featured: true }),
      item("ribs-spicy", "specials"),
      item("burger", "burgers"),
      item("burger-2", "burgers"),
      item("hotdog", "hotdogs"),
    );
    expect(slugs(landingShowcase(categories))).toEqual(["ribs", "burger", "hotdog", "ribs-spicy"]);
  });

  it("cuts a featured remainder that cannot fill a row", () => {
    const featured = ["a", "b", "c", "d", "e"].map((s) => item(s, s, { featured: true }));
    expect(slugs(landingShowcase(menu(...featured)))).toEqual(["a", "b", "c", "d"]);
  });

  it("caps at two rows", () => {
    const featured = "abcdefghij".split("").map((s) => item(s, s, { featured: true }));
    expect(landingShowcase(menu(...featured))).toHaveLength(8);
  });

  it("shows what there is when the whole menu cannot fill a row", () => {
    const categories = menu(item("ribs", "specials"), item("burger", "burgers"));
    expect(slugs(landingShowcase(categories))).toEqual(["ribs", "burger"]);
  });
});
