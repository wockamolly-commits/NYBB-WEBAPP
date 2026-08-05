import { categories } from "./menu";
import type { CatalogCategory, CatalogItem } from "./types";

export { categories } from "./menu";
export { branches, branchFormatLabel } from "./branches";
export { catalogImage, imageKeys } from "./images";
export { optionPriceCents, itemPriceRange, defaultVariation } from "./pricing";
export type * from "./types";

/** Every item, flattened, in menu order. */
export function allItems(): CatalogItem[] {
  return categories.flatMap((category) => category.items);
}

export function findCategory(slug: string): CatalogCategory | undefined {
  return categories.find((category) => category.slug === slug);
}

export function findItem(slug: string): CatalogItem | undefined {
  return allItems().find((item) => item.slug === slug);
}

/** The landing page's bestsellers strip. */
export function featuredItems(): CatalogItem[] {
  return allItems().filter((item) => item.featured);
}
