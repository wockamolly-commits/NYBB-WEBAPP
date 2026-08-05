/**
 * The menu as the storefront consumes it.
 *
 * These are deliberately not the same types as `lib/catalog/types.ts`. That
 * file is an authoring format: it references photography by manifest key,
 * because a human maintains it and a key is easier to write than six image
 * fields. This is the runtime format, where the image is already resolved and
 * the component does not need to know where it came from.
 *
 * `get_storefront_menu()` in migration 0011 returns exactly this shape, and
 * `lib/menu/static.ts` projects the authoring format into it, which is what
 * lets one reader serve both sources.
 */

export type MenuImage = {
  src: string;
  width: number;
  height: number;
  blurDataURL: string;
  /** Absent on option photography, which the schema does not classify. */
  treatment?: string | null;
  /** Path inside the legacy archive. The bridge back to a local derivative. */
  source?: string | null;
};

export type MenuVariation = {
  slug: string;
  /** "Half, 6 pieces". */
  name: string;
  /** "HALF", for chips and tickets. */
  shortName: string;
  priceCents: number;
};

export type MenuOption = {
  slug: string;
  name: string;
  description?: string | null;
  /**
   * The flat upcharge, or null when this option has no flat price at all and
   * the chosen variation decides. Null is not zero: every Level of Hotness
   * level above "No heat" is null here and priced through
   * `variationPriceCents`.
   */
  priceCents: number | null;
  /** Variation slug to price. Takes precedence over `priceCents`. */
  variationPriceCents: Record<string, number>;
  /** 0 to 100, drives the heat meter. Absent when the option is not heat. */
  heatPercent?: number | null;
  image?: MenuImage | null;
};

export type MenuOptionGroup = {
  slug: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: MenuOption[];
};

export type MenuItem = {
  slug: string;
  name: string;
  code?: string | null;
  description?: string | null;
  categorySlug: string;
  featured: boolean;
  pricingNote?: string | null;
  image: MenuImage | null;
  variations: MenuVariation[];
  optionGroups: MenuOptionGroup[];
};

export type MenuCategory = {
  slug: string;
  name: string;
  blurb: string;
  items: MenuItem[];
};

/** Where a rendered menu came from, so a page can say so if it needs to. */
export type MenuSource = "database" | "static";

export type StorefrontMenu = {
  categories: MenuCategory[];
  source: MenuSource;
};
