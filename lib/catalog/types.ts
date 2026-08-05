/**
 * The shape of the menu.
 *
 * These types deliberately mirror the Phase 1 database tables (menu_categories,
 * menu_items, item_variations, menu_option_groups, menu_options and
 * menu_option_variation_prices) so that swapping the static catalog for
 * `get_storefront_menu()` is a change of data source, not a change of shape.
 *
 * One consequence is visible here already: an option's price is not a single
 * number. The Level of Hotness add-on costs PHP 30 on a HALF order of wings and
 * PHP 40 on a FULL one, so the price is a function of the chosen variation. See
 * `optionPriceCents` in ./pricing.
 */

export type ImageTreatment =
  | "lifestyle"
  | "cutout"
  | "transparent"
  | "scene"
  | "mark";

export type CatalogImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  treatment: ImageTreatment;
  /** Path inside the legacy archive, kept so a re-ingest can trace provenance. */
  source: string;
  /** Only a thumbnail of this item exists. Flagged for re-shoot. */
  lowRes?: boolean;
  /** Identified by sight rather than by filename. Confirm with the owner. */
  tentative?: string;
};

export type CatalogVariation = {
  slug: string;
  /** "Half, 6 pieces". Shown on the product page. */
  name: string;
  /** "HALF". Shown on chips and tickets, where space is tight. */
  shortName: string;
  priceCents: number;
};

export type CatalogOption = {
  slug: string;
  name: string;
  /**
   * Flat upcharge in centavos, or null when the price depends on the chosen
   * variation, in which case `variationPriceCents` carries it.
   */
  priceCents: number | null;
  /** Variation slug to price. Takes precedence over `priceCents`. */
  variationPriceCents?: Record<string, number>;
  /** 0 to 100. Drives the heat meter. Absent for options that are not heat. */
  heatPercent?: number;
  description?: string;
  /** Wing flavours have their own photography and get their own grid. */
  imageKey?: string;
};

export type CatalogOptionGroup = {
  slug: string;
  name: string;
  /** How many options the customer must pick. 0 means the group is optional. */
  minSelect: number;
  maxSelect: number;
  options: CatalogOption[];
};

export type CatalogItem = {
  slug: string;
  name: string;
  /** The menu's own item code where one exists: BB1, H3. */
  code?: string;
  description?: string;
  categorySlug: string;
  variations: CatalogVariation[];
  optionGroups: CatalogOptionGroup[];
  imageKey?: string;
  /** Surfaced on the landing page. */
  featured?: boolean;
  /**
   * A price on the live menu that this catalog had to interpret. Recorded so it
   * can be confirmed with the owner rather than quietly becoming fact.
   */
  pricingNote?: string;
};

export type CatalogCategory = {
  slug: string;
  name: string;
  /** One line under the category header. Not marketing copy, a description. */
  blurb: string;
  items: CatalogItem[];
};

export type Branch = {
  slug: string;
  name: string;
  /** "Mango Avenue". The short form used in lists and chips. */
  shortName: string;
  addressLine: string;
  city: string;
  phones: string[];
  imageKey?: string;
  /**
   * Site format. A Shell forecourt, a mall food hall and a hospital kiosk do
   * not behave the same way for pickup, which is why prep time and slot
   * capacity are per branch in the schema rather than global.
   */
  format: "street" | "mall" | "food-hall" | "petrol" | "hospital" | "casino";
};
