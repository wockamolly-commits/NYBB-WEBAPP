import type { CatalogCategory, CatalogOptionGroup } from "./types";

/**
 * The NYBB Hot Wings menu, transcribed from the live Our Menu page.
 *
 * Scope note: Hot Wings only. The Sports Lounge list is not here and must not
 * be added. That venue closed in August 2026 and nothing in this app may
 * reference it, its menu, its address or its socials.
 *
 * Phase 0 reads this file. Phase 1 reads `get_storefront_menu()` and this
 * becomes the seed data for `supabase/seed.sql`, which is why the shape already
 * matches the tables.
 *
 * Every price is centavos. Prices are per the published price list
 * (`hot-wings-standard`); the branch mix (mall food halls, a hospital kiosk, a
 * casino outlet, four petrol forecourts) is the reason the schema keeps price
 * lists per branch even while only one list exists.
 */

/** Choose one flavour, no upcharge. Nine flavours on the Hot Wings list. */
const wingFlavours: CatalogOptionGroup = {
  slug: "wing-flavour",
  name: "Flavour",
  minSelect: 1,
  maxSelect: 1,
  options: [
    {
      slug: "classic-buffalo",
      name: "Classic Buffalo",
      priceCents: 0,
      description: "The original. Tangy, buttery, unmistakably buffalo.",
      imageKey: "wings-classic-buffalo",
    },
    {
      slug: "bbq-lime",
      name: "BBQ Lime",
      priceCents: 0,
      description: "Smoky barbecue cut with lime.",
      imageKey: "wings-bbq-lime",
    },
    {
      slug: "cheezy",
      name: "Cheezy",
      priceCents: 0,
      description: "Thick cheese sauce, poured on.",
      imageKey: "wings-cheezy",
    },
    {
      slug: "garlic-parmesan",
      name: "Garlic Parmesan",
      priceCents: 0,
      description: "Garlic butter and grated parmesan.",
      imageKey: "wings-garlic-parmesan",
    },
    {
      slug: "honey-mustard",
      name: "Honey Mustard",
      priceCents: 0,
      description: "Sweet and sharp in equal measure.",
      imageKey: "wings-honey-mustard",
    },
    {
      slug: "smokey-barbecue",
      name: "Smokey Barbecue",
      priceCents: 0,
      description: "Deep, dark and smoky.",
      imageKey: "wings-smokey-barbecue",
    },
    {
      slug: "salted-egg",
      name: "Salted Egg",
      priceCents: 0,
      description: "Rich, savoury, a Filipino favourite.",
      imageKey: "wings-salted-egg",
    },
    {
      slug: "honey-garlic",
      name: "Honey Garlic",
      priceCents: 0,
      description: "Sticky honey, toasted garlic.",
      imageKey: "wings-honey-garlic",
    },
    {
      slug: "sweet-spicy",
      name: "Sweet Spicy",
      priceCents: 0,
      description: "Sweet first, heat after.",
      imageKey: "wings-sweet-spicy",
    },
  ],
};

/**
 * Level of Hotness.
 *
 * This is the pricing case that breaks a flat option model, and it is the
 * reason `menu_option_variation_prices` exists in the schema. The add-on is
 * PHP 30 on a HALF and PHP 40 on a FULL, except INSANE, which is PHP 40 and
 * PHP 60. `priceCents: null` states that there is no flat price to fall back
 * on: the variation decides, always.
 */
const wingHeat: CatalogOptionGroup = {
  slug: "level-of-hotness",
  name: "Level of Hotness",
  minSelect: 0,
  maxSelect: 1,
  options: [
    {
      slug: "none",
      name: "No heat",
      priceCents: 0,
      heatPercent: 0,
      description: "Flavour only.",
    },
    {
      slug: "lite",
      name: "Lite",
      priceCents: null,
      heatPercent: 20,
      variationPriceCents: { half: 3000, full: 4000 },
    },
    {
      slug: "moderate",
      name: "Moderate",
      priceCents: null,
      heatPercent: 40,
      variationPriceCents: { half: 3000, full: 4000 },
    },
    {
      slug: "hot",
      name: "Hot",
      priceCents: null,
      heatPercent: 60,
      variationPriceCents: { half: 3000, full: 4000 },
    },
    {
      slug: "wild",
      name: "Wild",
      priceCents: null,
      heatPercent: 80,
      variationPriceCents: { half: 3000, full: 4000 },
    },
    {
      slug: "insane",
      name: "Insane",
      priceCents: null,
      heatPercent: 100,
      variationPriceCents: { half: 4000, full: 6000 },
    },
  ],
};

/** A single-price item still gets one variation row, exactly as the DB will. */
function one(priceCents: number) {
  return [
    { slug: "regular", name: "Regular", shortName: "REG", priceCents },
  ];
}

export const categories: CatalogCategory[] = [
  {
    slug: "chicken-wings",
    name: "Chicken Wings",
    blurb: "Nine flavours, five levels of heat. The reason the place exists.",
    items: [
      {
        slug: "chicken-wings",
        name: "Chicken Wings",
        categorySlug: "chicken-wings",
        description:
          "Fried to order, then sauced in the flavour you pick. Add a level of hotness on top of any flavour.",
        variations: [
          { slug: "half", name: "Half, 6 pieces", shortName: "HALF", priceCents: 32900 },
          { slug: "full", name: "Full, 10 pieces", shortName: "FULL", priceCents: 52900 },
        ],
        optionGroups: [wingFlavours, wingHeat],
        imageKey: "wings-classic-buffalo",
        featured: true,
      },
    ],
  },
  {
    slug: "ribs",
    name: "Ribs",
    blurb: "Slow cooked, two ways.",
    items: [
      {
        slug: "ribs-original",
        name: "Original Ribs",
        categorySlug: "ribs",
        variations: one(34900),
        optionGroups: [],
        imageKey: "ribs-original",
        featured: true,
      },
      {
        slug: "ribs-spicy",
        name: "Spicy Ribs",
        categorySlug: "ribs",
        variations: one(34900),
        optionGroups: [],
        imageKey: "ribs-spicy",
      },
    ],
  },
  {
    slug: "ny-burgers",
    name: "NY Burgers",
    blurb: "Five burgers, numbered BB1 to BB5.",
    items: [
      {
        slug: "rookie",
        name: "The Rookie",
        code: "BB1",
        categorySlug: "ny-burgers",
        variations: one(15900),
        optionGroups: [],
        imageKey: "burger-rookie",
      },
      {
        slug: "quarterback",
        name: "The Quarterback",
        code: "BB2",
        categorySlug: "ny-burgers",
        variations: one(22900),
        optionGroups: [],
        imageKey: "burger-quarterback",
      },
      {
        slug: "blt",
        name: "BLT",
        code: "BB3",
        categorySlug: "ny-burgers",
        variations: one(27900),
        optionGroups: [],
        imageKey: "burger-blt",
      },
      {
        slug: "buffalo-chicken",
        name: "Buffalo Chicken",
        code: "BB4",
        categorySlug: "ny-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "burger-buffalo-chicken",
        featured: true,
      },
      {
        slug: "brads-angus-burger-meal",
        name: "Brad's Angus Burger Meal",
        code: "BB5",
        categorySlug: "ny-burgers",
        variations: one(34900),
        optionGroups: [],
        imageKey: "burger-angus",
      },
    ],
  },
  {
    slug: "ny-chicken-burgers",
    name: "NY Chicken Burgers",
    blurb: "The wing flavours, in a bun.",
    items: [
      {
        slug: "smokey-bbq-chicken-burger",
        name: "Smokey BBQ Chicken Burger",
        categorySlug: "ny-chicken-burgers",
        variations: [
          { slug: "a-la-carte", name: "A la carte", shortName: "SOLO", priceCents: 30900 },
          { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 35000 },
        ],
        optionGroups: [],
        imageKey: "chicken-burger-smokey-bbq",
        pricingNote:
          "The live menu lists Smokey BBQ at 309 and a Smokey BBQ Meal at 350. Read here as one item with two sizes. Confirm.",
      },
      {
        slug: "honey-garlic-chicken-burger",
        name: "Honey Garlic Chicken Burger",
        categorySlug: "ny-chicken-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "chicken-burger-honey-garlic",
      },
      {
        slug: "cheezy-chicken-burger",
        name: "Cheezy Chicken Burger",
        categorySlug: "ny-chicken-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "chicken-burger-cheezy",
      },
    ],
  },
  {
    slug: "ny-hotdogs",
    name: "NY Hotdogs",
    blurb: "Five dogs, numbered H1 to H5.",
    items: [
      {
        slug: "classic-hotdog",
        name: "Classic",
        code: "H1",
        categorySlug: "ny-hotdogs",
        variations: one(14900),
        optionGroups: [],
        imageKey: "hotdog-classic",
      },
      {
        slug: "jalapeno-cheese-dog",
        name: "Jalapeno Cheese",
        code: "H2",
        categorySlug: "ny-hotdogs",
        variations: one(17900),
        optionGroups: [],
        imageKey: "hotdog-jalapeno-cheese",
      },
      {
        slug: "chili-cheese-dog",
        name: "Chili Cheese",
        code: "H3",
        categorySlug: "ny-hotdogs",
        variations: one(20900),
        optionGroups: [],
        imageKey: "hotdog-chili-cheese",
      },
      {
        slug: "hawaiian-bbq-dog",
        name: "Hawaiian BBQ",
        code: "H4",
        categorySlug: "ny-hotdogs",
        variations: one(24900),
        optionGroups: [],
        imageKey: "hotdog-hawaiian-bbq",
      },
      {
        slug: "hungarian-sandwich",
        name: "Hungarian Sandwich",
        code: "H5",
        categorySlug: "ny-hotdogs",
        variations: one(23900),
        optionGroups: [],
        imageKey: "hotdog-hungarian",
      },
    ],
  },
  {
    slug: "value-meals",
    name: "Value Meals",
    blurb: "Two pieces of wings and rice, then build up from there.",
    items: [
      {
        slug: "value-meal",
        name: "Value Meal",
        categorySlug: "value-meals",
        description: "Two pieces of wings with rice. Add a drink, then fries.",
        variations: [
          { slug: "set-a", name: "Set A, wings and rice", shortName: "SET A", priceCents: 10200 },
          { slug: "set-b", name: "Set B, with a drink", shortName: "SET B", priceCents: 12400 },
          {
            slug: "set-c",
            name: "Set C, with a drink and fries",
            shortName: "SET C",
            priceCents: 15000,
          },
        ],
        optionGroups: [],
        imageKey: "value-meals",
        featured: true,
      },
    ],
  },
  {
    slug: "sides",
    name: "Sides",
    blurb: "The supporting cast.",
    items: [
      {
        slug: "chicken-nuggets",
        name: "Chicken Nuggets",
        categorySlug: "sides",
        variations: [
          { slug: "6-pieces", name: "6 pieces", shortName: "6 PC", priceCents: 13100 },
          { slug: "10-pieces", name: "10 pieces", shortName: "10 PC", priceCents: 21000 },
        ],
        optionGroups: [],
        imageKey: "side-nuggets",
      },
      {
        slug: "mozzarella-sticks",
        name: "Mozzarella Sticks",
        categorySlug: "sides",
        variations: one(29900),
        optionGroups: [],
        imageKey: "side-mozzarella-sticks",
      },
      {
        slug: "hungarian-rice-meal",
        name: "Hungarian Rice Meal",
        categorySlug: "sides",
        variations: one(18900),
        optionGroups: [],
      },
      {
        slug: "french-fries",
        name: "French Fries",
        categorySlug: "sides",
        variations: one(12800),
        optionGroups: [],
      },
      {
        slug: "chicken-with-rice",
        name: "Chicken with Rice",
        categorySlug: "sides",
        variations: [
          { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 10500 },
          { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 13000 },
        ],
        optionGroups: [],
      },
    ],
  },
  {
    slug: "pasta",
    name: "Pasta",
    blurb: "Two plates, solo or as a meal.",
    items: [
      {
        slug: "spaghetti",
        name: "Spaghetti",
        categorySlug: "pasta",
        variations: [
          { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 15600 },
          { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 15900 },
        ],
        optionGroups: [],
        imageKey: "pasta-spaghetti",
        pricingNote:
          "The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Confirm.",
      },
      {
        slug: "carbonara",
        name: "Carbonara",
        categorySlug: "pasta",
        variations: [
          { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 15600 },
          { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 15900 },
        ],
        optionGroups: [],
        imageKey: "pasta-carbonara",
        pricingNote:
          "The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Confirm.",
      },
    ],
  },
  {
    slug: "waffles",
    name: "Waffles",
    blurb: "On their own, or with an iced coffee.",
    items: [
      {
        slug: "chocolate-waffle",
        name: "Chocolate Waffle",
        categorySlug: "waffles",
        variations: [
          { slug: "a-la-carte", name: "A la carte", shortName: "SOLO", priceCents: 4900 },
          { slug: "with-coffee", name: "With iced coffee", shortName: "COMBO", priceCents: 10900 },
        ],
        optionGroups: [],
        imageKey: "waffle-chocolate",
      },
      {
        slug: "bavarian-waffle",
        name: "Bavarian Waffle",
        categorySlug: "waffles",
        variations: [
          { slug: "a-la-carte", name: "A la carte", shortName: "SOLO", priceCents: 4900 },
          { slug: "with-coffee", name: "With iced coffee", shortName: "COMBO", priceCents: 10900 },
        ],
        optionGroups: [],
        imageKey: "waffle-bavarian",
      },
      {
        slug: "sunrise-waffle",
        name: "Sunrise Waffle",
        categorySlug: "waffles",
        variations: [
          { slug: "a-la-carte", name: "A la carte", shortName: "SOLO", priceCents: 8900 },
          { slug: "with-coffee", name: "With iced coffee", shortName: "COMBO", priceCents: 14900 },
        ],
        optionGroups: [],
        imageKey: "waffle-sunrise",
      },
    ],
  },
  {
    slug: "iced-coffee",
    name: "Iced Coffee Series",
    blurb: "Cold, and cheaper than the mall.",
    items: [
      {
        slug: "iced-americano",
        name: "Iced Americano",
        categorySlug: "iced-coffee",
        variations: one(8900),
        optionGroups: [],
      },
      {
        slug: "iced-vanilla",
        name: "Iced Vanilla",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
      },
      {
        slug: "iced-dark-mocha",
        name: "Iced Dark Mocha",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
      },
      {
        slug: "iced-hazelnut",
        name: "Iced Hazelnut",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
      },
    ],
  },
];

export { wingFlavours, wingHeat };
