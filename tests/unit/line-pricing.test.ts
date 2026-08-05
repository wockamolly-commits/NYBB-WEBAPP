import { describe, expect, it } from "vitest";
import { staticMenu } from "@/lib/menu/static";
import { findItem, previewImage } from "@/lib/menu";
import {
  MAX_QUANTITY,
  defaultSelection,
  lineTotalCents,
  optionsTotalCents,
  selectionProblem,
  toggleOption,
  unitPriceCents,
} from "@/lib/menu/line-pricing";
import type { MenuItem, MenuOptionGroup } from "@/lib/menu/types";

const categories = staticMenu();
const wings = findItem(categories, "chicken-wings") as MenuItem;
const ribs = findItem(categories, "ribs-original") as MenuItem;

const heatGroup = wings.optionGroups.find(
  (group) => group.slug === "level-of-hotness",
) as MenuOptionGroup;
const flavourGroup = wings.optionGroups.find(
  (group) => group.slug === "wing-flavour",
) as MenuOptionGroup;

const select = (variationSlug: string, flavour: string, heat: string) => ({
  variationSlug,
  optionSlugs: { "wing-flavour": [flavour], "level-of-hotness": [heat] },
});

describe("unitPriceCents", () => {
  it("prices a half order of buffalo wings with no heat", () => {
    expect(unitPriceCents(wings, select("half", "classic-buffalo", "none"))).toBe(32900);
  });

  it("charges the half price of heat on a half order", () => {
    // PHP 329 plus PHP 30.
    expect(unitPriceCents(wings, select("half", "classic-buffalo", "hot"))).toBe(35900);
  });

  it("charges the full price of the same heat on a full order", () => {
    // PHP 529 plus PHP 40, and the difference from the line above is the whole
    // reason menu_option_variation_prices exists.
    expect(unitPriceCents(wings, select("full", "classic-buffalo", "hot"))).toBe(56900);
  });

  it("prices Insane apart from the other four levels", () => {
    expect(unitPriceCents(wings, select("half", "sweet-spicy", "insane"))).toBe(36900);
    expect(unitPriceCents(wings, select("full", "sweet-spicy", "insane"))).toBe(58900);
  });

  it("charges nothing for the flavour itself", () => {
    const buffalo = unitPriceCents(wings, select("full", "classic-buffalo", "none"));
    const saltedEgg = unitPriceCents(wings, select("full", "salted-egg", "none"));
    expect(buffalo).toBe(saltedEgg);
  });

  it("prices an item with no options at its variation price", () => {
    expect(unitPriceCents(ribs, { variationSlug: "regular", optionSlugs: {} })).toBe(34900);
  });

  it("throws rather than pricing an unknown variation at zero", () => {
    expect(() =>
      unitPriceCents(wings, { variationSlug: "family-bucket", optionSlugs: {} }),
    ).toThrow(/no variation/);
  });

  it("ignores an option slug that is not in the group", () => {
    expect(
      optionsTotalCents(wings, {
        variationSlug: "half",
        optionSlugs: { "level-of-hotness": ["nuclear"] },
      }),
    ).toBe(0);
  });
});

describe("lineTotalCents", () => {
  it("multiplies by quantity", () => {
    expect(
      lineTotalCents(wings, { ...select("full", "honey-garlic", "wild"), quantity: 3 }),
    ).toBe((52900 + 4000) * 3);
  });

  it("clamps a quantity below one", () => {
    expect(lineTotalCents(ribs, { variationSlug: "regular", optionSlugs: {}, quantity: 0 })).toBe(
      34900,
    );
  });

  it("clamps a quantity above the ceiling", () => {
    expect(
      lineTotalCents(ribs, { variationSlug: "regular", optionSlugs: {}, quantity: 999 }),
    ).toBe(34900 * MAX_QUANTITY);
  });

  it("truncates a fractional quantity rather than pricing a fraction", () => {
    expect(
      lineTotalCents(ribs, { variationSlug: "regular", optionSlugs: {}, quantity: 2.9 }),
    ).toBe(34900 * 2);
  });
});

describe("defaultSelection", () => {
  it("opens on the cheapest size with the required group filled", () => {
    const selection = defaultSelection(wings);
    expect(selection.variationSlug).toBe("half");
    // Flavour is minSelect 1, so it cannot open empty.
    expect(selection.optionSlugs["wing-flavour"]).toEqual(["classic-buffalo"]);
    // Heat is minSelect 0, so it opens unchosen.
    expect(selection.optionSlugs["level-of-hotness"]).toEqual([]);
    expect(selection.quantity).toBe(1);
  });

  it("is immediately orderable", () => {
    expect(selectionProblem(wings, defaultSelection(wings))).toBeNull();
    expect(selectionProblem(ribs, defaultSelection(ribs))).toBeNull();
  });
});

describe("selectionProblem", () => {
  it("names the group that still needs a choice", () => {
    const problem = selectionProblem(wings, {
      variationSlug: "half",
      optionSlugs: { "wing-flavour": [], "level-of-hotness": [] },
    });
    expect(problem?.group.slug).toBe("wing-flavour");
    expect(problem?.reason).toBe("too_few");
  });

  it("catches more choices than the group allows", () => {
    const problem = selectionProblem(wings, {
      variationSlug: "half",
      optionSlugs: { "wing-flavour": ["classic-buffalo", "cheezy"] },
    });
    expect(problem?.group.slug).toBe("wing-flavour");
    expect(problem?.reason).toBe("too_many");
  });
});

describe("toggleOption", () => {
  it("replaces the choice in a single-choice group", () => {
    expect(toggleOption(flavourGroup, ["classic-buffalo"], "cheezy")).toEqual(["cheezy"]);
  });

  it("refuses to clear a required single-choice group", () => {
    // Tapping the selected flavour again would otherwise leave the screen in a
    // state its own Add button rejects, with nothing on it changed.
    expect(toggleOption(flavourGroup, ["cheezy"], "cheezy")).toEqual(["cheezy"]);
  });

  it("clears an optional single-choice group", () => {
    expect(toggleOption(heatGroup, ["hot"], "hot")).toEqual([]);
  });

  it("swaps one heat level for another", () => {
    expect(toggleOption(heatGroup, ["hot"], "insane")).toEqual(["insane"]);
  });

  it("refuses to exceed maxSelect rather than dropping an earlier choice", () => {
    const multi: MenuOptionGroup = {
      slug: "dips",
      name: "Dips",
      minSelect: 0,
      maxSelect: 2,
      options: [
        { slug: "ranch", name: "Ranch", priceCents: 2500, variationPriceCents: {} },
        { slug: "cheese", name: "Cheese", priceCents: 2500, variationPriceCents: {} },
        { slug: "garlic", name: "Garlic", priceCents: 2500, variationPriceCents: {} },
      ],
    };

    expect(toggleOption(multi, ["ranch", "cheese"], "garlic")).toEqual(["ranch", "cheese"]);
    expect(toggleOption(multi, ["ranch"], "garlic")).toEqual(["ranch", "garlic"]);
    expect(toggleOption(multi, ["ranch", "cheese"], "ranch")).toEqual(["cheese"]);
  });
});

describe("previewImage", () => {
  it("shows the chosen flavour rather than the item's own photograph", () => {
    const { image, option } = previewImage(wings, { "wing-flavour": ["salted-egg"] });
    expect(option?.slug).toBe("salted-egg");
    expect(image?.source).toBe("2025/03/Salted-Egg.jpg");
    expect(image?.src).not.toBe(wings.image?.src);
  });

  it("keeps the item photograph when a group carries no photography", () => {
    // Heat levels have no picture. A selected heat level must not blank the
    // frame, which is the same rule that decides a group renders as a list
    // rather than as a grid.
    const { image, option } = previewImage(wings, { "level-of-hotness": ["insane"] });
    expect(option).toBeNull();
    expect(image?.src).toBe(wings.image?.src);
  });

  it("prefers the flavour even when heat is also chosen", () => {
    const { option } = previewImage(wings, {
      "wing-flavour": ["honey-garlic"],
      "level-of-hotness": ["wild"],
    });
    expect(option?.slug).toBe("honey-garlic");
  });

  it("falls back to the item photograph when nothing is chosen", () => {
    expect(previewImage(wings, {}).image?.src).toBe(wings.image?.src);
  });

  it("ignores an option slug the item does not sell", () => {
    expect(previewImage(wings, { "wing-flavour": ["nuclear"] }).image?.src).toBe(
      wings.image?.src,
    );
  });

  it("returns null rather than a broken image for an unphotographed item", () => {
    const coffee = findItem(categories, "iced-americano") as MenuItem;
    expect(previewImage(coffee, {}).image).toBeNull();
  });
});
