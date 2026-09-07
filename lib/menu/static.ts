import { catalogImage } from "@/lib/catalog/images";
import { categories } from "@/lib/catalog/menu";
import type {
  CatalogImage,
  CatalogItem,
  CatalogOption,
} from "@/lib/catalog/types";
import type { MenuCategory, MenuImage, MenuItem, MenuOption } from "./types";

/**
 * The static catalog, projected into the runtime menu shape.
 *
 * This is the fallback the spec insists on: `/menu` is statically generated,
 * so it reads the database during `next build`, and a Vercel Preview scope
 * missing NEXT_PUBLIC_SUPABASE_* would otherwise fail the build or publish an
 * empty store. It is also simply what runs today, since no Supabase project
 * exists yet.
 *
 * The projection is mechanical on purpose. If it needed judgement, the claim
 * that the two sources are interchangeable would not be true.
 */

function toImage(image: CatalogImage | null): MenuImage | null {
  if (!image) return null;
  return {
    src: image.src,
    width: image.width,
    height: image.height,
    blurDataURL: image.blurDataURL,
    treatment: image.treatment,
    source: image.source,
  };
}

function toOption(option: CatalogOption): MenuOption {
  return {
    slug: option.slug,
    name: option.name,
    description: option.description ?? null,
    priceCents: option.priceCents,
    variationPriceCents: option.variationPriceCents ?? {},
    heatPercent: option.heatPercent ?? null,
    image: toImage(catalogImage(option.imageKey)),
  };
}

function toItem(item: CatalogItem): MenuItem {
  return {
    slug: item.slug,
    name: item.name,
    code: item.code ?? null,
    description: item.description ?? null,
    categorySlug: item.categorySlug,
    featured: item.featured ?? false,
    pricingNote: item.pricingNote ?? null,
    image: toImage(catalogImage(item.imageKey)),
    variations: item.variations.map((variation) => ({
      slug: variation.slug,
      name: variation.name,
      shortName: variation.shortName,
      priceCents: variation.priceCents,
    })),
    optionGroups: item.optionGroups.map((group) => ({
      slug: group.slug,
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map(toOption),
    })),
  };
}

/**
 * The menu a customer may actually order from.
 *
 * `active: false` is dropped here, and a category left with nothing in it is
 * dropped with it, because that is exactly what `get_storefront_menu()` does
 * with `is_active`. The two sources are only interchangeable if they hide the
 * same rows, and the rows being hidden are the ones carrying a Foodpanda
 * delivery price that nobody has confirmed for pickup. Shipping those would put
 * a wrong price in front of a customer, which is the one failure a
 * server-authoritative pricing model exists to prevent.
 *
 * `catalogCategories` is the unfiltered list, for the workspace and for tests
 * that need to see what is waiting on a price.
 */
export function staticMenu(): MenuCategory[] {
  return categories
    .map((category) => ({
      slug: category.slug,
      name: category.name,
      blurb: category.blurb,
      items: category.items.filter((item) => item.active !== false).map(toItem),
    }))
    .filter((category) => category.items.length > 0);
}
