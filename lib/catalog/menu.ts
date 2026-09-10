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

/**
 * Choose one flavour, no upcharge. Ten flavours on the Hot Wings list.
 *
 * Nine until 2026-09-07. The tenth is Brad's Gravy, and it was missed because
 * the spec's transcription of the Our Menu page lists nine. Two independent
 * sources say ten: the archive's 2025/03 batch, which is the Hot Wings refresh
 * (it is the only batch holding Cheezy, Salted Egg and Smokey Barbecue) and
 * carries a Brad's Gravy shot alongside the other nine, and the live Foodpanda
 * listing for SM City Cebu, whose "Chicken Flavor (6pcs)" group names all ten.
 *
 * Lemon Pepper, Pesto and Hickory are the ones that are genuinely not on this
 * list. They appear only in the 2024/05 batch, which is the Sports Lounge era,
 * and on that brand's eleven-flavour list. Photography for them exists and is
 * deliberately unmapped.
 */
const wingFlavours: CatalogOptionGroup = {
  slug: "wing-flavour",
  name: "Flavour",
  minSelect: 1,
  maxSelect: 1,
  options: [
    {
      slug: "classic-buffalo",
      code: "NY1",
      name: "Classic Buffalo",
      priceCents: 0,
      description: "The original. Tangy, buttery, unmistakably buffalo.",
      imageKey: "wings-classic-buffalo",
    },
    {
      slug: "bbq-lime",
      code: "NY2",
      name: "BBQ Lime",
      priceCents: 0,
      description: "Smoky barbecue cut with lime.",
      imageKey: "wings-bbq-lime",
    },
    {
      slug: "cheezy",
      code: "NY3",
      name: "Cheezy",
      priceCents: 0,
      description: "Thick cheese sauce, poured on.",
      imageKey: "wings-cheezy",
    },
    {
      slug: "garlic-parmesan",
      code: "NY4",
      name: "Garlic Parmesan",
      priceCents: 0,
      description: "Garlic butter and grated parmesan.",
      imageKey: "wings-garlic-parmesan",
    },
    {
      slug: "honey-mustard",
      code: "NY5",
      name: "Honey Mustard",
      priceCents: 0,
      description: "Sweet and sharp in equal measure.",
      imageKey: "wings-honey-mustard",
    },
    {
      slug: "smokey-barbecue",
      code: "NY6",
      name: "Smokey BBQ",
      priceCents: 0,
      description: "Deep, dark and smoky.",
      imageKey: "wings-smokey-barbecue",
    },
    {
      slug: "salted-egg",
      code: "NY7",
      name: "Salted Egg",
      priceCents: 0,
      description: "Rich, savoury, a Filipino favourite.",
      imageKey: "wings-salted-egg",
    },
    {
      slug: "honey-garlic",
      code: "NY8",
      name: "Honey Garlic",
      priceCents: 0,
      description: "Sticky honey, toasted garlic.",
      imageKey: "wings-honey-garlic",
    },
    {
      slug: "sweet-spicy",
      code: "NY9",
      name: "Sweet Spicy",
      priceCents: 0,
      description: "Sweet first, heat after.",
      imageKey: "wings-sweet-spicy",
    },
    {
      slug: "brads-gravy",
      code: "NY10",
      name: "Brad's Gravy",
      priceCents: 0,
      description: "Savoury gravy of meat stock and mushroom.",
      imageKey: "wings-brads-gravy",
    },
  ],
};

/**
 * Level of Hotness.
 *
 * A flat PHP 29 on every level and every size, per the live Foodpanda listing
 * for SM City Cebu (option groups "Level of Hotness (Half Order)" and
 * "(Full Order)", which carry identical prices).
 *
 * It was PHP 30 on a HALF and PHP 40 on a FULL, with INSANE at PHP 40 and
 * PHP 60, transcribed from the website's Our Menu page. That page is years
 * stale, and the shape it described is the reason
 * `menu_option_variation_prices` exists in the schema. The table stays: it
 * costs nothing, it is the correct model for a price that depends on the
 * chosen variation, and boneless wings would have needed it the moment a
 * fourth variation appeared under the old scheme. It simply has no rows now.
 *
 * The flat price is why the boneless variations below need no heat pricing of
 * their own.
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
    { slug: "lite", name: "Lite", priceCents: 2900, heatPercent: 20 },
    { slug: "moderate", name: "Moderate", priceCents: 2900, heatPercent: 40 },
    { slug: "hot", name: "Hot", priceCents: 2900, heatPercent: 60 },
    { slug: "wild", name: "Wild", priceCents: 2900, heatPercent: 80 },
    { slug: "insane", name: "Insane", priceCents: 2900, heatPercent: 100 },
  ],
};

/** A single-price item still gets one variation row, exactly as the DB will. */
function one(priceCents: number) {
  return [
    { slug: "regular", name: "Regular", shortName: "REG", priceCents },
  ];
}
/**
 * The price recorded for an item whose pickup price nobody has confirmed.
 *
 * These come from the Foodpanda listing for SM City Cebu, read from
 * `price_before_discount` (a 15% vendor promo was masking `price` when this was
 * captured). They are delivery prices: they carry Foodpanda's channel markup,
 * so they are evidence of what is on the menu and not of what this pickup app
 * should charge. Every item carrying this note also carries `active: false`, so
 * none of these numbers can reach a customer.
 */
const FOODPANDA_PRICE =
  "Foodpanda delivery list price, SM City Cebu, captured 2026-09-07. Includes " +
  "the delivery channel markup and is not a pickup price. Inactive until the " +
  "owner confirms. See docs/MENU-PRICES-TO-CONFIRM.md.";

/** Not on the Foodpanda listing, kept anyway. */
const KEPT_OFF_DELIVERY =
  "Not on the Foodpanda listing. Kept on the owner's instruction: absence from " +
  "the delivery menu is not evidence the counter stopped selling it.";

export const categories: CatalogCategory[] = [
  {
    slug: "whats-new",
    name: "What's New",
    blurb: "Limited runs and the odd thing that is not food.",
    items: [
      {
        slug: "ny-umbrella",
        name: "NY Umbrella",
        categorySlug: "whats-new",
        description:
          "A branded umbrella, folding, for the rain and the sun. Merchandise rather than food.",
        variations: one(34900),
        optionGroups: [],
        active: false,
        pricingNote:
          FOODPANDA_PRICE +
          " Also the only non-food item on the menu: it needs no pickup slot, " +
          "no prep time and no kitchen ticket, so confirm it should be sold " +
          "through an ordering flow built for food before switching it on.",
      },
      {
        slug: "rainy-day-rush-bundle-a",
        name: "Rainy Day Rush 2026 (Bundle A)",
        categorySlug: "whats-new",
        description:
          "One half order of chicken wings, two rice, one carbonara, two 16oz juices, and a free NY Umbrella.",
        variations: one(129900),
        optionGroups: [],
        active: false,
        pricingNote:
          FOODPANDA_PRICE +
          " Seasonal: the name carries a year, so it needs retiring rather " +
          "than repricing once the promotion ends.",
      },
      {
        slug: "rainy-day-rush-bundle-b",
        name: "Rainy Day Rush 2026 (Bundle B)",
        categorySlug: "whats-new",
        description:
          "One carbonara, two flavoured fries, two 16oz juices, two classic hotdogs, and a free NY Umbrella.",
        variations: one(129900),
        optionGroups: [],
        active: false,
        pricingNote:
          FOODPANDA_PRICE +
          " Seasonal: the name carries a year, so it needs retiring rather " +
          "than repricing once the promotion ends.",
      },
    ],
  },
  {
    slug: "chicken-wings",
    name: "Chicken",
    blurb: "Ten flavours, five levels of heat. The reason the place exists.",
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
          {
            slug: "boneless-half",
            name: "Boneless half, 6 pieces",
            shortName: "BL HALF",
            priceCents: 32900,
          },
          {
            slug: "boneless-full",
            name: "Boneless full, 10 pieces",
            shortName: "BL FULL",
            priceCents: 52900,
          },
        ],
        optionGroups: [wingFlavours, wingHeat],
        imageKey: "wings-classic-buffalo",
        featured: true,
        pricingNote:
          "Boneless is priced level with bone-in because Foodpanda prices all four the same way (Half and Boneless Half both 458, Full and Boneless Full both 719). The parity is copied, not the amounts.",
      },
    ],
  },
  {
    slug: "ny-specials",
    name: "NY Specials",
    blurb: "Ribs off the bone, and nuggets by the box.",
    items: [
      {
        slug: "ribs-original",
        name: "NY Ribs Original",
        categorySlug: "ny-specials",
        variations: one(34900),
        optionGroups: [],
        imageKey: "ribs-original",
        featured: true,
      },
      {
        slug: "ribs-spicy",
        name: "NY Ribs Spicy",
        categorySlug: "ny-specials",
        variations: one(34900),
        optionGroups: [],
        imageKey: "ribs-spicy",
      },
      {
        slug: "chicken-nuggets",
        name: "Chicken Nuggets",
        categorySlug: "ny-specials",
        variations: [
          { slug: "6-pieces", name: "6 pieces", shortName: "6 PC", priceCents: 13100 },
          { slug: "10-pieces", name: "10 pieces", shortName: "10 PC", priceCents: 21000 },
        ],
        optionGroups: [],
        imageKey: "side-nuggets",
      },
    ],
  },
  {
    slug: "hunger-busters",
    name: "Hunger Busters",
    blurb: "A burger, fries and a drink.",
    items: [
      {
        slug: "rookie-burger-meal",
        name: "Rookie Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(20600),
        optionGroups: [],
        imageKey: "burger-rookie",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "quarterback-burger-meal",
        name: "The Quarterback Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(32600),
        optionGroups: [],
        imageKey: "burger-quarterback",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "blt-burger-meal",
        name: "BLT Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(42500),
        optionGroups: [],
        imageKey: "burger-blt",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "buffalo-chicken-burger-meal",
        name: "Buffalo Chicken Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(40100),
        optionGroups: [],
        imageKey: "burger-buffalo-chicken",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "smokey-bbq-chicken-burger-meal",
        name: "Smokey BBQ Chicken Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(35000),
        optionGroups: [],
        imageKey: "chicken-burger-smokey-bbq",
        pricingNote:
          "350 is our own figure, from the Our Menu page's Smokey BBQ Meal line. Foodpanda prices this meal at 401. Active because the price is ours rather than the delivery channel's, but worth confirming.",
      },
      {
        slug: "honey-garlic-chicken-burger-meal",
        name: "Honey Garlic Chicken Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(40100),
        optionGroups: [],
        imageKey: "chicken-burger-honey-garlic",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "cheezy-chicken-burger-meal",
        name: "Cheezy Chicken Burger Meal",
        categorySlug: "hunger-busters",
        variations: one(40100),
        optionGroups: [],
        imageKey: "chicken-burger-cheezy",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "brads-angus-burger-meal",
        name: "Brad's Angus Burger Meal",
        code: "BB5",
        categorySlug: "hunger-busters",
        variations: one(34900),
        optionGroups: [],
        imageKey: "burger-angus",
        pricingNote:
          "349 is our own figure, from the Our Menu page's BB5 line, which names the meal. Foodpanda prices this meal at 471. Active because the price is ours, but the gap is large enough to confirm.",
      },
    ],
  },
  {
    slug: "breaktime-treats",
    name: "Breaktime Treats",
    blurb: "A dog, fries and a drink.",
    items: [
      {
        slug: "classic-hotdog-meal",
        name: "Classic Hotdog Meal",
        categorySlug: "breaktime-treats",
        variations: one(20200),
        optionGroups: [],
        imageKey: "hotdog-classic",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "jalapeno-cheesedog-meal",
        name: "Jalapeño Cheesedog Meal",
        categorySlug: "breaktime-treats",
        variations: one(24800),
        optionGroups: [],
        imageKey: "hotdog-jalapeno-cheese",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "chili-cheesedog-meal",
        name: "Chili Cheesedog Meal",
        categorySlug: "breaktime-treats",
        variations: one(29400),
        optionGroups: [],
        imageKey: "hotdog-chili-cheese",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "hungarian-sandwich-meal",
        name: "Hungarian Sandwich Meal",
        categorySlug: "breaktime-treats",
        variations: one(31700),
        optionGroups: [],
        imageKey: "hotdog-hungarian",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
    ],
  },
  {
    slug: "value-meals",
    name: "Value Meal",
    blurb: "Rice, a main, and change from a note.",
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
        pricingNote:
          "Our Sets A, B and C are not on Foodpanda, which instead sells four named value meals at 229 each. Whether the sets survived the repricing is an owner question.",
      },
      {
        slug: "chicken-wings-meal",
        name: "Chicken Wings Meal",
        categorySlug: "value-meals",
        description: "Two pieces of wings in your chosen sauce, with rice.",
        variations: one(22900),
        optionGroups: [],
        imageKey: "wings-classic-buffalo",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "boneless-chicken-meal",
        name: "Boneless Chicken Meal",
        categorySlug: "value-meals",
        description: "Two pieces of boneless chicken in your chosen sauce, with rice.",
        variations: one(22900),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "chicken-nuggets-meal",
        name: "Chicken Nuggets Meal",
        categorySlug: "value-meals",
        description: "Four nuggets with rice and a dip.",
        variations: one(22900),
        optionGroups: [],
        imageKey: "side-nuggets",
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "burger-steak-meal",
        name: "Burger Steak Meal",
        categorySlug: "value-meals",
        description: "Two burger steaks with rice and gravy.",
        variations: one(22900),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
    ],
  },
  {
    slug: "ny-burgers",
    name: "NY Burgers",
    blurb: "Eight burgers, beef and chicken, on their own.",
    items: [
      {
        slug: "rookie",
        name: "Rookie Burger",
        code: "BB1",
        categorySlug: "ny-burgers",
        variations: one(15900),
        optionGroups: [],
        imageKey: "burger-rookie",
      },
      {
        slug: "quarterback",
        name: "The Quarterback Burger",
        code: "BB2",
        categorySlug: "ny-burgers",
        variations: one(22900),
        optionGroups: [],
        imageKey: "burger-quarterback",
      },
      {
        slug: "blt",
        name: "BLT Burger",
        code: "BB3",
        categorySlug: "ny-burgers",
        variations: one(27900),
        optionGroups: [],
        imageKey: "burger-blt",
      },
      {
        slug: "buffalo-chicken",
        name: "Buffalo Chicken Burger",
        code: "BB4",
        categorySlug: "ny-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "burger-buffalo-chicken",
      },
      {
        slug: "brads-angus-burger",
        name: "Brad's Angus Burger",
        categorySlug: "ny-burgers",
        variations: one(43600),
        optionGroups: [],
        imageKey: "burger-angus",
        active: false,
        pricingNote:
          "Foodpanda delivery list price, SM City Cebu, captured 2026-09-07, and not a pickup price. Our own list prices only the BB5 meal, never the burger alone. Inactive until the owner confirms.",
      },
      {
        slug: "smokey-bbq-chicken-burger",
        name: "Smokey BBQ Chicken Burger",
        categorySlug: "ny-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "chicken-burger-smokey-bbq",
      },
      {
        slug: "honey-garlic-chicken-burger",
        name: "Honey Garlic Chicken Burger",
        categorySlug: "ny-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "chicken-burger-honey-garlic",
      },
      {
        slug: "cheezy-chicken-burger",
        name: "Cheezy Chicken Burger",
        categorySlug: "ny-burgers",
        variations: one(30900),
        optionGroups: [],
        imageKey: "chicken-burger-cheezy",
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
          "The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Foodpanda sells one size at 214. Confirm.",
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
          "The live menu prints 156/159 without labels. Read as solo and meal, matching how the sides list labels its own two-price items. Foodpanda sells one size at 214. Confirm.",
      },
    ],
  },
  {
    slug: "ny-hotdogs",
    name: "Hotdog And Sausage",
    blurb: "On their own, numbered H1 to H5.",
    items: [
      {
        slug: "classic-hotdog",
        name: "Classic Hotdog",
        code: "H1",
        categorySlug: "ny-hotdogs",
        variations: one(14900),
        optionGroups: [],
        imageKey: "hotdog-classic",
      },
      {
        slug: "jalapeno-cheese-dog",
        name: "Jalapeño Cheesedog",
        code: "H2",
        categorySlug: "ny-hotdogs",
        variations: one(17900),
        optionGroups: [],
        imageKey: "hotdog-jalapeno-cheese",
      },
      {
        slug: "chili-cheese-dog",
        name: "Chili Cheesedog",
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
        pricingNote: KEPT_OFF_DELIVERY,
      },
      {
        slug: "hungarian-sandwich",
        name: "Hungarian Sausage Sandwich",
        code: "H5",
        categorySlug: "ny-hotdogs",
        variations: one(23900),
        optionGroups: [],
        imageKey: "hotdog-hungarian",
      },
    ],
  },
  {
    slug: "sides",
    name: "Fries & Sides",
    blurb: "The supporting cast.",
    items: [
      {
        slug: "french-fries",
        name: "NY Fries",
        categorySlug: "sides",
        variations: [
          { slug: "regular", name: "Regular", shortName: "REG", priceCents: 12800 },
          {
            slug: "small",
            name: "Small",
            shortName: "SMALL",
            priceCents: 10300,
            active: false,
          },
          {
            slug: "medium",
            name: "Medium",
            shortName: "MED",
            priceCents: 17200,
            active: false,
          },
          {
            slug: "large",
            name: "Large",
            shortName: "LARGE",
            priceCents: 19500,
            active: false,
          },
        ],
        optionGroups: [],
        pricingNote:
          "Our list has one unlabelled French Fries price of 128, and 128 is none of Foodpanda's three (103 / 172 / 195), so there is no honest way to say which size we hold a price for. The three sizes are recorded switched off and the single Regular keeps selling until the owner says which is which. Expect to delete Regular at that point.",
      },
      {
        slug: "french-fries-cheese",
        name: "French Fries Cheese",
        categorySlug: "sides",
        variations: one(19000),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "french-fries-bbq",
        name: "French Fries BBQ",
        categorySlug: "sides",
        variations: one(19000),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "french-fries-sour-cream",
        name: "French Fries Sour Cream",
        categorySlug: "sides",
        variations: one(19000),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
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
        slug: "plain-rice",
        name: "Plain Rice",
        categorySlug: "sides",
        variations: one(5700),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
    ],
  },
  {
    slug: "rice-meals",
    name: "Rice Meals",
    blurb: "A sausage or a fillet, and rice.",
    items: [
      {
        slug: "hungarian-rice-meal",
        name: "Hungarian With Rice",
        categorySlug: "rice-meals",
        variations: [
          { slug: "regular", name: "Regular", shortName: "REG", priceCents: 18900 },
          {
            slug: "solo",
            name: "Solo",
            shortName: "SOLO",
            priceCents: 21300,
            active: false,
          },
          {
            slug: "meal",
            name: "Meal, with a drink",
            shortName: "MEAL",
            priceCents: 24800,
            active: false,
          },
        ],
        optionGroups: [],
        pricingNote:
          "Our list has one price of 189, and Foodpanda sells this as Solo 213 and Meal 248, the meal being the one with a drink. Which of the two our 189 is nobody can say, so both are recorded switched off and the single Regular keeps selling. Expect to delete Regular once the owner rules.",
      },
      {
        slug: "chicken-with-rice",
        name: "Chicken with Rice",
        categorySlug: "rice-meals",
        variations: [
          { slug: "solo", name: "Solo", shortName: "SOLO", priceCents: 10500 },
          { slug: "meal", name: "Meal", shortName: "MEAL", priceCents: 13000 },
        ],
        optionGroups: [],
        pricingNote: KEPT_OFF_DELIVERY,
      },
    ],
  },
  {
    slug: "iced-coffee",
    name: "Coffee Series",
    blurb: "Cold, and cheaper than the mall.",
    items: [
      {
        slug: "iced-americano",
        name: "Iced Americano",
        categorySlug: "iced-coffee",
        variations: one(8900),
        optionGroups: [],
        imageKey: "coffee-americano",
      },
      {
        slug: "iced-sweet-black",
        name: "Iced Sweet Black",
        categorySlug: "iced-coffee",
        description: "Cold black coffee, lightly sweetened.",
        variations: one(11900),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "iced-vanilla",
        name: "Iced Vanilla",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
        imageKey: "coffee-vanilla",
      },
      {
        slug: "iced-dark-mocha",
        name: "Iced Dark Mocha",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
        imageKey: "coffee-dark-mocha",
      },
      {
        slug: "iced-hazelnut",
        name: "Iced Hazelnut",
        categorySlug: "iced-coffee",
        variations: one(13900),
        optionGroups: [],
        imageKey: "coffee-hazelnut",
      },
    ],
  },
  {
    slug: "beverages",
    name: "Beverages",
    blurb: "Cold drinks by the cup and by the bottle.",
    items: [
      {
        slug: "cucumber-lemonade",
        name: "Cucumber Lemonade Juice",
        categorySlug: "beverages",
        variations: [
          { slug: "8-oz", name: "8 oz", shortName: "8 OZ", priceCents: 9100 },
          { slug: "16-oz", name: "16 oz", shortName: "16 OZ", priceCents: 13700 },
          { slug: "22-oz", name: "22 oz", shortName: "22 OZ", priceCents: 16000 },
        ],
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "lemon-iced-tea",
        name: "Lemon Iced Tea Juice",
        categorySlug: "beverages",
        variations: [
          { slug: "8-oz", name: "8 oz", shortName: "8 OZ", priceCents: 9100 },
          { slug: "16-oz", name: "16 oz", shortName: "16 OZ", priceCents: 13700 },
          { slug: "22-oz", name: "22 oz", shortName: "22 OZ", priceCents: 16000 },
        ],
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
      },
      {
        slug: "bottled-water",
        name: "Bottled Water",
        categorySlug: "beverages",
        variations: one(5700),
        optionGroups: [],
        active: false,
        pricingNote: FOODPANDA_PRICE,
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
        pricingNote: KEPT_OFF_DELIVERY,
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
        pricingNote: KEPT_OFF_DELIVERY,
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
        pricingNote: KEPT_OFF_DELIVERY,
      },
    ],
  },
];

export { wingFlavours, wingHeat };
